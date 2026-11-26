import type { Part } from "@opencode-ai/sdk/v2"

export function splitClassicProgress<T extends { part: Part; messageID: string }>(parts: T[], finished: boolean) {
  const lastTool = parts.findLastIndex(({ part }) => part.type === "tool" && part.tool !== "question")
  let answerStart = lastTool + 1
  const lastText = parts.findLastIndex(({ part }) => part.type === "text")
  if (finished && lastText >= 0 && lastText < lastTool) {
    // A finished assistant can write a report after its answer. Keep that message's last block of text.
    const messageID = parts[lastText]!.messageID
    answerStart =
      parts.findLastIndex((item, i) => i < lastText && (item.messageID !== messageID || item.part.type === "tool")) + 1
  }
  const progress: T[] = []
  const answer: T[] = []

  parts.forEach((item, index) => {
    const part = item.part
    const preamble = part.type === "text" && index < answerStart
    const isProgress = part.type === "reasoning" || (part.type === "tool" && part.tool !== "question") || preamble
    if (isProgress) progress.push(item)
    else answer.push(item)
  })

  return { progress, answer }
}
