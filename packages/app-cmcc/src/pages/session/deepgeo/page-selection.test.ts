import { describe, expect, test } from "bun:test"
import { DEEPGEO_LEAD_AGENT, shouldUseDeepGeoPage } from "./page-selection"

describe("DeepGeo page selection", () => {
  test("selects only the root DeepGeo session", () => {
    expect(shouldUseDeepGeoPage({ agent: DEEPGEO_LEAD_AGENT, parentID: undefined }, undefined)).toBe(true)
    expect(shouldUseDeepGeoPage({ agent: "build", parentID: undefined }, "deepgeo")).toBe(true)
    expect(shouldUseDeepGeoPage({ agent: "build", parentID: "root" }, "deepgeo")).toBe(false)
  })

  test("keeps the page after a follow-up changes the current message agent", () => {
    expect(shouldUseDeepGeoPage({ agent: "build", parentID: undefined }, undefined, DEEPGEO_LEAD_AGENT)).toBe(true)
  })
})
