import type { Bar, EquityPoint } from "./types"

export function analyzeBars(bars: Bar[]) {
  if (bars.length < 2) throw new Error("至少需要两个交易日才能分析")
  const closes = bars.map((bar) => bar.close)
  const dailyReturns = returns(closes)
  const latest = bars.at(-1)!
  const previous = bars.at(-2)!
  const sma20 = movingAverage(closes, Math.min(20, closes.length))
  const sma60 = movingAverage(closes, Math.min(60, closes.length))
  const avgVolume20 = mean(bars.slice(-20).map((bar) => bar.volume))

  return {
    asOf: latest.date,
    observations: bars.length,
    latestClose: latest.close,
    dailyReturn: latest.close / previous.close - 1,
    periodReturn: latest.close / bars[0]!.close - 1,
    annualizedVolatility: standardDeviation(dailyReturns) * Math.sqrt(252),
    maximumDrawdown: maximumDrawdown(closes),
    sma20,
    sma60,
    rsi14: rsi(closes, Math.min(14, closes.length - 1)),
    volumeRatio20: avgVolume20 === 0 ? null : latest.volume / avgVolume20,
    trend: latest.close > sma20 && sma20 > sma60 ? "up" : latest.close < sma20 && sma20 < sma60 ? "down" : "mixed",
  }
}

export function portfolioMetrics(curve: EquityPoint[], initialCash: number) {
  if (!curve.length) throw new Error("权益曲线不能为空")
  const values = curve.map((point) => point.value)
  const dailyReturns = returns(values)
  const elapsedDays = Math.max(1, (Date.parse(curve.at(-1)!.date) - Date.parse(curve[0]!.date)) / (24 * 60 * 60 * 1000))
  const annualizedVolatility = standardDeviation(dailyReturns) * Math.sqrt(252)
  const annualizedReturn = Math.pow(values.at(-1)! / initialCash, 365.25 / elapsedDays) - 1
  return {
    finalEquity: values.at(-1)!,
    totalReturn: values.at(-1)! / initialCash - 1,
    annualizedReturn,
    annualizedVolatility,
    sharpeRatio: annualizedVolatility === 0 ? null : (mean(dailyReturns) * 252) / annualizedVolatility,
    maximumDrawdown: maximumDrawdown(values),
  }
}

export function movingAverage(values: number[], window: number, end = values.length - 1) {
  if (window <= 0 || end + 1 < window) throw new Error(`计算 ${window} 日均线的数据不足`)
  return mean(values.slice(end + 1 - window, end + 1))
}

export function returns(values: number[]) {
  return values.slice(1).map((value, index) => value / values[index]! - 1)
}

export function maximumDrawdown(values: number[]) {
  const result = values.reduce(
    (state, value) => {
      const peak = Math.max(state.peak, value)
      return { peak, drawdown: Math.min(state.drawdown, value / peak - 1) }
    },
    { peak: values[0]!, drawdown: 0 },
  )
  return result.drawdown
}

function rsi(values: number[], period: number) {
  if (period <= 0 || values.length <= period) return null
  const changes = values
    .slice(-period - 1)
    .slice(1)
    .map((value, index) => value - values.at(-period - 1 + index)!)
  const gains = mean(changes.map((value) => Math.max(0, value)))
  const losses = mean(changes.map((value) => Math.max(0, -value)))
  if (losses === 0) return 100
  return 100 - 100 / (1 + gains / losses)
}

function mean(values: number[]) {
  if (!values.length) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function standardDeviation(values: number[]) {
  if (values.length < 2) return 0
  const average = mean(values)
  return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1))
}
