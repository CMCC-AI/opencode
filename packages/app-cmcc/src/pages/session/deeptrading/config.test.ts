import { describe, expect, test } from "bun:test"
import { DEEPTRADING_LEAD_AGENT, isDeepTradingRootSession, shouldUseDeepTradingPage } from "./page-selection"

describe("DeepTrading page selection", () => {
  test("only enables the dedicated page for the exact root lead agent", () => {
    expect(isDeepTradingRootSession({ agent: DEEPTRADING_LEAD_AGENT })).toBe(true)
    expect(isDeepTradingRootSession({ agent: DEEPTRADING_LEAD_AGENT, parentID: "root" })).toBe(false)
    expect(isDeepTradingRootSession({ agent: "deeptrading/dt-intake" })).toBe(false)
    expect(isDeepTradingRootSession({ agent: "deeptrading/deeptrading-team-lead-copy" })).toBe(false)
    expect(isDeepTradingRootSession(undefined)).toBe(false)
  })

  test("uses the business agent type while the root session metadata is loading", () => {
    expect(shouldUseDeepTradingPage(undefined, "deeptrading")).toBe(true)
    expect(shouldUseDeepTradingPage({ agent: undefined }, "deeptrading")).toBe(true)
    expect(shouldUseDeepTradingPage({ agent: DEEPTRADING_LEAD_AGENT }, undefined)).toBe(true)
    expect(shouldUseDeepTradingPage({ agent: DEEPTRADING_LEAD_AGENT, parentID: "root" }, "deeptrading")).toBe(false)
    expect(shouldUseDeepTradingPage(undefined, "deepinsight")).toBe(false)
  })
})
