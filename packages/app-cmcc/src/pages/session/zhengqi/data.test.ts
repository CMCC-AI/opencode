import { describe, expect, test } from "bun:test"
import type { AgentNodeView, ArtifactDiscovery } from "../agent-workbench/model"
import { scopeZhengqiArtifacts, zhengqiProgress, zhengqiPublicResearchTranscripts } from "./data"

const nodes = (completed: number): AgentNodeView[] =>
  Array.from({ length: 10 }, (_, index) => ({
    id: `agent-${index + 1}`,
    name: `Agent ${index + 1}`,
    profession: "专家",
    status: index < completed ? "completed" : "waiting",
    markdown: "",
  }))

describe("Zhengqi workbench data", () => {
  test("requires the visual designer before progress reaches 100 percent", () => {
    const required = nodes(10).map((node) => node.id)
    expect(zhengqiProgress({ nodes: nodes(9), requiredAgentIds: required })).toBe(90)
    expect(zhengqiProgress({ nodes: nodes(10), requiredAgentIds: required })).toBe(100)
  })

  test("counts public sources only from the authorized public research agent", () => {
    const transcripts = [
      { session: { agent: "public-researcher" }, id: "public" },
      { session: { agent: "report-writer" }, id: "writer" },
    ]
    expect(zhengqiPublicResearchTranscripts(transcripts, "public-researcher").map((item) => item.id)).toEqual([
      "public",
    ])
  })

  test("keeps only files inside the injected conversation artifact directory", () => {
    const discovery: ArtifactDiscovery = {
      artifacts: [
        {
          path: "runs/run-1/customer/20-report.md",
          filename: "20-report.md",
          ownerAgentId: "writer",
          ownerSessionId: "writer-session",
          messageId: "message-1",
          partId: "part-1",
          role: "text-report",
        },
        {
          path: "05-web-findings-1.md",
          filename: "05-web-findings-1.md",
          ownerAgentId: "researcher",
          ownerSessionId: "research-session",
          messageId: "message-2",
          partId: "part-2",
          role: "supporting",
        },
      ],
      runDirectory: "runs/run-1/customer",
      ambiguities: [],
    }
    const result = scopeZhengqiArtifacts(discovery, "runs/run-1")
    expect(result.artifacts.map((artifact) => artifact.path)).toEqual(["runs/run-1/customer/20-report.md"])
    expect(result.runDirectory).toBe("runs/run-1/customer")
    expect(result.ambiguities).toContain("检测到 1 个写入会话产物目录外的文件，已从政企文件列表排除")
  })
})
