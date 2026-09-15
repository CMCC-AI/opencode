import type {
  AnalysisResult,
  BacktestResult,
  DataProvider,
  FeasibilityAssessment,
  SensitivityPoint,
} from "@opencode-ai/stock-core"

export type BacktestRequest = {
  provider: DataProvider
  symbol: string
  startDate: string
  endDate: string
  fastWindow: number
  slowWindow: number
  initialCash: number
  commissionRate: number
  minimumCommission: number
  stampDutyRate: number
  slippageBps: number
  lotSize: number
}

export type MarketDataMeta = {
  provider: DataProvider
  symbol: string
  adjustment: "qfq" | "provider_adjusted"
}

export type BacktestResponse = {
  data: MarketDataMeta
  result: BacktestResult
  evaluation: FeasibilityAssessment
  sensitivity: SensitivityPoint[]
  disclaimer: string
}

export type AnalyzeRequest = Pick<BacktestRequest, "provider" | "symbol" | "startDate" | "endDate">

export type AnalyzeResponse = {
  data: MarketDataMeta
  result: AnalysisResult
  disclaimer: string
}

export type ChatRequest = {
  message: string
  sessionId?: string
  requestId?: string
  strategyContext?: string
  model?: ModelReference
}

export type ChatResponse = {
  sessionId: string
  answer: string
  artifact?: StrategyArtifact
}

export type StrategyArtifact = {
  title: string
  htmlUrl: string
  jsonUrl: string
  generatedAt: string
  auditStatus: "pass" | "warn" | "fail"
  auditSummary: string
}

export type CancelChatRequest = { requestId: string }
export type CancelChatResponse = { ok: true }

export type ModelReference = {
  providerID: string
  modelID: string
}

export type ModelOption = ModelReference & {
  id: string
  name: string
  providerName: string
  free: boolean
}

export type ModelsResponse = {
  models: ModelOption[]
  defaultModelId?: string
}

export type HealthResponse = {
  ok: true
  providers: { baostock: boolean; akshare: boolean; westock: boolean; tushare: boolean; alphaVantage: boolean }
  opencode: { configured: boolean }
}

export type ApiErrorResponse = { error: string }
