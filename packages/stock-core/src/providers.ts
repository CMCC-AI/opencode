import type { Bar, BarSeries, DataProvider, FetchBarsInput } from "./types"

type TushareResponse = {
  code?: unknown
  msg?: unknown
  data?: { fields?: unknown; items?: unknown }
}

export async function fetchBars(input: FetchBarsInput): Promise<BarSeries> {
  validateDateRange(input.startDate, input.endDate)
  if (input.provider === "tushare") return fetchTushareBars(input)
  if (input.provider === "alpha_vantage") return fetchAlphaVantageBars(input)
  throw new Error(`${input.provider} 需要通过免费 A 股数据桥获取行情`)
}

export function normalizeSymbol(provider: DataProvider, value: string) {
  const symbol = value.trim().toUpperCase()
  if (!symbol) throw new Error("股票代码不能为空")
  if (provider !== "tushare" || symbol.includes(".")) return symbol
  if (/^920\d{3}$/.test(symbol)) return `${symbol}.BJ`
  if (/^[69]/.test(symbol)) return `${symbol}.SH`
  if (/^[0348]/.test(symbol)) return `${symbol}.${/^[48]/.test(symbol) ? "BJ" : "SZ"}`
  throw new Error(`无法判断 ${value} 所属的 A 股交易所，请使用 000001.SZ 这类完整代码`)
}

export function parseTushareRows(response: TushareResponse) {
  if (response.code !== 0) throw new Error(readProviderMessage(response.msg, "Tushare 请求失败"))
  const fields = response.data?.fields
  const items = response.data?.items
  if (!Array.isArray(fields) || !fields.every((field) => typeof field === "string") || !Array.isArray(items)) {
    throw new Error("Tushare 返回了无法识别的数据结构")
  }
  return items.map((item) => {
    if (!Array.isArray(item)) throw new Error("Tushare 返回了无法识别的数据行")
    return Object.fromEntries(fields.map((field, index) => [field, item[index]]))
  })
}

export function parseAlphaVantageRows(payload: unknown, symbol: string, startDate: string, endDate: string) {
  if (!isRecord(payload)) throw new Error("Alpha Vantage 返回了无法识别的数据结构")
  const message = payload["Error Message"] ?? payload.Information ?? payload.Note
  if (typeof message === "string") throw new Error(`Alpha Vantage 请求失败：${message}`)
  const series = payload["Time Series (Daily)"]
  if (!isRecord(series)) throw new Error("Alpha Vantage 响应中缺少日线数据")

  return Object.entries(series)
    .filter(([date]) => date >= startDate && date <= endDate)
    .map(([date, value]) => {
      if (!isRecord(value)) throw new Error(`Alpha Vantage 在 ${date} 返回了无效数据`)
      const rawClose = numberField(value, "4. close")
      const adjustedClose = numberField(value, "5. adjusted close")
      if (rawClose <= 0 || adjustedClose <= 0) throw new Error(`Alpha Vantage 在 ${date} 返回了无效收盘价`)
      const adjustment = adjustedClose / rawClose
      return {
        symbol,
        date,
        open: numberField(value, "1. open") * adjustment,
        high: numberField(value, "2. high") * adjustment,
        low: numberField(value, "3. low") * adjustment,
        close: adjustedClose,
        volume: numberField(value, "6. volume", "5. volume"),
      } satisfies Bar
    })
    .sort((a, b) => a.date.localeCompare(b.date))
}

