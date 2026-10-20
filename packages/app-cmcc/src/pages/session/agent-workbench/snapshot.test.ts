import { describe, expect, test } from "bun:test"
import type { Part } from "@opencode-ai/sdk/v2"
import type { DockApiCaseSnapshot } from "@/context/dockapi"
import { buildCaseSnapshotWorkbench, findCaseSnapshotArtifact } from "./snapshot"

describe("case snapshot workbench", () => {
  test("recomputes cumulative elapsed time from historical rounds without counting idle days", () => {
    const day = 86_400_000
    const followup = assistantMessage("followup", "root", "追问回复", day + 100, day + 60_000)
    if (followup.info.role !== "assistant") throw new Error("Invalid fixture")
    followup.info.parentID = "followup-user"
    const snapshot: DockApiCaseSnapshot = {
      schemaVersion: 1,
      caseCode: "elapsed",
      capturedAt: "2026-10-20T00:00:00Z",
      rootSessionId: "root",
      query: "研究",
      agentType: "test-agent",
      rootAgent: "team/lead",
      artifacts: [],
      sessions: [
        sessionEntry({
          id: "root",
          agent: "team/lead",
          created: 0,
          messages: [
            userMessage("root-user", "root", "研究", 0),
            assistantMessage("first", "root", "报告", 100, 600_000),
            userMessage("followup-user", "root", "追问", day),
            followup,
          ],
        }),
      ],
    }
    snapshot.sessions[0].session.time.updated = 3 * day
    const result = buildCaseSnapshotWorkbench({ snapshot, members: [], roles: {}, selectedAgentId: "overview" })
    expect(result.workbench.stats.elapsedMs).toBe(660_000)
    expect(snapshot.sessions[0].session.time.updated).toBe(3 * day)
  })

  test("builds agent nodes, nested sessions, reports and artifact ownership from a case snapshot", () => {
    const snapshot: DockApiCaseSnapshot = {
      schemaVersion: 1,
      caseCode: "case-one",
      capturedAt: "2026-09-07T00:00:00Z",
      rootSessionId: "root",
      query: "案例原始问题",
      agentType: "test-agent",
      rootAgent: "team/lead",
      artifacts: [
        { path: "20-report.md", size: 128, contentType: "text/markdown" },
        { path: "data/source.json", size: 64, contentType: "application/json" },
      ],
      sessions: [
        sessionEntry({
          id: "root",
          agent: "team/lead",
          created: 100,
          messages: [
            userMessage("root-user", "root", "研究这家公司", 110),
            assistantMessage("root-assistant", "root", "总览结论", 120, 500, [
              taskPart("root-task", "root-assistant", "root", "team/agent-a", "child-a", 200),
            ]),
          ],
        }),
        sessionEntry({
          id: "child-a",
          parentID: "root",
          agent: "team/agent-a",
          created: 180,
          messages: [
            userMessage("child-user", "child-a", "执行分析", 181),
            assistantMessage("child-assistant", "child-a", "专家结论", 190, 400, [
              writePart("child-write", "child-assistant", "child-a", "20-report.md", 390),
            ]),
          ],
        }),
        sessionEntry({
          id: "nested-a",
          parentID: "child-a",
          agent: "team/nested",
          created: 220,
          messages: [userMessage("nested-user", "nested-a", "二级任务", 221)],
        }),
      ],
    }

    const result = buildCaseSnapshotWorkbench({
      snapshot,
      members: [
        { id: "team/agent-a", name: "甲", profession: "分析专家" },
        { id: "team/agent-b", name: "乙", profession: "复核专家" },
      ],
      roles: { "20-report.md": { role: "text-report", label: "文字报告" } },
      selectedAgentId: "team/agent-a",
      includeNested: true,
    })

    expect(result.workbench.query).toBe("案例原始问题")
    expect(result.workbench.overviewMarkdown).toBe("总览结论")
    expect(result.workbench.overviewStatus).toBe("completed")
    expect(result.workbench.agents.map((agent) => agent.status)).toEqual(["completed", "waiting"])
    expect(result.workbench.nestedAgentSessions.map((session) => session.id)).toEqual(["nested-a"])
    expect(result.workbench.textReportPath).toBe("20-report.md")
    expect(findCaseSnapshotArtifact(result.workbench.artifacts, "20-report.md")?.ownerAgentId).toBe("team/agent-a")
    expect(findCaseSnapshotArtifact(result.workbench.artifacts, "20-report.md")?.label).toBe("文字报告")
    expect(findCaseSnapshotArtifact(result.workbench.artifacts, "source.json")?.path).toBe("data/source.json")
    expect(findCaseSnapshotArtifact(result.workbench.artifacts, "source.json")?.ownerAgentId).toBe("")
  })

  test("does not choose a report when the snapshot contains multiple files with the same role", () => {
    const snapshot: DockApiCaseSnapshot = {
      schemaVersion: 1,
      caseCode: "case-two",
      capturedAt: "2026-09-07T00:00:00Z",
      rootSessionId: "root",
      query: "问题",
      agentType: "test-agent",
      rootAgent: "team/lead",
      artifacts: [
        { path: "one/20-report.md", size: 1, contentType: "text/markdown" },
        { path: "two/20-report.md", size: 1, contentType: "text/markdown" },
      ],
      sessions: [
        sessionEntry({
          id: "root",
          agent: "team/lead",
          created: 100,
          messages: [
            userMessage("root-user", "root", "问题", 110),
            assistantMessage("root-assistant", "root", "回答", 120, 200),
          ],
        }),
      ],
    }

    const result = buildCaseSnapshotWorkbench({
      snapshot,
      members: [],
      roles: { "20-report.md": { role: "text-report" } },
      selectedAgentId: "overview",
    })

    expect(result.workbench.textReportPath).toBeUndefined()
    expect(result.workbench.ambiguities).toContain("检测到多个文字报告文件，暂时无法确定最终报告")
    snapshot.artifacts[1].path = "two/25-visual-report.json"
    const mixed = buildCaseSnapshotWorkbench({
      snapshot,
      members: [],
      selectedAgentId: "overview",
      roles: { "20-report.md": { role: "text-report" }, "25-visual-report.json": { role: "visual-report" } },
    })
    expect(mixed.workbench.textReportPath).toBeUndefined()
    expect(mixed.workbench.visualReportPath).toBeUndefined()
    expect(mixed.workbench.ambiguities).toContain("检测到多个报告目录，暂时无法确定最终报告")
  })
})

