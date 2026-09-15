import { describe, expect, test } from "bun:test"
import { runSmaCrossBacktest } from "./backtest"
import { assessBacktest, runSmaSensitivity } from "./evaluation"
import { normalizeSymbol, parseAlphaVantageRows, parseTushareRows } from "./providers"
import type { Bar } from "./types"

describe("股票数据标准化", () => {
  test("补全 A 股交易所后缀", () => {
    expect(normalizeSymbol("tushare", "600519")).toBe("600519.SH")
    expect(normalizeSymbol("tushare", "000001")).toBe("000001.SZ")
    expect(normalizeSymbol("tushare", "430047")).toBe("430047.BJ")
    expect(normalizeSymbol("tushare", "920080")).toBe("920080.BJ")
  })

  test("解析 Tushare 行列结构", () => {
    expect(parseTushareRows({ code: 0, data: { fields: ["trade_date", "close"], items: [["20260102", 10]] } })).toEqual(
      [{ trade_date: "20260102", close: 10 }],
    )
  })

  test("解析 Alpha Vantage 复权行情", () => {
    const bars = parseAlphaVantageRows(
      {
        "Time Series (Daily)": {
          "2026-01-02": {
            "1. open": "10",
            "2. high": "11",
            "3. low": "9",
            "4. close": "10",
            "5. adjusted close": "10.5",
            "6. volume": "1000",
          },
        },
      },
      "AAPL",
      "2026-01-01",
      "2026-01-03",
    )
    expect(bars[0]?.close).toBe(10.5)
    expect(bars[0]?.open).toBeCloseTo(10.5)
    expect(bars[0]?.high).toBeCloseTo(11.55)
    expect(bars[0]?.low).toBeCloseTo(9.45)
  })
})

describe("双均线回测", () => {
  test("使用前一日信号并在次日开盘成交", () => {
    const closes = [10, 10, 10, 12, 13, 8, 7]
    const bars: Bar[] = closes.map((close, index) => ({
      symbol: "TEST",
      date: `2026-01-${String(index + 1).padStart(2, "0")}`,
      open: close,
      high: close,
      low: close,
      close,
      volume: 1000,
    }))
    const result = runSmaCrossBacktest(bars, {
      fastWindow: 2,
      slowWindow: 3,
      initialCash: 10_000,
      commissionRate: 0,
      minimumCommission: 0,
      stampDutyRate: 0,
      slippageBps: 0,
      lotSize: 1,
    })
    expect(result.fills.map((fill) => [fill.date, fill.side])).toEqual([
      ["2026-01-05", "buy"],
      ["2026-01-07", "sell"],
    ])
    expect(result.period.start).toBe("2026-01-04")
    expect(result.period.tradingDays).toBe(4)
  })

  test("生成参数邻域敏感性结果", () => {
    const bars: Bar[] = Array.from({ length: 180 }, (_, index) => ({
      symbol: "TEST",
      date: new Date(Date.UTC(2025, 0, index + 1)).toISOString().slice(0, 10),
      open: 10 + index * 0.03,
      high: 10.2 + index * 0.03,
      low: 9.8 + index * 0.03,
      close: 10 + index * 0.03,
      volume: 1000,
    }))
    const config = {
      fastWindow: 20,
      slowWindow: 60,
      initialCash: 10_000,
      commissionRate: 0,
      minimumCommission: 0,
      stampDutyRate: 0,
      slippageBps: 0,
      lotSize: 1,
    }
    const points = runSmaSensitivity(bars, config)
    expect(points).toHaveLength(9)
    expect(points.some((point) => point.fastWindow === 20 && point.slowWindow === 60)).toBe(true)
  })

  test("样本不足时不会把策略判定为可行", () => {
    const bars: Bar[] = Array.from({ length: 90 }, (_, index) => ({
      symbol: "TEST",
      date: new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10),
      open: 10 + index * 0.01,
      high: 11 + index * 0.01,
      low: 9 + index * 0.01,
      close: 10 + index * 0.01,
      volume: 1000,
    }))
    const result = runSmaCrossBacktest(bars, {
      fastWindow: 5,
      slowWindow: 20,
      initialCash: 10_000,
      commissionRate: 0,
      minimumCommission: 0,
      stampDutyRate: 0,
      slippageBps: 0,
      lotSize: 1,
    })
    expect(assessBacktest(result, runSmaSensitivity(bars, result.config)).rating).toBe("insufficient")
  })

  test("参数邻域不稳定时不会给出积极评级", () => {
    const bars: Bar[] = Array.from({ length: 40 }, (_, index) => ({
      symbol: "TEST",
      date: new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10),
      open: 10 + index * 0.01,
      high: 11 + index * 0.01,
      low: 9 + index * 0.01,
      close: 10 + index * 0.01,
      volume: 1000,
    }))
    const base = runSmaCrossBacktest(bars, {
      fastWindow: 5,
      slowWindow: 20,
      initialCash: 10_000,
      commissionRate: 0,
      minimumCommission: 0,
      stampDutyRate: 0,
      slippageBps: 0,
      lotSize: 1,
    })
    const result = {
      ...base,
      period: { ...base.period, tradingDays: 600 },
      metrics: {
        ...base.metrics,
        annualizedReturn: 0.12,
        excessReturn: 0.05,
        maximumDrawdown: -0.1,
        sharpeRatio: 1,
        completedTrades: 12,
      },
    }
    const sensitivity = runSmaSensitivity(bars, base.config).map((point, index) => ({
      ...point,
      totalReturn: index === 0 ? 0.1 : -0.1,
    }))

    const assessment = assessBacktest(result, sensitivity)
    expect(assessment.rating).toBe("fragile")
    expect(assessment.checks.find((check) => check.id === "stability")?.pass).toBe(false)
  })

  test("拒绝非整数均线窗口", () => {
    const bars: Bar[] = Array.from({ length: 10 }, (_, index) => ({
      symbol: "TEST",
      date: `2026-01-${String(index + 1).padStart(2, "0")}`,
      open: 10,
      high: 10,
      low: 10,
      close: 10,
      volume: 1000,
    }))
    expect(() =>
      runSmaCrossBacktest(bars, {
        fastWindow: 2.5,
        slowWindow: 5,
        initialCash: 10_000,
        commissionRate: 0,
        minimumCommission: 0,
        stampDutyRate: 0,
        slippageBps: 0,
        lotSize: 1,
      }),
    ).toThrow("整数")
  })
})
