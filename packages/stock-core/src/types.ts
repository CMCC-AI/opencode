export type DataProvider = "baostock" | "akshare" | "westock" | "tushare" | "alpha_vantage"

export type Bar = {
  symbol: string
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
  amount?: number
  adjustmentFactor?: number
}

export type BarSeries = {
  provider: DataProvider
  symbol: string
  adjustment: "qfq" | "provider_adjusted"
  bars: Bar[]
}

export type FetchBarsInput = {
  provider: DataProvider
  symbol: string
  startDate: string
  endDate: string
}

export type BacktestConfig = {
  fastWindow: number
  slowWindow: number
  initialCash: number
  commissionRate: number
  minimumCommission: number
  stampDutyRate: number
  slippageBps: number
  lotSize: number
}

export type Fill = {
  date: string
  side: "buy" | "sell"
  quantity: number
  price: number
  fees: number
  cashAfter: number
  realizedPnl?: number
}

export type EquityPoint = {
  date: string
  value: number
}

export type BacktestResult = ReturnType<typeof import("./backtest").runSmaCrossBacktest>
export type AnalysisResult = ReturnType<typeof import("./metrics").analyzeBars>
