import { describe, expect, test } from "bun:test"
import { groupWorkbenchMessages } from "../agent-workbench/conversation-turns"
import { mstockWorkbench } from "./data"
import { mstockFixture } from "./fixtures"

function streamingOverview() {
  const data = mstockFixture()
  const root = data.transcripts[0]
  const lead = data.transcripts[1]
  const answer = root.messages[1]
  const leadAnswer = lead.messages[1]
  const original = root.parts[answer.id]!
  const task = original.find((part) => part.type === "tool" && part.tool === "task")!
  if (
    answer.role !== "assistant" ||
    leadAnswer.role !== "assistant" ||
    task.type !== "tool" ||
    task.state.status !== "completed"
  )
    throw new Error("Missing mstock task fixture")
  root.parts[answer.id] = original.filter((part) => part.type !== "text")
  task.state = { status: "running", input: task.state.input, metadata: task.state.metadata, time: { start: 1075 } }
  answer.time.completed = undefined
  leadAnswer.time.completed = undefined
  root.status = { type: "busy" }
  lead.status = { type: "busy" }
  const read = () =>
    mstockWorkbench({
      rootId: data.root.id,
      transcripts: data.transcripts,
      files: [],
      selected: "overview",
      running: true,
      now: 1700,
    })
  return { data, root, lead, answer, leadAnswer, task, original, read }
}

describe("mstock overview reply ownership", () => {
  test("streaming lead output belongs to its calling user instead of creating an orphan card", () => {
    const state = streamingOverview()
    const model = state.read()
    const turns = groupWorkbenchMessages(model.overviewMessages!)
    expect(turns).toHaveLength(1)
    expect(turns[0].user?.id).toBe(state.root.messages[0].id)
    expect(turns[0].replies).toEqual([
      expect.objectContaining({
        id: state.leadAnswer.id,
        parentID: state.root.messages[0].id,
        text: "执行专家结论",
        completedAt: undefined,
        modelID: "test",
      }),
    ])
    expect(state.leadAnswer.parentID).toBe(state.lead.messages[0].id)
    expect(model.overviewMarkdown).toBe("执行专家结论")
    expect(model.ambiguities).toEqual([])
  })

  test("keeps an actual pending follow-up separate from the earlier lead output", () => {
    const state = streamingOverview()
    const followup = { ...state.root.messages[0], id: "followup-user", time: { created: 1500 } }
    state.root.messages = [...state.root.messages, followup]
    state.root.parts[followup.id] = [
      {
        id: "followup-text",
        sessionID: state.root.session.id,
        messageID: followup.id,
        type: "text",
        text: "请再分析风险",
      },
    ]
    const turns = groupWorkbenchMessages(state.read().overviewMessages!)
    expect(turns).toHaveLength(2)
    expect(turns[0].replies.map((message) => message.id)).toEqual([state.leadAnswer.id])
    expect(turns[1]).toMatchObject({ id: followup.id, replies: [] })
    state.answer.parentID = followup.id
    const reassigned = groupWorkbenchMessages(state.read().overviewMessages!)
    expect(reassigned[0].replies).toEqual([])
    expect(reassigned[1].replies.map((message) => message.id)).toEqual([state.leadAnswer.id])
  })

  test("root output replaces the lead fallback without duplicating replies", () => {
    const state = streamingOverview()
    expect(groupWorkbenchMessages(state.read().overviewMessages!)).toHaveLength(1)
    state.root.parts[state.answer.id] = state.original
    const model = state.read()
    const turns = groupWorkbenchMessages(model.overviewMessages!)
    expect(turns).toHaveLength(1)
    expect(turns[0].replies.map((message) => message.id)).toEqual([state.answer.id])
    expect(model.overviewMarkdown).toBe("对比报告已完成")
  })

  test("retains a waiting turn before either session returns visible text", () => {
    const state = streamingOverview()
    state.lead.parts[state.leadAnswer.id] = []
    const model = state.read()
    expect(groupWorkbenchMessages(model.overviewMessages!)).toEqual([
      { id: state.root.messages[0].id, user: model.overviewMessages![0], replies: [] },
    ])
    expect(model.overviewMarkdown).toBe("")
    expect(model.ambiguities).toEqual([])
  })

  for (const missing of ["metadata", "agent", "parent"] as const) {
    test(`does not guess ownership when ${missing} is unavailable or mismatched`, () => {
      const state = streamingOverview()
      if (state.task.state.status !== "running") throw new Error("Missing running task fixture")
      if (missing === "metadata") state.task.state.metadata = {}
      if (missing === "agent") state.task.state.input.subagent_type = "unrelated-agent"
      if (missing === "parent") state.answer.parentID = "unloaded-user"
      const model = state.read()
      expect(model.overviewMessages?.filter((message) => message.role === "assistant")).toEqual([])
      expect(model.overviewMarkdown).toBe("")
      expect(model.ambiguities.some((message) => message.includes("用户提问"))).toBe(true)
    })
  }

  test("does not attach a reused lead session to an arbitrary question", () => {
    const state = streamingOverview()
    const followup = { ...state.root.messages[0], id: "followup-user", time: { created: 1500 } }
    const caller = { ...state.answer, id: "followup-caller", parentID: followup.id }
    state.root.messages = [...state.root.messages, followup, caller]
    state.root.parts[followup.id] = [
      { id: "followup-text", sessionID: state.root.session.id, messageID: followup.id, type: "text", text: "继续对比" },
    ]
    state.root.parts[caller.id] = [{ ...state.task, id: "reused-task", messageID: caller.id }]
    const model = state.read()
    expect(model.overviewMessages?.filter((message) => message.role === "assistant")).toEqual([])
    expect(model.ambiguities.some((message) => message.includes("用户提问"))).toBe(true)
  })

  for (const status of ["completed", "error"] as const) {
    test(`preserves available lead output after a ${status} task`, () => {
      const state = streamingOverview()
      if (state.task.state.status !== "running") throw new Error("Missing running task fixture")
      const common = {
        input: state.task.state.input,
        metadata: state.task.state.metadata ?? {},
        time: { start: 1075, end: 1600 },
      }
      state.task.state =
        status === "completed"
          ? { ...common, status, title: "多股对比", output: "ok" }
          : { ...common, status, error: "任务中断" }
      const turns = groupWorkbenchMessages(state.read().overviewMessages!)
      expect(turns).toHaveLength(1)
      expect(turns[0].replies.map((message) => message.id)).toEqual([state.leadAnswer.id])
    })
  }
})
