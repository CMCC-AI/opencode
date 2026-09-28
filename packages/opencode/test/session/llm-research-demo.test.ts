import { describe, expect, test } from "bun:test"
import { cmccResearchDemoAgentAllowed } from "../../src/session/llm"

describe("CMCC research demo agent allowlist", () => {
  test("允许主对话和科研专家团运行模型", () => {
    expect(cmccResearchDemoAgentAllowed("build")).toBe(true)
    expect(cmccResearchDemoAgentAllowed("compaction")).toBe(true)
    expect(cmccResearchDemoAgentAllowed("ai-for-science-team/as-research-planner")).toBe(true)
  })

  test("拒绝其他专家团绕过界面直接调用", () => {
    expect(cmccResearchDemoAgentAllowed("deepinspect/deepinspect-team-lead")).toBe(false)
    expect(cmccResearchDemoAgentAllowed("deeptrading/dt-team-lead")).toBe(false)
  })
})
