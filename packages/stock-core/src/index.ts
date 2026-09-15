export { runSmaCrossBacktest } from "./backtest"
export { assessBacktest, runSmaSensitivity } from "./evaluation"
export { analyzeBars, maximumDrawdown, movingAverage, portfolioMetrics, returns } from "./metrics"
export { fetchBars, normalizeSymbol, parseAlphaVantageRows, parseTushareRows } from "./providers"
export type {
  AnalysisResult,
  BacktestConfig,
  BacktestResult,
  Bar,
  BarSeries,
  DataProvider,
  EquityPoint,
  FetchBarsInput,
  Fill,
} from "./types"
export type { FeasibilityAssessment, FeasibilityCheck, SensitivityPoint } from "./evaluation"
