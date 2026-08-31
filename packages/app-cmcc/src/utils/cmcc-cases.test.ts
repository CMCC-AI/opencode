import { describe, expect, test } from "bun:test"
import {
  CMCC_CASE_CATEGORIES,
  cmccCaseCategoryByAgentType,
  cmccCasePublishingAllowed,
  formatCaseCharacterCount,
} from "./cmcc-cases"

describe("CMCC case categories", () => {
  test("contains all seven case agents", () => {
    expect(CMCC_CASE_CATEGORIES).toHaveLength(7)
    expect(cmccCaseCategoryByAgentType("deepcampaign")?.label).toBe("AI+营销")
    expect(cmccCaseCategoryByAgentType("deeptrading")?.code).toBe("finance")
  })

  test("formats report character counts", () => {
    expect(formatCaseCharacterCount(820)).toBe("820字")
    expect(formatCaseCharacterCount(3_100)).toBe("3.1千字")
    expect(formatCaseCharacterCount(31_000)).toBe("3.1万字")
  })

  test("allows publishing only for whitelisted users and supported agents", () => {
    expect(cmccCasePublishingAllowed(true, "deeptrading")).toBe(true)
    expect(cmccCasePublishingAllowed(false, "deeptrading")).toBe(false)
    expect(cmccCasePublishingAllowed(undefined, "deeptrading")).toBe(false)
    expect(cmccCasePublishingAllowed(true, "unsupported-agent")).toBe(false)
  })
})
