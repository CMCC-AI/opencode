import { describe, expect, test } from "bun:test"
import {
  CMCC_CASE_CATEGORIES,
  cmccCaseCategoryByAgentType,
  cmccCaseManagementAllowed,
  cmccCasePublishingAllowed,
  formatCaseCharacterCount,
} from "./cmcc-cases"

describe("CMCC case categories", () => {
  test("contains all seven case agents", () => {
    expect(CMCC_CASE_CATEGORIES).toHaveLength(7)
    expect(cmccCaseCategoryByAgentType("deepgeo")?.label).toBe("AI+位置")
    expect(cmccCaseCategoryByAgentType("deepcampaign")?.label).toBe("AI+位置")
    expect(cmccCaseCategoryByAgentType("deeptrading")?.code).toBe("finance")
    expect(cmccCaseCategoryByAgentType("ai-for-science-team")?.code).toBe("science")
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
    expect(cmccCasePublishingAllowed(true, "ai-for-science-team")).toBe(true)
  })

  test("allows case management only for whitelisted users", () => {
    expect(cmccCaseManagementAllowed(true)).toBe(true)
    expect(cmccCaseManagementAllowed(false)).toBe(false)
    expect(cmccCaseManagementAllowed(undefined)).toBe(false)
  })
})
