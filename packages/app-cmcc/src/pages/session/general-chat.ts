import type { Session } from "@opencode-ai/sdk/v2"

export function isGeneralConversation(input: {
  session?: Pick<Session, "parentID" | "agent">
  agentType?: string
  initialAgent?: string
  dedicated: boolean
}) {
  if (!input.session || input.session.parentID || input.dedicated) return false
  if (input.agentType?.trim().toLowerCase() !== "deepinsight") return false
  return [input.session.agent, input.initialAgent].every((agent) => !agent || agent === "build" || agent === "plan")
}

export function generalChatSpeaker(row: { _tag: string }) {
  if (row._tag === "UserMessage") return "user"
  if (["AssistantPart", "Thinking", "Retry", "Error"].includes(row._tag)) return "assistant"
}

export function generalChatReplyStarts<T extends { _tag: string; userMessageID: string }>(rows: readonly T[]) {
  const starts = new Map<string, T>()
  for (const row of rows) {
    if (generalChatSpeaker(row) !== "assistant" || starts.has(row.userMessageID)) continue
    starts.set(row.userMessageID, row)
  }
  return starts
}
