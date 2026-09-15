import type { AnalyzeRequest, BacktestRequest, CancelChatRequest, ChatRequest } from "../src/lib/contracts"

const defaults = {
  fastWindow: 20,
  slowWindow: 60,
  initialCash: 100_000,
  commissionRate: 0.0003,
  minimumCommission: 5,
  stampDutyRate: 0.0005,
  slippageBps: 5,
  lotSize: 100,
} as const

export function parseBacktestRequest(value: unknown): BacktestRequest {
  const input = record(value)
  const provider = providerField(input.provider)
  const result = {
    provider,
    symbol: stringField(input.symbol, "股票代码", 32),
    startDate: dateField(input.startDate, "开始日期"),
    endDate: dateField(input.endDate, "结束日期"),
    fastWindow: integerField(input.fastWindow, defaults.fastWindow, "短均线", 5_000),
    slowWindow: integerField(input.slowWindow, defaults.slowWindow, "长均线", 5_000),
    initialCash: numberField(input.initialCash, defaults.initialCash, "初始资金"),
    commissionRate: numberField(input.commissionRate, defaults.commissionRate, "佣金率"),
    minimumCommission: numberField(input.minimumCommission, defaults.minimumCommission, "最低佣金"),
    stampDutyRate: numberField(input.stampDutyRate, defaults.stampDutyRate, "印花税率"),
    slippageBps: numberField(input.slippageBps, defaults.slippageBps, "滑点"),
    lotSize: numberField(input.lotSize, provider === "alpha_vantage" ? 1 : defaults.lotSize, "交易单位"),
  }
  if (result.fastWindow <= 0 || result.fastWindow >= result.slowWindow)
    throw new Error("均线窗口必须满足 0 < 短均线 < 长均线")
  if (result.startDate > result.endDate) throw new Error("开始日期不能晚于结束日期")
  if (result.initialCash <= 0) throw new Error("初始资金必须大于 0")
  if (result.initialCash > 1_000_000_000_000) throw new Error("初始资金超出允许范围")
  if (!Number.isInteger(result.lotSize) || result.lotSize <= 0) throw new Error("交易单位必须是正整数")
  if (
    [result.commissionRate, result.minimumCommission, result.stampDutyRate, result.slippageBps].some((item) => item < 0)
  ) {
    throw new Error("费用和滑点不能为负数")
  }
  if (result.commissionRate > 0.1 || result.stampDutyRate > 0.1) throw new Error("佣金率和印花税率不能超过 10%")
  if (result.minimumCommission > 1_000_000) throw new Error("最低佣金超出允许范围")
  if (result.slippageBps > 10_000) throw new Error("滑点不能超过 10000 bps")
  if (result.lotSize > 1_000_000) throw new Error("交易单位超出允许范围")
  return result
}

export function parseAnalyzeRequest(value: unknown): AnalyzeRequest {
  const input = record(value)
  const result = {
    provider: providerField(input.provider),
    symbol: stringField(input.symbol, "股票代码", 32),
    startDate: dateField(input.startDate, "开始日期"),
    endDate: dateField(input.endDate, "结束日期"),
  }
  if (result.startDate > result.endDate) throw new Error("开始日期不能晚于结束日期")
  return result
}

export function parseChatRequest(value: unknown): ChatRequest {
  const input = record(value)
  return {
    message: stringField(input.message, "问题", 8_000),
    sessionId: optionalString(input.sessionId, 128),
    requestId: optionalString(input.requestId, 128),
    strategyContext: optionalString(input.strategyContext, 64_000),
    model: optionalModel(input.model),
  }
}

function optionalModel(value: unknown) {
  if (value === undefined || value === null) return undefined
  const input = record(value)
  return {
    providerID: stringField(input.providerID, "模型提供商", 128),
    modelID: stringField(input.modelID, "模型 ID", 256),
  }
}

export function parseCancelChatRequest(value: unknown): CancelChatRequest {
  return { requestId: stringField(record(value).requestId, "请求 ID", 128) }
}

function record(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("请求体必须是 JSON 对象")
  return value as Record<string, unknown>
}

function providerField(value: unknown): BacktestRequest["provider"] {
  if (value === "baostock" || value === "akshare" || value === "westock" || value === "tushare" || value === "alpha_vantage") return value
  throw new Error("数据源必须是 baostock、akshare、westock、tushare 或 alpha_vantage")
}

function stringField(value: unknown, label: string, maximumLength = 256) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label}不能为空`)
  const result = value.trim()
  if (result.length > maximumLength) throw new Error(`${label}不能超过 ${maximumLength} 个字符`)
  return result
}

function optionalString(value: unknown, maximumLength: number) {
  if (typeof value !== "string" || !value.trim()) return undefined
  return stringField(value, "可选字段", maximumLength)
}

function dateField(value: unknown, label: string) {
  const result = stringField(value, label)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) throw new Error(`${label}必须使用 YYYY-MM-DD 格式`)
  const timestamp = Date.parse(`${result}T00:00:00Z`)
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== result) {
    throw new Error(`${label}不是有效日期`)
  }
  return result
}

function numberField(value: unknown, fallback: number, label: string) {
  if (value === undefined || value === null || value === "") return fallback
  const result = Number(value)
  if (!Number.isFinite(result)) throw new Error(`${label}必须是有效数字`)
  return result
}

function integerField(value: unknown, fallback: number, label: string, maximum: number) {
  const result = numberField(value, fallback, label)
  if (!Number.isInteger(result) || result <= 0) throw new Error(`${label}必须是正整数`)
  if (result > maximum) throw new Error(`${label}不能超过 ${maximum}`)
  return result
}
