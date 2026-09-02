import { describe, expect, test } from "bun:test"
import type { Message, Session } from "@opencode-ai/sdk/v2"
import type { AgentNodeView, SessionTranscript } from "../agent-workbench/model"
import {
  buildDeepInspectExecutions,
  deepInspectArtifactDirectoryWarning,
  deepInspectProgress,
  isDeepInspectDagEdgeActive,
  parseDeepInspectIssueCount,
} from "./data"

const directory = "D:\\workspace\\u-2"

const session = (id: string, created: number): Session => ({
  id,
  slug: id,
  projectID: "project",
  directory,
  title: id,
  agent: "deepinspect/report-writer",
  version: "test",
  time: { created, updated: created + 10 },
})

const transcript = (value: Session): SessionTranscript => {
  const message: Message = {
    id: `message-${value.id}`,
    sessionID: value.id,
    role: "assistant",
    time: { created: value.time.created, completed: value.time.updated },
    parentID: "user",
    modelID: "test",
    providerID: "test",
    mode: "test",
    agent: value.agent!,
    path: { cwd: directory, root: "D:\\workspace" },
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  }
  return { session: value, messages: [message], parts: { [message.id]: [] } }
}

const node = (id: string, status: AgentNodeView["status"], sessionId?: string): AgentNodeView => ({
  id,
  name: id,
  profession: id,
  status,
  sessionId,
  markdown: "",
})

describe("DeepInspect workbench data", () => {
  test("keeps all retries and marks the authoritative task session", () => {
    const first = session("first", 10)
    const retry = session("retry", 20)
    const result = buildDeepInspectExecutions({
      agentId: "deepinspect/report-writer",
      children: [first, retry],
      transcripts: new Map([
        [first.id, transcript(first)],
        [retry.id, transcript(retry)],
      ]),
      preferredSessionId: retry.id,
    })

    expect(result.map((item) => item.id)).toEqual(["retry", "first"])
    expect(result.map((item) => item.current)).toEqual([true, false])
  })

  test("does not count an unused optional researcher against progress", () => {
    expect(
      deepInspectProgress({
        nodes: [node("core-a", "completed", "a"), node("core-b", "completed", "b"), node("optional", "waiting")],
        coreAgentIds: ["core-a", "core-b"],
        optionalAgentIds: ["optional"],
      }),
    ).toBe(100)
    expect(
      deepInspectProgress({
        nodes: [node("core-a", "completed", "a"), node("core-b", "completed", "b"), node("optional", "running", "c")],
        coreAgentIds: ["core-a", "core-b"],
        optionalAgentIds: ["optional"],
      }),
    ).toBe(67)
    expect(isDeepInspectDagEdgeActive("waiting", "completed")).toBe(false)
    expect(isDeepInspectDagEdgeActive("completed", "running")).toBe(true)
  })

  test("reads only the verified consolidated issue count", () => {
    expect(parseDeepInspectIssueCount('{"statistics":{"total_issues":7}}')).toBe(7)
    expect(parseDeepInspectIssueCount('{"statistics":{"total_issues":106}}')).toBe(106)
    expect(parseDeepInspectIssueCount('{"statistics":{"total_issues":"106"}}')).toBeUndefined()
    expect(parseDeepInspectIssueCount("invalid")).toBeUndefined()
  })

  test("warns when a historical run escaped its injected artifact directory", () => {
    expect(
      deepInspectArtifactDirectoryWarning({
        workspaceDirectory: directory,
        artifactDirectory: `${directory}\\runs\\session-1`,
        runDirectory: "tmp/inspection-workspace/demo-001",
      }),
    ).toContain("未写入独立会话目录")
    expect(
      deepInspectArtifactDirectoryWarning({
        workspaceDirectory: directory,
        artifactDirectory: `${directory}\\runs\\session-1`,
        runDirectory: "runs/session-1/tmp/inspection-workspace/run-1",
      }),
    ).toBeUndefined()
  })
})