function sessionEntry(input: {
  id: string
  parentID?: string
  agent: string
  created: number
  messages: DockApiCaseSnapshot["sessions"][number]["messages"]
}): DockApiCaseSnapshot["sessions"][number] {
  return {
    session: {
      id: input.id,
      slug: input.id,
      projectID: "case",
      directory: "case://workspace",
      title: input.id,
      version: "v2",
      parentID: input.parentID,
      agent: input.agent,
      time: { created: input.created, updated: input.created + 500 },
      tokens: { input: 10, output: 20, reasoning: 5, cache: { read: 0, write: 0 } },
    },
    status: { type: "idle" },
    messages: input.messages,
  }
}

function userMessage(
  id: string,
  sessionID: string,
  text: string,
  created: number,
): DockApiCaseSnapshot["sessions"][number]["messages"][number] {
  return {
    info: {
      id,
      sessionID,
      role: "user",
      agent: "team/lead",
      model: { providerID: "provider", modelID: "model" },
      time: { created },
    },
    parts: [{ id: `${id}-text`, sessionID, messageID: id, type: "text", text }],
  }
}

function assistantMessage(
  id: string,
  sessionID: string,
  text: string,
  created: number,
  completed: number,
  extraParts: Part[] = [],
): DockApiCaseSnapshot["sessions"][number]["messages"][number] {
  return {
    info: {
      id,
      sessionID,
      role: "assistant",
      parentID: `${sessionID}-user`,
      modelID: "model",
      providerID: "provider",
      mode: "build",
      agent: "team/lead",
      path: { cwd: "case://workspace", root: "case://workspace" },
      cost: 0,
      tokens: { input: 1, output: 1, reasoning: 0, cache: { read: 0, write: 0 } },
      time: { created, completed },
    },
    parts: [{ id: `${id}-text`, sessionID, messageID: id, type: "text", text }, ...extraParts],
  }
}

function taskPart(
  id: string,
  messageID: string,
  sessionID: string,
  agent: string,
  childSessionId: string,
  completed: number,
): Part {
  return {
    id,
    sessionID,
    messageID,
    type: "tool",
    callID: id,
    tool: "task",
    state: {
      status: "completed",
      input: { subagent_type: agent },
      output: "done",
      title: "task",
      metadata: { sessionId: childSessionId },
      time: { start: completed - 20, end: completed },
    },
  }
}

function writePart(id: string, messageID: string, sessionID: string, path: string, completed: number): Part {
  return {
    id,
    sessionID,
    messageID,
    type: "tool",
    callID: id,
    tool: "write",
    state: {
      status: "completed",
      input: { filePath: `case://artifacts/${path}`, content: "# 报告" },
      output: "done",
      title: "write",
      metadata: {},
      time: { start: completed - 10, end: completed },
    },
  }
}
