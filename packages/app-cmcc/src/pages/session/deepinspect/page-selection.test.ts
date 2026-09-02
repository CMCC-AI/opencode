import { describe, expect, test } from "bun:test"
import { DEEPINSPECT_LEAD_AGENT, isDeepInspectRootSession, shouldUseDeepInspectPage } from "./page-selection"

describe("DeepInspect page selection", () => {
  test("only enables the dedicated page for the root lead agent", () => {
    expect(isDeepInspectRootSession({ agent: DEEPINSPECT_LEAD_AGENT })).toBe(true)
    expect(isDeepInspectRootSession({ agent: DEEPINSPECT_LEAD_AGENT, parentID: "root" })).toBe(false)
    expect(shouldUseDeepInspectPage({ agent: "build" }, "deepinspect")).toBe(true)
    expect(shouldUseDeepInspectPage({ agent: "build", parentID: "root" }, "deepinspect")).toBe(false)
    expect(shouldUseDeepInspectPage({ agent: "build" }, undefined, DEEPINSPECT_LEAD_AGENT)).toBe(true)
  })
})
