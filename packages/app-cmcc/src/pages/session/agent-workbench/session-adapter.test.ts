import { describe, expect, test } from "bun:test"
import type { Message, Part, Session } from "@opencode-ai/sdk/v2"
import {
  buildNestedAgentSessions,
  buildAgentNodes,
  extractAssistantMarkdown,
  extractOverviewConversation,
  extractWorkbenchMessages,
  completedExpertElapsed,
  extractTaskChildPreferences,
  extractUserQuery,
} from "./session-adapter"

const session = (id: string, agent: string, parentID?: string): Session => ({
  id,
  slug: id,
  projectID: "project",
  directory: "C:\\workspace",
  title: id,
  agent,
  parentID,
  version: "test",
  time: { created: 10, updated: 20 },
})

const user = (id: string, sessionID: string): Message => ({
  id,
  sessionID,
  role: "user",
  time: { created: 10 },
  agent: "lead",
  model: { providerID: "test", modelID: "test" },
})

const assistant = (id: string, sessionID: string, completed = true): Message => ({
  id,
  sessionID,
  role: "assistant",
  time: { created: 20, completed: completed ? 30 : undefined },
  parentID: "user",
  modelID: "test",
  providerID: "test",
  mode: "test",
  agent: "lead",
  path: { cwd: "C:\\workspace", root: "C:\\" },
  cost: 0,
  tokens: { input: 1, output: 2, reasoning: 3, cache: { read: 10, write: 20 } },
})

const text = (id: string, messageID: string, value: string): Part => ({
  id,
  sessionID: "root",
  messageID,
  type: "text",
  text: value,
})

