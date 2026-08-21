import { describe, expect, test } from "bun:test"
import { DEEPTRADING_LEAD_AGENT, isDeepTradingRootSession } from "./page-selection"

describe("DeepTrading page selection", () => {
  test("only enables the dedicated page for the exact root lead agent", () => {
    expect(isDeepTradingRootSession({ agent: DEEPTRADING_LEAD_AGENT })).toBe(true)
    expect(isDeepTradingRootSession({ agent: DEEPTRADING_LEAD_AGENT, parentID: "root" })).toBe(false)
    expect(isDeepTradingRootSession({ agent: "deeptrading/dt-intake" })).toBe(false)
    expect(isDeepTradingRootSession({ agent: "deeptrading/deeptrading-team-lead-copy" })).toBe(false)
    expect(isDeepTradingRootSession(undefined)).toBe(false)
  })
})
