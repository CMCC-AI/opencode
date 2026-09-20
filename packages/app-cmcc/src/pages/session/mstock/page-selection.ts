import type { Message, Part, Session } from "@opencode-ai/sdk/v2"
const MSTOCK_LEAD_AGENT = "mstock/mstock"
export function mstockMention(messages: readonly Message[], parts: Record<string, readonly Part[] | undefined>) {
  const first = messages
    .filter((message) => message.role === "user")
    .sort((a, b) => a.time.created - b.time.created || a.id.localeCompare(b.id))[0]
  const invoked = messages.some((message) =>
    (parts[message.id] ?? []).some(
      (part) =>
        part.type === "tool" &&
        part.tool === "task" &&
        part.state.status === "completed" &&
        part.state.input.subagent_type === MSTOCK_LEAD_AGENT &&
        typeof part.state.metadata.sessionId === "string",
    ),
  )
  return (
    invoked ||
    (!!first &&
      (first.agent === MSTOCK_LEAD_AGENT ||
        (parts[first.id] ?? []).some((part) => part.type === "agent" && part.name === MSTOCK_LEAD_AGENT)))
  )
}
export function shouldUseMstockPage(session: Session | undefined, agentType?: string, mentioned = false) {
  return !session?.parentID && (agentType === "mstock" || session?.agent === MSTOCK_LEAD_AGENT || mentioned)
}
