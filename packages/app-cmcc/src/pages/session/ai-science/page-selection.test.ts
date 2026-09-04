import { describe, expect, test } from "bun:test"
import {
  AI_SCIENCE_AGENT_TYPE,
  AI_SCIENCE_LEAD_AGENT,
  isAiScienceRootSession,
  shouldUseAiSciencePage,
} from "./page-selection"

describe("AI for Science page selection", () => {
  test("only enables the dedicated page for a root team session", () => {
    expect(isAiScienceRootSession({ agent: AI_SCIENCE_LEAD_AGENT })).toBe(true)
    expect(isAiScienceRootSession({ agent: AI_SCIENCE_LEAD_AGENT, parentID: "root" })).toBe(false)
    expect(shouldUseAiSciencePage({ agent: "build" }, AI_SCIENCE_AGENT_TYPE)).toBe(true)
    expect(shouldUseAiSciencePage({ agent: "build", parentID: "root" }, AI_SCIENCE_AGENT_TYPE)).toBe(false)
    expect(shouldUseAiSciencePage({ agent: "build" }, undefined, AI_SCIENCE_LEAD_AGENT)).toBe(true)
  })
})