describe("agent workbench session adapter", () => {
  test("keeps each message's timestamp and actual model, without exposing hidden parts", () => {
    const first = assistant("a1", "root")
    const second = { ...assistant("a2", "root", false), modelID: "second-model", time: { created: 40 } }
    const messages = extractWorkbenchMessages([second, first, user("u1", "root")], {
      u1: [text("p1", "u1", "question")],
      a1: [text("p2", "a1", "first"), { ...text("hidden", "a1", "ignored"), ignored: true } as Part],
      a2: [text("p3", "a2", "```ts\n"), text("p4", "a2", "1\n```")],
    })
    expect(messages.map((message) => message.id)).toEqual(["u1", "a1", "a2"])
    expect(messages[0]).toEqual({ id: "u1", role: "user", text: "question", createdAt: 10 })
    expect(messages[1]).toMatchObject({ text: "first", createdAt: 20, completedAt: 30, modelID: "test" })
    expect(messages[2]).toMatchObject({
      text: "```ts\n1\n```",
      createdAt: 40,
      completedAt: undefined,
      modelID: "second-model",
    })
  })

  test("shows elapsed time only for a completed execution with valid timestamps", () => {
    expect(completedExpertElapsed({ status: "completed", startedAt: 1000, completedAt: 61000 })).toBe(60000)
    expect(completedExpertElapsed({ status: "completed", startedAt: 1000, completedAt: 1000 })).toBe(0)
    for (const status of ["waiting", "running", "failed"] as const)
      expect(completedExpertElapsed({ status, startedAt: 1000, completedAt: 61000 })).toBeUndefined()
    expect(completedExpertElapsed({ status: "completed", startedAt: 1000 })).toBeUndefined()
    expect(completedExpertElapsed({ status: "completed", startedAt: 1000, completedAt: 0 })).toBeUndefined()
    expect(completedExpertElapsed({ status: "completed", startedAt: NaN, completedAt: 2000 })).toBeUndefined()
  })
  test("extracts only ordered assistant text and the original user query", () => {
    const followup = { ...assistant("a2", "root"), agent: "build", mode: "build" }
    const messages = [followup, user("u1", "root"), assistant("a1", "root")]
    const parts = {
      u1: [text("p1", "u1", "研究一下贵州茅台最近怎么样")],
      a1: [text("p2", "a1", "第一段")],
      a2: [
        { id: "p3", sessionID: "root", messageID: "a2", type: "reasoning", text: "不展示", time: { start: 1 } },
        text("p4", "a2", "第二段"),
      ],
    } satisfies Record<string, Part[]>

    expect(extractUserQuery(messages, parts)).toBe("研究一下贵州茅台最近怎么样")
    expect(extractAssistantMarkdown(messages, parts)).toBe("第一段\n\n第二段")
  })

  test("preserves markdown whitespace and joins streamed text parts without inventing separators", () => {
    const message = assistant("a1", "root")
    const parts = {
      a1: [text("p1", "a1", "```ts\nconst value = 1"), text("p2", "a1", "\n```\n")],
    } satisfies Record<string, Part[]>

    expect(extractAssistantMarkdown([message], parts)).toBe("```ts\nconst value = 1\n```\n")
  })

  test("groups follow-up questions with their assistant replies in chronological order", () => {
    const initialUser = user("u1", "root")
    const followupUser = { ...user("u2", "root"), time: { created: 40 }, agent: "build" }
    const initialReply = { ...assistant("a1", "root"), parentID: initialUser.id }
    const followupReply = {
      ...assistant("a2", "root"),
      parentID: followupUser.id,
      time: { created: 50, completed: 60 },
      agent: "build",
      mode: "build",
    }
    const parts = {
      u1: [text("p1", "u1", "研究贵州茅台")],
      a1: [text("p2", "a1", "初始分析")],
      u2: [text("p3", "u2", "它目前估值如何？")],
      a2: [text("p4", "a2", "当前估值处于历史低位。")],
    } satisfies Record<string, Part[]>

    expect(extractOverviewConversation([followupReply, initialUser, followupUser, initialReply], parts)).toEqual([
      { id: "u1", query: "研究贵州茅台", markdown: "初始分析" },
      { id: "u2", query: "它目前估值如何？", markdown: "当前估值处于历史低位。" },
    ])
  })

  test("keeps configured order and exposes duplicate child sessions as ambiguity", () => {
    const first = session("child-1", "deeptrading/dt-intake")
    const duplicate = session("child-2", "deeptrading/dt-intake")
    const result = buildAgentNodes({
      members: [
        { id: "deeptrading/dt-intake", name: "阿核", profession: "信息确认员" },
        { id: "deeptrading/dt-market-analyst", name: "阿波", profession: "市场分析专家" },
      ],
      children: [duplicate, first],
      transcripts: new Map(),
    })

    expect(result.nodes.map((node) => node.id)).toEqual(["deeptrading/dt-intake", "deeptrading/dt-market-analyst"])
    expect(result.nodes[0]?.status).toBe("failed")
    expect(result.nodes[1]?.status).toBe("waiting")
    expect(result.ambiguities).toHaveLength(1)
  })

  test("uses completed root task metadata to disambiguate repeated child agents", () => {
    const first = session("child-1", "deeptrading/dt-intake")
    const retry = session("child-2", "deeptrading/dt-intake")
    const root = session("root", "deeptrading/deeptrading-team-lead")
    const rootMessage = assistant("a1", "root")
    const taskPart = {
      id: "task-1",
      sessionID: "root",
      messageID: rootMessage.id,
      type: "tool",
      callID: "call-1",
      tool: "task",
      state: {
        status: "completed",
        input: { subagent_type: "deeptrading/dt-intake" },
        output: "ok",
        title: "标的确认",
        metadata: { sessionId: retry.id },
        time: { start: 10, end: 20 },
      },
    } satisfies Part
    const rootTranscript = { session: root, messages: [rootMessage], parts: { [rootMessage.id]: [taskPart] } }
    const result = buildAgentNodes({
      members: [{ id: "deeptrading/dt-intake", name: "阿核", profession: "信息确认员" }],
      children: [first, retry],
      transcripts: new Map(),
      preferredSessionIds: extractTaskChildPreferences(rootTranscript),
    })

    expect(result.nodes[0]?.sessionId).toBe(retry.id)
    expect(result.ambiguities).toEqual([])
  })

  test("uses the latest completed root task when an agent is retried", () => {
    const first = session("child-1", "deeptrading/dt-research-manager")
    const retry = session("child-2", "deeptrading/dt-research-manager")
    const root = session("root", "deeptrading/deeptrading-team-lead")
    const rootMessage = assistant("a1", "root")
    const task = (id: string, sessionId: string, end: number): Part => ({
      id,
      sessionID: "root",
      messageID: rootMessage.id,
      type: "tool",
      callID: `call-${id}`,
      tool: "task",
      state: {
        status: "completed",
        input: { subagent_type: "deeptrading/dt-research-manager" },
        output: "ok",
        title: "投资决策综合研判",
        metadata: { sessionId },
        time: { start: end - 10, end },
      },
    })
    const rootTranscript = {
      session: root,
      messages: [rootMessage],
      parts: { [rootMessage.id]: [task("task-retry", retry.id, 40), task("task-first", first.id, 20)] },
    }
    const result = buildAgentNodes({
      members: [{ id: "deeptrading/dt-research-manager", name: "阿理", profession: "投资决策经理" }],
      children: [first, retry],
      transcripts: new Map(),
      preferredSessionIds: extractTaskChildPreferences(rootTranscript),
    })

    expect(result.nodes[0]?.sessionId).toBe(retry.id)
    expect(result.ambiguities).toEqual([])
  })

  test("shows only nested sessions created by the selected first-level agent", () => {
    const selected = session("nested-1", "helper/searcher", "child-selected")
    const other = session("nested-2", "helper/reviewer", "child-other")
    const selectedTranscript = {
      session: selected,
      messages: [assistant("nested-answer", selected.id)],
      parts: {},
    }

    expect(
      buildNestedAgentSessions({
        parentSessionId: "child-selected",
        sessions: [other, selected],
        transcripts: new Map([[selected.id, selectedTranscript]]),
      }),
    ).toEqual([
      {
        id: selected.id,
        parentSessionId: "child-selected",
        agentId: "helper/searcher",
        title: selected.title,
        status: "completed",
        startedAt: 10,
        completedAt: 30,
      },
    ])
    expect(buildNestedAgentSessions({ sessions: [selected], transcripts: new Map() })).toEqual([])
  })
})