async function fetchTushareBars(input: FetchBarsInput): Promise<BarSeries> {
  const token = requiredEnv("TUSHARE_TOKEN")
  const symbol = normalizeSymbol("tushare", input.symbol)
  const params = { ts_code: symbol, start_date: compactDate(input.startDate), end_date: compactDate(input.endDate) }
  const [daily, factors] = await Promise.all([
    tushareRequest(token, "daily", params, "ts_code,trade_date,open,high,low,close,vol,amount"),
    tushareRequest(token, "adj_factor", params, "ts_code,trade_date,adj_factor"),
  ])
  const factorByDate = new Map(
    parseTushareRows(factors).map((row) => [dateField(row, "trade_date"), numericField(row, "adj_factor")]),
  )
  const raw = parseTushareRows(daily)
    .map((row) => ({
      symbol,
      date: dateField(row, "trade_date"),
      open: numericField(row, "open"),
      high: numericField(row, "high"),
      low: numericField(row, "low"),
      close: numericField(row, "close"),
      volume: numericField(row, "vol"),
      amount: numericField(row, "amount"),
      adjustmentFactor: factorByDate.get(dateField(row, "trade_date")),
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
  if (!raw.length) throw new Error(`${symbol} 在所选日期范围内没有行情数据`)

  const latestFactor = raw.at(-1)?.adjustmentFactor
  if (!latestFactor) throw new Error(`${symbol} 缺少复权因子，无法生成一致的回测价格`)
  const bars = raw.map((bar) => {
    if (!bar.adjustmentFactor) throw new Error(`${symbol} 在 ${bar.date} 缺少复权因子`)
    const factor = bar.adjustmentFactor / latestFactor
    return {
      ...bar,
      open: bar.open * factor,
      high: bar.high * factor,
      low: bar.low * factor,
      close: bar.close * factor,
    }
  })
  return { provider: "tushare", symbol, adjustment: "qfq", bars }
}

async function fetchAlphaVantageBars(input: FetchBarsInput): Promise<BarSeries> {
  const symbol = normalizeSymbol("alpha_vantage", input.symbol)
  const url = new URL("https://www.alphavantage.co/query")
  url.searchParams.set("function", "TIME_SERIES_DAILY_ADJUSTED")
  url.searchParams.set("symbol", symbol)
  url.searchParams.set("outputsize", "full")
  url.searchParams.set("apikey", requiredEnv("ALPHA_VANTAGE_API_KEY"))
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) })
  if (!response.ok) throw new Error(`Alpha Vantage HTTP 错误：${response.status} ${response.statusText}`)
  const bars = parseAlphaVantageRows(await response.json(), symbol, input.startDate, input.endDate)
  if (!bars.length) throw new Error(`${symbol} 在所选日期范围内没有行情数据`)
  return { provider: "alpha_vantage", symbol, adjustment: "provider_adjusted", bars }
}

async function tushareRequest(token: string, apiName: string, params: Record<string, string>, fields: string) {
  const response = await fetch("https://api.tushare.pro", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_name: apiName, token, params, fields }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`Tushare HTTP 错误：${response.status} ${response.statusText}`)
  return (await response.json()) as TushareResponse
}

function requiredEnv(name: "TUSHARE_TOKEN" | "ALPHA_VANTAGE_API_KEY") {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`缺少 ${name}，请先在产品服务端配置该环境变量`)
  return value
}

function validateDateRange(startDate: string, endDate: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    throw new Error("日期必须使用 YYYY-MM-DD 格式")
  }
  if (startDate > endDate) throw new Error("开始日期不能晚于结束日期")
}

function compactDate(value: string) {
  return value.replaceAll("-", "")
}

function dateField(row: Record<string, unknown>, key: string) {
  const value = row[key]
  if (typeof value !== "string" || !/^\d{8}$/.test(value)) throw new Error(`数据字段 ${key} 不是有效日期`)
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
}

function numericField(row: Record<string, unknown>, key: string) {
  const value = Number(row[key])
  if (!Number.isFinite(value)) throw new Error(`数据字段 ${key} 不是有效数字`)
  return value
}

function numberField(row: Record<string, unknown>, key: string, fallback?: string) {
  const selected = row[key] ?? (fallback ? row[fallback] : undefined)
  const value = Number(selected)
  if (!Number.isFinite(value)) throw new Error(`数据字段 ${key} 不是有效数字`)
  return value
}

function readProviderMessage(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value : fallback
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
