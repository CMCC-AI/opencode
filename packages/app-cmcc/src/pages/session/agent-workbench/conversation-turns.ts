import type { WorkbenchMessage } from "./model"

type ConversationTurn = {
  id: string
  user?: WorkbenchMessage
  replies: WorkbenchMessage[]
}

export function groupWorkbenchMessages(messages: readonly WorkbenchMessage[]): ConversationTurn[] {
  if (!messages.length) return []
  if (!messages.some((message) => message.role === "user")) {
    return [{ id: messages[0].id, replies: [...messages] }]
  }
  const turns: ConversationTurn[] = []
  const parents = new Map<string, ConversationTurn>()
  for (const message of messages) {
    if (message.role === "user") {
      const turn = { id: message.id, user: message, replies: [] }
      turns.push(turn)
      parents.set(message.id, turn)
      continue
    }
    const turn = message.parentID ? parents.get(message.parentID) : turns.at(-1)
    if (turn) {
      turn.replies.push(message)
      continue
    }
    const orphan = { id: message.parentID ?? message.id, replies: [message] }
    turns.push(orphan)
    if (message.parentID) parents.set(message.parentID, orphan)
  }
  return turns
}
