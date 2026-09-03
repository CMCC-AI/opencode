import { describe, expect, test } from "bun:test"
import type { AgentNodeView, SessionTranscript } from "../agent-workbench/model"
import {
  cardEditorJsonArtifacts,
  parseShoppersRecommendation,
  recommendationFromCardEditorTasks,
  shoppersArtifactDirectoryWarning,
  shoppersProgress,
} from "./data"

const nodes = (completed: number): AgentNodeView[] =>
  Array.from({ length: 4 }, (_, index) => ({
    id: `agent-${index + 1}`,
    name: `Agent ${index + 1}`,
    profession: "专家",
    status: index < completed ? "completed" : "waiting",
    markdown: "",
  }))

describe("Shoppers Pro workbench data", () => {
  test("requires all four experts before progress reaches 100 percent", () => {
    const required = nodes(4).map((node) => node.id)
    expect(shoppersProgress({ nodes: nodes(3), requiredAgentIds: required })).toBe(75)
    expect(shoppersProgress({ nodes: nodes(4), requiredAgentIds: required })).toBe(100)
  })

  test("counts only structurally valid final recommendation products", () => {
    expect(
      parseShoppersRecommendation(
        '<task_result>```json\n{"products":[{"title":"商品 A","recommendationIndex":95},{"title":"缺少评分"}]}\n```</task_result>',
      ),
    ).toEqual({ productCount: 1 })
    expect(parseShoppersRecommendation('{"products":[]}')).toBeUndefined()
    expect(parseShoppersRecommendation("已推荐 8 款商品")).toBeUndefined()
  })

  test("uses the latest completed card editor task containing structured products", () => {
    const root = {
      session: { id: "root" },
      status: undefined,
      messages: [{ id: "message", role: "assistant", time: { created: 1 } }],
      parts: {
        message: [
          {
            id: "task",
            sessionID: "root",
            messageID: "message",
            type: "tool",
            callID: "call",
            tool: "task",
            state: {
              status: "completed",
              input: { subagent_type: "card-editor" },
              output: '```json\n{"products":[{"title":"商品 A","recommendationIndex":90}]}\n```',
              title: "编辑卡片",
              metadata: {},
              time: { start: 1, end: 2 },
            },
          },
        ],
      },
    } as unknown as SessionTranscript
    expect(recommendationFromCardEditorTasks(root, "card-editor")).toEqual({ productCount: 1 })
  })

  test("selects only JSON files written by the card editor", () => {
    const base = {
      filename: "result.json",
      sizeBytes: 10,
      ownerSessionId: "child",
      messageId: "message",
      partId: "part",
      role: "supporting" as const,
    }
    const artifacts = [
      { ...base, path: "runs/one/result.json", ownerAgentId: "card-editor", createdAt: 2 },
      { ...base, path: "runs/one/source.json", ownerAgentId: "discoverer", createdAt: 3 },
    ]
    expect(cardEditorJsonArtifacts(artifacts, "card-editor").map((artifact) => artifact.path)).toEqual([
      "runs/one/result.json",
    ])
  })

  test("keeps historical root files visible while reporting the directory issue", () => {
    const warning = shoppersArtifactDirectoryWarning({
      artifactRoot: "runs/run-1",
      artifacts: [
        {
          path: "recommendations.json",
          filename: "recommendations.json",
          ownerAgentId: "card-editor",
          ownerSessionId: "child",
          messageId: "message",
          partId: "part",
          role: "supporting",
        },
      ],
    })
    expect(warning).toBe("检测到 1 个文件未写入独立会话产物目录，已按当前会话的真实 write 记录兼容展示")
  })
})
