import { describe, expect, test } from "bun:test"
import { parseAnalyzeRequest, parseBacktestRequest, parseCancelChatRequest, parseChatRequest } from "./input"

describe("独立股票产品请求校验", () => {
  test("为 A 股回测补全默认交易参数", () => {
    const result = parseBacktestRequest({
      provider: "tushare",
      symbol: "600519",
      startDate: "2023-01-01",
      endDate: "2026-01-01",
    })
    expect(result.fastWindow).toBe(20)
    expect(result.slowWindow).toBe(60)
    expect(result.lotSize).toBe(100)
  })

  test("拒绝长短均线倒置", () => {
    expect(() =>
      parseBacktestRequest({
        provider: "tushare",
        symbol: "600519",
        startDate: "2023-01-01",
        endDate: "2026-01-01",
        fastWindow: 60,
        slowWindow: 20,
      }),
    ).toThrow("短均线")
  })

  test("拒绝倒置的日期区间", () => {
    expect(() =>
      parseBacktestRequest({
        provider: "tushare",
        symbol: "600519",
        startDate: "2026-01-01",
        endDate: "2025-01-01",
      }),
    ).toThrow("开始日期")
  })

  test("拒绝无效日期和非整数窗口", () => {
    expect(() =>
      parseAnalyzeRequest({ provider: "tushare", symbol: "600519", startDate: "2026-02-30", endDate: "2026-03-01" }),
    ).toThrow("有效日期")
    expect(() =>
      parseBacktestRequest({
        provider: "tushare",
        symbol: "600519",
        startDate: "2025-01-01",
        endDate: "2026-01-01",
        fastWindow: 20.5,
      }),
    ).toThrow("正整数")
  })

  test("限制聊天内容长度", () => {
    expect(() => parseChatRequest({ message: "x".repeat(8_001) })).toThrow("8000")
  })

  test("清理连续问答参数", () => {
    expect(parseChatRequest({ message: " 解释最大回撤 ", sessionId: " abc " })).toEqual({
      message: "解释最大回撤",
      sessionId: "abc",
      requestId: undefined,
      strategyContext: undefined,
      model: undefined,
    })
  })

  test("校验聊天模型", () => {
    expect(
      parseChatRequest({ message: "分析策略", model: { providerID: " opencode ", modelID: " big-pickle " } }),
    ).toMatchObject({
      model: { providerID: "opencode", modelID: "big-pickle" },
    })
    expect(() => parseChatRequest({ message: "分析策略", model: { providerID: "opencode" } })).toThrow("模型 ID")
  })

  test("校验聊天取消请求", () => {
    expect(parseCancelChatRequest({ requestId: " request-1 " })).toEqual({ requestId: "request-1" })
    expect(() => parseCancelChatRequest({})).toThrow("请求 ID")
  })
})
