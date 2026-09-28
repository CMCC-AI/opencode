import { describe, expect, test } from "bun:test"
import {
  CMCC_RESEARCH_EXPERT_ID,
  cmccResearchDemoExpertVisible,
  cmccResearchDemoSessionVisible,
} from "./research-demo"

describe("科研限额演示", () => {
  test("仅显示科研专家团", () => {
    expect(cmccResearchDemoExpertVisible(CMCC_RESEARCH_EXPERT_ID)).toBe(true)
    expect(cmccResearchDemoExpertVisible("deeptrading")).toBe(false)
  })

  test("历史任务仅保留主会话与科研专家团", () => {
    expect(cmccResearchDemoSessionVisible({ agentType: "deepinsight" })).toBe(true)
    expect(cmccResearchDemoSessionVisible({ agentType: CMCC_RESEARCH_EXPERT_ID })).toBe(true)
    expect(cmccResearchDemoSessionVisible({ agentType: "deeptrading", teamExpertID: "deeptrading" })).toBe(false)
    expect(cmccResearchDemoSessionVisible({ agentType: "deepinsight", teamExpertID: "deepinsight" })).toBe(false)
  })
})
