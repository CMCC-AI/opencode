import { describe, expect, test } from "bun:test"
import { ZHENGQI_LEAD_AGENT, isZhengqiRootSession, shouldUseZhengqiPage } from "./page-selection"

describe("Zhengqi page selection", () => {
  test("only enables the dedicated page for the root lead agent", () => {
    expect(isZhengqiRootSession({ agent: ZHENGQI_LEAD_AGENT })).toBe(true)
    expect(isZhengqiRootSession({ agent: ZHENGQI_LEAD_AGENT, parentID: "root" })).toBe(false)
    expect(shouldUseZhengqiPage({ agent: "build" }, "zhengqi-visit-intel")).toBe(true)
    expect(shouldUseZhengqiPage({ agent: "build", parentID: "root" }, "zhengqi-visit-intel")).toBe(false)
    expect(shouldUseZhengqiPage({ agent: "build" }, undefined, ZHENGQI_LEAD_AGENT)).toBe(true)
  })
})
