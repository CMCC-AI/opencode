import { describe, expect, test } from "bun:test"
import { runSmaCrossBacktest } from "./backtest"
import { analyzeBars } from "./metrics"
import { normalizeSymbol, parseAlphaVantageRows, parseTushareRows } from "./providers"
import type { Bar } from "./types"

const bars = Array.from({ length: 90 }, (_, index) => {
  const base = index < 30 ? 100 - index * 0.2 : 94 + (index - 30) * 0.8
  return {
    symbol: "TEST",
    date: new Date(Date.UTC(2025, 0, index + 1)).toISOString().slice(0, 10),
    open: base,
    high: base + 1,
    low: base - 1,
    close: base + 0.5,
    volume: 1000 + index,
  } satisfies Bar
})

describe("stock providers", () => {
  test("normalizes common A-share symbols", () => {
    expect(normalizeSymbol("tushare", "600519")).toBe("600519.SH")
    expect(normalizeSymbol("tushare", "000001")).toBe("000001.SZ")
    expect(normalizeSymbol("tushare", "430047")).toBe("430047.BJ")
    expect(normalizeSymbol("alpha_vantage", "aapl")).toBe("AAPL")
  })

  test("parses Tushare tabular responses", () => {
    expect(
      parseTushareRows({ code: 0, data: { fields: ["trade_date", "close"], items: [["20250102", 10.5]] } }),
    ).toEqual([{ trade_date: "20250102", close: 10.5 }])
  })

  test("parses adjusted Alpha Vantage responses", () => {
    const result = parseAlphaVantageRows(
      {
        "Time Series (Daily)": {
          "2025-01-02": {
            "1. open": "10",
            "2. high": "11",
            "3. low": "9",
            "4. close": "10.2",
            "5. adjusted close": "10.1",
            "6. volume": "1234",
          },
        },
      },
      "AAPL",
      "2025-01-01",
      "2025-01-03",
    )
    expect(result[0]?.close).toBe(10.1)
    expect(result[0]?.volume).toBe(1234)
  })
})

describe("stock analytics", () => {
  test("computes technical metrics", () => {
    const result = analyzeBars(bars)
    expect(result.observations).toBe(90)
    expect(result.periodReturn).toBeGreaterThan(0)
    expect(result.maximumDrawdown).toBeLessThanOrEqual(0)
    expect(result.trend).toBe("up")
  })

  test("runs a next-open SMA crossover backtest", () => {
    const result = runSmaCrossBacktest(bars, {
      fastWindow: 5,
      slowWindow: 20,
      initialCash: 100000,
      commissionRate: 0.0003,
      minimumCommission: 5,
      stampDutyRate: 0.0005,
      slippageBps: 5,
      lotSize: 100,
    })
    expect(result.fills.some((fill) => fill.side === "buy")).toBe(true)
    expect(result.metrics.totalReturn).toBeGreaterThan(0)
    expect(result.metrics.maximumDrawdown).toBeLessThanOrEqual(0)
  })
})
