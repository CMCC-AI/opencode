import { describe, expect, test } from "bun:test"
import { isDeepXivMessage } from "./deepxiv-sso"

describe("DeepXiv SSO message trust boundary", () => {
  const frame = {} as Window
  const origin = "https://papers.example.com"
  const event = { origin, source: frame, data: { type: "deeplit:sso:ready", requestId: "a".repeat(64) } }

  test("accepts a message only from the configured iframe", () => {
    expect(isDeepXivMessage(event, origin, frame)).toBe(true)
  })

  test("rejects another origin, port, or window, even with a valid payload", () => {
    expect(isDeepXivMessage({ ...event, origin: "https://evil.example.com" }, origin, frame)).toBe(false)
    expect(isDeepXivMessage({ ...event, origin: `${origin}:444` }, origin, frame)).toBe(false)
    expect(isDeepXivMessage({ ...event, source: {} as Window }, origin, frame)).toBe(false)
    expect(isDeepXivMessage({ ...event, source: null }, origin, undefined)).toBe(false)
  })

  test("rejects malformed messages", () => {
    for (const data of [null, "deeplit:sso:ready", {}, { type: 1 }]) {
      expect(isDeepXivMessage({ ...event, data }, origin, frame)).toBe(false)
    }
  })
})
