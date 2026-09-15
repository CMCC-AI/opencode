import { resolve } from "node:path"
import type { Bar, BarSeries, DataProvider } from "@opencode-ai/stock-core"

const pythonRoot = resolve(import.meta.dir, "../python")
const executable = resolve(pythonRoot, ".venv/bin/python")
const bridge = resolve(pythonRoot, "market_data.py")
const proxyEnvironmentVariables = new Set(["http_proxy", "https_proxy", "all_proxy", "no_proxy"])

export async function fetchFreeBars(input: {
  provider: Extract<DataProvider, "baostock" | "akshare" | "westock">
  symbol: string
  startDate: string
  endDate: string
}): Promise<BarSeries> {
  const process = Bun.spawn(
    [
      executable,
      bridge,
      "bars",
      "--provider",
      input.provider,
      "--symbol",
      input.symbol,
      "--start-date",
      input.startDate,
      "--end-date",
      input.endDate,
    ],
    {
      cwd: pythonRoot,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...Object.fromEntries(
          Object.entries(Bun.env).filter(
            ([key, value]) => value !== undefined && !proxyEnvironmentVariables.has(key.toLowerCase()),
          ),
        ),
        PYTHONUNBUFFERED: "1",
        NO_PROXY: "*",
        no_proxy: "*",
      },
    },
  )
  const timeout = setTimeout(() => process.kill(), 45_000)
  const [stdout, stderr, status] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]).finally(() => clearTimeout(timeout))
  if (status !== 0) throw new Error(stderr.trim() || stdout.trim() || "免费行情数据进程失败")
  const rows: unknown = JSON.parse(stdout)
  if (!Array.isArray(rows) || !rows.length) throw new Error("免费行情数据为空")
  const bars = rows.map(parseBar)
  return { provider: input.provider, symbol: bars[0]!.symbol, adjustment: "qfq", bars }
}

function parseBar(value: unknown): Bar {
  if (typeof value !== "object" || value === null) throw new Error("免费行情数据行格式错误")
  const row = value as Record<string, unknown>
  return {
    symbol: requiredString(row.code, "股票代码"),
    date: requiredString(row.date, "交易日期"),
    open: requiredNumber(row.open, "开盘价"),
    high: requiredNumber(row.high, "最高价"),
    low: requiredNumber(row.low, "最低价"),
    close: requiredNumber(row.close, "收盘价"),
    volume: requiredNumber(row.volume, "成交量"),
    amount: optionalNumber(row.amount),
  }
}

function requiredString(value: unknown, label: string) {
  if (typeof value !== "string" || !value) throw new Error(`${label}格式错误`)
  return value
}

function requiredNumber(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${label}格式错误`)
  return value
}

function optionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}
