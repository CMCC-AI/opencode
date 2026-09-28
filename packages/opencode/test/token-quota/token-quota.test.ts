import { describe, expect, test } from "bun:test"
import { Usage } from "@opencode-ai/llm"
import { TokenQuota } from "@/token-quota/token-quota"

describe("token quota usage", () => {
  test("uses provider total and keeps the billing dimensions", () => {
    expect(
      TokenQuota.normalizeUsage(
        new Usage({
          nonCachedInputTokens: 100,
          outputTokens: 40,
          reasoningTokens: 10,
          cacheReadInputTokens: 20,
          cacheWriteInputTokens: 5,
          totalTokens: 165,
        }),
      ),
    ).toEqual({
      input: 100,
      output: 40,
      reasoning: 10,
      cacheRead: 20,
      cacheWrite: 5,
      total: 165,
    })
  })

  test("derives total without double-counting reasoning", () => {
    expect(
      TokenQuota.normalizeUsage(
        new Usage({
          nonCachedInputTokens: 100,
          outputTokens: 40,
          reasoningTokens: 10,
          cacheReadInputTokens: 20,
          cacheWriteInputTokens: 5,
        }),
      ).total,
    ).toBe(165)
  })

  test("sanitizes invalid provider values", () => {
    expect(
      TokenQuota.normalizeUsage(
        new Usage({
          nonCachedInputTokens: -1,
          outputTokens: Number.NaN,
          totalTokens: Number.POSITIVE_INFINITY,
        }),
      ),
    ).toEqual({ input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0, total: 0 })
  })
})
