import { expect, test } from "bun:test"
import { isGeneralConversation, generalChatReplyStarts, generalChatSpeaker } from "./general-chat"

test("only decorates bound general root conversations", () => {
  for (const agent of ["build", "plan", undefined]) {
    expect(
      isGeneralConversation({ session: { agent }, agentType: "deepinsight", initialAgent: agent, dedicated: false }),
    ).toBe(true)
  }
  expect(isGeneralConversation({ session: { agent: "build" }, agentType: " DEEPINSIGHT ", dedicated: false })).toBe(
    true,
  )
})

test("does not decorate dedicated agents, child sessions, unknown bindings or knowledge sessions", () => {
  for (const agentType of ["deeptrading", "deepinspect", "deepcampaign", "mstock", "knowledge", undefined]) {
    expect(isGeneralConversation({ session: { agent: "build" }, agentType, dedicated: false })).toBe(false)
  }
  expect(
    isGeneralConversation({
      session: { agent: "build", parentID: "parent" },
      agentType: "deepinsight",
      dedicated: false,
    }),
  ).toBe(false)
  expect(
    isGeneralConversation({
      session: { agent: "deepinsight/deepinsight-team-lead" },
      agentType: "deepinsight",
      dedicated: false,
    }),
  ).toBe(false)
  expect(
    isGeneralConversation({
      session: { agent: "build" },
      initialAgent: "deepinsight/deepinsight-team-lead",
      agentType: "deepinsight",
      dedicated: false,
    }),
  ).toBe(false)
  expect(isGeneralConversation({ session: { agent: "build" }, agentType: "deepinsight", dedicated: true })).toBe(false)
})

test("assistant avatars appear once per reply, including thinking, retry and failure", () => {
  const user = { _tag: "UserMessage", userMessageID: "one" }
  const first = { _tag: "AssistantPart", userMessageID: "one", key: "tool" }
  const second = { _tag: "AssistantPart", userMessageID: "one", key: "text" }
  const thinking = { _tag: "Thinking", userMessageID: "two" }
  const retry = { _tag: "Retry", userMessageID: "three" }
  const error = { _tag: "Error", userMessageID: "four", text: "Failed" }
  const rows = [user, first, second, thinking, retry, error]
  const starts = generalChatReplyStarts(rows)
  expect(starts.size).toBe(4)
  expect(starts.get("one")).toBe(first)
  expect(starts.get("two")).toBe(thinking)
  expect(starts.get("three")).toBe(retry)
  expect(starts.get("four")).toBe(error)
  expect(generalChatSpeaker(user)).toBe("user")
  expect(generalChatSpeaker(first)).toBe("assistant")
  expect(generalChatSpeaker({ _tag: "TurnGap" })).toBeUndefined()
})
