import type { Session } from "@opencode-ai/sdk/v2"
import type { AgentWorkbenchStats, SessionTranscript } from "./model"

type InvalidSearchOutput = {
  sessionId: string
  messageId: string
  partId: string
}

export type SearchUrlEvent = {
  completedAt: number
  sessionId: string
  messageId: string
  partId: string
  urls: string[]
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
  collectSearchUrlEvents(transcripts, onInvalid).forEach((event) => event.urls.forEach((url) => urls.add(url)))
  return urls
}

export function collectSearchUrlEvents(
  transcripts: readonly SessionTranscript[],
  onInvalid?: (input: InvalidSearchOutput) => void,
) {
  const events: SearchUrlEvent[] = []
  for (const transcript of transcripts) {
    for (const message of transcript.messages) {
      for (const part of transcript.parts[message.id] ?? []) {
        if (part.type !== "tool" || part.tool !== "websearch" || part.state.status !== "completed") continue

        const parsed = parseSearchOutput(part.state.output)
        if (!parsed) {
          onInvalid?.({ sessionId: transcript.session.id, messageId: message.id, partId: part.id })
          continue
        }
        events.push({
          completedAt: part.state.time.end,
          sessionId: transcript.session.id,
          messageId: message.id,
          partId: part.id,
          urls: [...new Set(parsed)],
        })
      }
    }
  }
  return events.sort(compareSearchUrlEvents)
}

export function collectDeepAnalysisUrlEvents(
  transcripts: readonly SessionTranscript[],
  onInvalidSearchOutput?: (input: InvalidSearchOutput) => void,
) {
  const events = collectSearchUrlEvents(transcripts, onInvalidSearchOutput)
  for (const transcript of transcripts) {
    for (const message of transcript.messages) {
      for (const part of transcript.parts[message.id] ?? []) {
        if (part.type !== "tool" || part.tool !== "webfetch" || part.state.status !== "completed") continue
        const url = parseWebFetchInputUrl(part.state.input)
        if (!url) continue
        events.push({
          completedAt: part.state.time.end,
          sessionId: transcript.session.id,
          messageId: message.id,
          partId: part.id,
          urls: [url],
        })
      }
    }
  }
  return events.sort(compareSearchUrlEvents)
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

function parseWebFetchInputUrl(input: unknown) {
  if (!isRecord(input) || typeof input.url !== "string") return undefined
  const value = input.url.trim()
  if (!value) return undefined
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined
    return value
  } catch {
    return undefined
  }
}

function compareSearchUrlEvents(left: SearchUrlEvent, right: SearchUrlEvent) {
  return (
    left.completedAt - right.completedAt ||
    left.sessionId.localeCompare(right.sessionId) ||
    left.messageId.localeCompare(right.messageId) ||
    left.partId.localeCompare(right.partId)
  )
}

export function calculateElapsedMs(input: {
  root: SessionTranscript
  transcripts: readonly SessionTranscript[]
  running: boolean
  now: number
}) {
  if (!input.root.messages.some((message) => message.role === "user" && Number.isFinite(message.time.created))) return 0
  const transcripts = new Map(input.transcripts.map((transcript) => [transcript.session.id, transcript]))
  transcripts.set(input.root.session.id, input.root)
  const busy = new Set(
    [...transcripts.values()]
      .filter((transcript) => transcript.status?.type === "busy" || transcript.status?.type === "retry")
      .map((transcript) => transcript.session.id),
  )
  const intervals = [...transcripts.values()]
    .flatMap((transcript) =>
      executionIntervals(
        transcript,
        input.running &&
          (busy.size ? busy.has(transcript.session.id) : transcript.session.id === input.root.session.id),
        input.now,
      ),
    )
    .sort((left, right) => left.start - right.start)
  let elapsed = 0
  let end = -Infinity
  for (const interval of intervals) {
    elapsed += Math.max(0, interval.end - Math.max(interval.start, end))
    end = Math.max(end, interval.end)
  }
  return elapsed
}

function executionIntervals(transcript: SessionTranscript, running: boolean, now: number) {
  const messages = transcript.messages
    .filter((message) => Number.isFinite(message.time.created))
    .sort((left, right) => left.time.created - right.time.created || left.id.localeCompare(right.id))
  const turns = new Map<string, { start: number; end: number; open: boolean }>()
  for (const message of messages) {
    if (message.role !== "user") continue
    turns.set(message.id, { start: message.time.created, end: message.time.created, open: true })
  }
  for (const message of messages) {
    if (message.role !== "assistant") continue
    const key = message.parentID || message.id
    const turn = turns.get(key) ?? {
      start: message.time.created,
      end: message.time.created,
      open: true,
    }
    const times = [message.time.created, message.time.completed]
    let pending = false
    for (const part of transcript.parts[message.id] ?? []) {
      if (part.type === "tool") {
        if (part.state.status === "pending" || part.state.status === "running") pending = true
        if (part.state.status === "pending") continue
        times.push(part.state.time.start)
        if (part.state.status === "completed" || part.state.status === "error") times.push(part.state.time.end)
      }
      if ((part.type === "text" || part.type === "reasoning") && part.time) {
        times.push(part.time.start, part.time.end)
      }
    }
    turn.end = Math.max(
      turn.end,
      ...times.filter((time): time is number => time !== undefined && Number.isFinite(time)),
    )
    turn.open = message.time.completed === undefined || message.finish === "tool-calls" || pending
    turns.set(key, turn)
  }
  const intervals = [...turns.values()]
  // Only the current execution may keep ticking; completed turns remain frozen.
  const current = intervals.reduce<(typeof intervals)[number] | undefined>(
    (latest, turn) => (!latest || turn.start > latest.start ? turn : latest),
    undefined,
  )
  if (running && current?.open && Number.isFinite(now)) current.end = Math.max(current.end, now)
  return intervals
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
