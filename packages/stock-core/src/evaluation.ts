import { runSmaCrossBacktest } from "./backtest"
import type { BacktestConfig, BacktestResult, Bar } from "./types"

export type FeasibilityCheck = {
  id: "sample" | "trades" | "return" | "excess" | "drawdown" | "sharpe" | "stability"
  label: string
  pass: boolean
  observed: number | null
  threshold: string
}

export type FeasibilityAssessment = {
  rating: "insufficient" | "fragile" | "promising"
  score: number
  total: number
  summary: string
  checks: FeasibilityCheck[]
}

export type SensitivityPoint = {
  fastWindow: number
  slowWindow: number
  totalReturn: number
  annualizedReturn: number
  maximumDrawdown: number
  sharpeRatio: number | null
  completedTrades: number
}

export function assessBacktest(result: BacktestResult, sensitivity: SensitivityPoint[]): FeasibilityAssessment {
  const metrics = result.metrics
  const profitableNeighbors = sensitivity.length
    ? sensitivity.filter((point) => point.totalReturn > 0).length / sensitivity.length
    : null
  const checks: FeasibilityCheck[] = [
    {
      id: "sample",
      label: "样本覆盖至少约 2 年",
      pass: result.period.tradingDays >= 504,
      observed: result.period.tradingDays,
      threshold: "≥ 504 个交易日",
    },
    {
      id: "trades",
      label: "完整交易数量足以观察",
      pass: metrics.completedTrades >= 8,
      observed: metrics.completedTrades,
      threshold: "≥ 8 笔",
    },
    {
      id: "return",
      label: "年化收益为正",
      pass: metrics.annualizedReturn > 0,
      observed: metrics.annualizedReturn,
      threshold: "> 0%",
    },
    {
      id: "excess",
      label: "跑赢买入持有基准",
      pass: metrics.excessReturn > 0,
      observed: metrics.excessReturn,
      threshold: "> 0%",
    },
    {
      id: "drawdown",
      label: "最大回撤处于可控区间",
      pass: metrics.maximumDrawdown >= -0.3,
      observed: metrics.maximumDrawdown,
      threshold: "≥ -30%",
    },
    {
      id: "sharpe",
      label: "风险调整后收益有效",
      pass: metrics.sharpeRatio !== null && metrics.sharpeRatio >= 0.5,
      observed: metrics.sharpeRatio,
      threshold: "≥ 0.50",
    },
    {
      id: "stability",
      label: "邻近参数多数保持盈利",
      pass: profitableNeighbors !== null && profitableNeighbors >= 2 / 3,
      observed: profitableNeighbors,
      threshold: "≥ 66.67%",
    },
  ]
  const score = checks.filter((check) => check.pass).length
  const insufficient = !checks[0]!.pass || !checks[1]!.pass
  if (insufficient) {
    return {
      rating: "insufficient",
      score,
      total: checks.length,
      summary: "当前样本或交易次数不足，暂时不能判断策略是否稳定。建议扩大区间和股票范围。",
      checks,
    }
  }
  if (score < 6 || !checks.at(-1)!.pass) {
    return {
      rating: "fragile",
      score,
      total: checks.length,
      summary: "策略在当前样本中的证据偏弱或参数邻域不稳定，进入样本外测试前应先检查规则和成本敏感性。",
      checks,
    }
  }
  return {
    rating: "promising",
    score,
    total: checks.length,
    summary: "策略在当前样本中具备继续研究的价值，但仍需通过参数稳定性、样本外和多标的验证，不能直接用于实盘。",
    checks,
  }
}

export function runSmaSensitivity(bars: Bar[], config: BacktestConfig): SensitivityPoint[] {
  const fastWindows = neighbors(config.fastWindow, 0.75, 1.25, 2)
  const slowWindows = neighbors(config.slowWindow, 0.8, 1.2, 3)
  return fastWindows.flatMap((fastWindow) =>
    slowWindows
      .filter((slowWindow) => fastWindow < slowWindow && bars.length > slowWindow)
      .map((slowWindow) => {
        const result = runSmaCrossBacktest(bars, { ...config, fastWindow, slowWindow })
        return {
          fastWindow,
          slowWindow,
          totalReturn: result.metrics.totalReturn,
          annualizedReturn: result.metrics.annualizedReturn,
          maximumDrawdown: result.metrics.maximumDrawdown,
          sharpeRatio: result.metrics.sharpeRatio,
          completedTrades: result.metrics.completedTrades,
        }
      }),
  )
}

function neighbors(value: number, lower: number, upper: number, minimum: number) {
  return [
    ...new Set([Math.max(minimum, Math.round(value * lower)), value, Math.max(minimum, Math.round(value * upper))]),
  ].sort((a, b) => a - b)
}
