import { movingAverage, portfolioMetrics } from "./metrics"
import type { BacktestConfig, Bar, EquityPoint, Fill } from "./types"

export function runSmaCrossBacktest(bars: Bar[], config: BacktestConfig) {
  validateConfig(bars, config)
  const closes = bars.map((bar) => bar.close)
  const fills: Fill[] = []
  const curve: EquityPoint[] = []
  const closedTradeReturns: number[] = []
  let cash = config.initialCash
  let shares = 0
  let entryCost = 0
  let exposedDays = 0

  bars.forEach((bar, index) => {
    if (index > 0 && index >= config.slowWindow) {
      const signalIndex = index - 1
      const shouldHold =
        movingAverage(closes, config.fastWindow, signalIndex) > movingAverage(closes, config.slowWindow, signalIndex)

      if (shouldHold && shares === 0) {
        const price = bar.open * (1 + config.slippageBps / 10_000)
        const quantity = affordableQuantity(cash, price, config)
        if (quantity > 0) {
          const notional = quantity * price
          const fees = commission(notional, config)
          cash -= notional + fees
          shares = quantity
          entryCost = notional + fees
          fills.push({ date: bar.date, side: "buy", quantity, price, fees, cashAfter: cash })
        }
      }

      if (!shouldHold && shares > 0) {
        const price = bar.open * (1 - config.slippageBps / 10_000)
        const notional = shares * price
        const fees = commission(notional, config) + notional * config.stampDutyRate
        const proceeds = notional - fees
        const realizedPnl = proceeds - entryCost
        cash += proceeds
        closedTradeReturns.push(realizedPnl / entryCost)
        fills.push({ date: bar.date, side: "sell", quantity: shares, price, fees, cashAfter: cash, realizedPnl })
        shares = 0
        entryCost = 0
      }
    }

    if (shares > 0) exposedDays++
    curve.push({ date: bar.date, value: cash + shares * bar.close })
  })

  const firstExecutionBar = bars[config.slowWindow]!
  const evaluationCurve = curve.slice(config.slowWindow)
  const metrics = portfolioMetrics(evaluationCurve, config.initialCash)
  const benchmarkReturn = bars.at(-1)!.close / firstExecutionBar.open - 1
  return {
    strategy: "sma_cross" as const,
    config,
    period: { start: firstExecutionBar.date, end: bars.at(-1)!.date, tradingDays: evaluationCurve.length },
    metrics: {
      ...metrics,
      benchmarkReturn,
      excessReturn: metrics.totalReturn - benchmarkReturn,
      completedTrades: closedTradeReturns.length,
      winRate: closedTradeReturns.length
        ? closedTradeReturns.filter((value) => value > 0).length / closedTradeReturns.length
        : null,
      exposure: exposedDays / evaluationCurve.length,
    },
    position: { cash, shares, marketValue: shares * bars.at(-1)!.close },
    fills,
    equityCurve: sampleCurve(evaluationCurve, 100),
    assumptions: [
      "信号使用当日收盘数据，并在下一交易日开盘成交",
      "行情使用数据源提供的复权价格，现金分红不再单独入账",
      "手续费、卖出印花税、滑点和交易单位使用本次参数",
      "整个回测区间使用同一组费用参数，尚未按历史日期切换税费规则",
      "夏普比率按零无风险利率和每年 252 个交易日计算",
      "尚未模拟涨跌停封单、停牌后的排队成交、市场冲击和流动性容量",
    ],
  }
}

function affordableQuantity(cash: number, price: number, config: BacktestConfig) {
  const lot = config.lotSize
  const estimate = Math.floor((cash - config.minimumCommission) / (price * (1 + config.commissionRate)) / lot) * lot
  if (estimate <= 0) return 0
  const cost = estimate * price + commission(estimate * price, config)
  if (cost <= cash) return estimate
  return Math.max(0, estimate - lot)
}

function commission(notional: number, config: BacktestConfig) {
  return Math.max(config.minimumCommission, notional * config.commissionRate)
}

function sampleCurve(curve: EquityPoint[], limit: number) {
  if (curve.length <= limit) return curve
  const step = (curve.length - 1) / (limit - 1)
  return Array.from({ length: limit }, (_, index) => curve[Math.round(index * step)]!)
}

function validateConfig(bars: Bar[], config: BacktestConfig) {
  if (!Number.isInteger(config.fastWindow) || !Number.isInteger(config.slowWindow)) {
    throw new Error("均线窗口必须是正整数")
  }
  if (config.fastWindow <= 0 || config.slowWindow <= config.fastWindow) {
    throw new Error("均线窗口必须满足 0 < fastWindow < slowWindow")
  }
  if (bars.length <= config.slowWindow) throw new Error(`至少需要 ${config.slowWindow + 1} 个交易日的数据`)
  if (!Number.isFinite(config.initialCash) || config.initialCash <= 0)
    throw new Error("初始资金必须是大于 0 的有限数值")
  if (config.lotSize <= 0 || !Number.isInteger(config.lotSize)) throw new Error("交易单位必须是正整数")
  if (
    [config.commissionRate, config.minimumCommission, config.stampDutyRate, config.slippageBps].some(
      (value) => !Number.isFinite(value) || value < 0,
    )
  ) {
    throw new Error("费用与滑点参数不能为负数")
  }
}
