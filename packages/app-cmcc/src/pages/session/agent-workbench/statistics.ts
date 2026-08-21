import type { Session } from "@opencode-ai/sdk/v2"
import type { AgentWorkbenchStats, SessionTranscript } from "./model"

type InvalidSearchOutput = {
  sessionId: string
  messageId: string
  partId: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

export function sumSessionTokens(sessions: readonly Session[]) {
  const values = sessions.flatMap((session) =>
    session.tokens ? [session.tokens.input + session.tokens.output + session.tokens.reasoning] : [],
  )
  if (values.length === 0) return undefined
  return values.reduce((total, value) => total + value, 0)
}

export function collectUniqueSearchUrls(
  transcripts: readonly SessionTranscript[],
  onInvalid?: (input: InvalidSearchOutput) => void,
) {
  const urls = new Set<string>()
  for (const transcript of transcripts) {
    for (const message of transcript.messages) {
      for (const part of transcript.parts[message.id] ?? []) {
        if (part.type !== "tool" || part.tool !== "websearch" || part.state.status !== "completed") continue

        const parsed = parseSearchOutput(part.state.output)
        if (!parsed) {
          onInvalid?.({ sessionId: transcript.session.id, messageId: message.id, partId: part.id })
          continue
        }
        parsed.forEach((url) => urls.add(url))
      }
    }
  }
  return urls
}

function parseSearchOutput(output: string) {
  let parsed: unknown
  try {
    parsed = JSON.parse(output)
  } catch {
    return parseUrlLines(output)
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.results)) return parseUrlLines(output)

  return parsed.results.flatMap((result) => {
    if (!isRecord(result) || typeof result.url !== "string") return []
    const url = result.url.trim()
    return url ? [url] : []
  })
}

function parseUrlLines(output: string) {
  const urls = [...output.matchAll(/^URL:[ \t]*(https?:\/\/\S+)[ \t]*\r?$/gm)].map((match) => match[1]!.trim())
  return urls.length ? urls : undefined
}

export function calculateElapsedMs(input: {
  root: SessionTranscript
  transcripts: readonly SessionTranscript[]
  running: boolean
  now: number
}) {
  const start = [...input.root.messages]
    .filter((message) => message.role === "user")
    .sort((left, right) => left.time.created - right.time.created)[0]?.time.created
  if (start === undefined) return 0
  if (input.running) return Math.max(0, input.now - start)

  const completed = input.transcripts.map((transcript) => {
    const messageTimes = transcript.messages.flatMap((message) =>
      message.role === "assistant" && message.time.completed !== undefined ? [message.time.completed] : [],
    )
    const toolTimes = transcript.messages.flatMap((message) =>
      (transcript.parts[message.id] ?? []).flatMap((part) =>
        part.type === "tool" && part.state.status === "completed" ? [part.state.time.end] : [],
      ),
    )
    const values = [...messageTimes, ...toolTimes]
    return values.length ? Math.max(...values) : transcript.session.time.updated
  })
  const end = Math.max(start, ...completed)
  return Math.max(0, end - start)
}

export function buildWorkbenchStats(input: {
  root: SessionTranscript
  children: readonly SessionTranscript[]
  expertCount: number
  running: boolean
  now: number
  onInvalidSearchOutput?: (input: InvalidSearchOutput) => void
}): AgentWorkbenchStats {
  const transcripts = [input.root, ...input.children]
  return {
    elapsedMs: calculateElapsedMs({ root: input.root, transcripts, running: input.running, now: input.now }),
    tokenCount: sumSessionTokens(transcripts.map((transcript) => transcript.session)),
    uniqueSearchUrlCount: collectUniqueSearchUrls(input.children, input.onInvalidSearchOutput).size,
    expertCount: input.expertCount,
  }
}
