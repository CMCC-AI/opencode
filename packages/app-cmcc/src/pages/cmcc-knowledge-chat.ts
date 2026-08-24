import type { Message, Part, Session } from "@opencode-ai/sdk/v2/client"

export function isKnowledgeChatSession(session: Pick<Session, "metadata">) {
  return session.metadata?.cmccKnowledgeKind !== "import"
}

export function hasUserPrompt(messages: Array<{ info: Message; parts: Part[] }>, prompt: string) {
  return messages.some(
    (message) =>
      message.info.role === "user" &&
      message.parts
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("")
        .trim() === prompt,
  )
}
