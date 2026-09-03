import { describe, expect, test } from "bun:test"
import { SHOPPERS_LEAD_AGENT, isShoppersRootSession, shouldUseShoppersPage } from "./page-selection"

describe("Shoppers Pro page selection", () => {
  test("keeps the dedicated root page after clarification turns switch the session agent", () => {
    expect(isShoppersRootSession({ agent: SHOPPERS_LEAD_AGENT })).toBe(true)
    expect(isShoppersRootSession({ agent: SHOPPERS_LEAD_AGENT, parentID: "root" })).toBe(false)
    expect(shouldUseShoppersPage({ agent: "build" }, "shoppers-pro")).toBe(true)
    expect(shouldUseShoppersPage({ agent: "build", parentID: "root" }, "shoppers-pro")).toBe(false)
    expect(shouldUseShoppersPage({ agent: "build" }, undefined, SHOPPERS_LEAD_AGENT)).toBe(true)
  })
})
