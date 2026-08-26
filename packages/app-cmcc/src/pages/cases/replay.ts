import type { Part } from "@opencode-ai/sdk/v2"
import type { DockApiCaseSnapshot } from "@/context/dockapi"

export const CASE_REPLAY_DURATION_MS = 60_000

type ReplayCue =
  | { at: number; sequence: number; type: "session"; sessionId: string }
  | { at: number; sequence: number; type: "message"; sessionId: string; messageId: string }
  | { at: number; sequence: number; type: "part"; messageId: string; partId: string }

type RawReplayCue =
  | { time: number; sequence: number; pinnedAt?: number; type: "session"; sessionId: string }
  | { time: number; sequence: number; pinnedAt?: number; type: "message"; sessionId: string; messageId: string }
  | { time: number; sequence: number; pinnedAt?: number; type: "part"; messageId: string; partId: string }

export type CaseReplayTimeline = {
  cues: ReplayCue[]
  sessionIds: string[]
  messageIds: string[]
  partIds: string[]
}

export type CaseReplayFrame = {
  sessionIds: Set<string>
  messageIds: Set<string>
  partIds: Set<string>
}

export function compileCaseReplay(snapshot: DockApiCaseSnapshot): CaseReplayTimeline {
  const raw: RawReplayCue[] = []
  let sequence = 0
  for (const entry of snapshot.sessions) {
    const sessionTime = entry.session.time.created
    const root = entry.session.id === snapshot.rootSessionId
    raw.push({
      type: "session",
      sessionId: entry.session.id,
      time: sessionTime,
      sequence: sequence++,
      pinnedAt: root ? 0.001 : undefined,
    })
    for (const message of entry.messages) {
      const messageTime = message.info.time.created
      const openingQuestion = root && message.info.role === "user"
      raw.push({
        type: "message",
        sessionId: entry.session.id,
        messageId: message.info.id,
        time: messageTime,
        sequence: sequence++,
        pinnedAt: openingQuestion ? 0.003 : undefined,
      })
      message.parts.forEach((part, index) => {
        raw.push({
          type: "part",
          messageId: message.info.id,
          partId: part.id,
          time: partTime(part) ?? messageTime + index / Math.max(1, message.parts.length + 1),
          sequence: sequence++,
          pinnedAt: openingQuestion ? 0.005 + index * 0.001 : undefined,
        })
      })
    }
  }
  raw.sort((left, right) => left.time - right.time || left.sequence - right.sequence)
  const regularCount = raw.filter((cue) => cue.pinnedAt === undefined).length
  let regularIndex = 0
  const cues: ReplayCue[] = raw.map((cue, index) => {
    const { time: _, pinnedAt, ...value } = cue
    const at = pinnedAt ?? 0.03 + ((++regularIndex) / (regularCount + 1)) * 0.93
    return { ...value, at } as ReplayCue
  })
  cues.sort((left, right) => left.at - right.at || left.sequence - right.sequence)
  return {
    cues,
    sessionIds: snapshot.sessions.map((entry) => entry.session.id),
    messageIds: snapshot.sessions.flatMap((entry) => entry.messages.map((message) => message.info.id)),
    partIds: snapshot.sessions.flatMap((entry) => entry.messages.flatMap((message) => message.parts.map((part) => part.id))),
  }
}

export function caseReplayFrame(timeline: CaseReplayTimeline, progress: number): CaseReplayFrame {
  if (progress >= 1) {
    return {
      sessionIds: new Set(timeline.sessionIds),
      messageIds: new Set(timeline.messageIds),
      partIds: new Set(timeline.partIds),
    }
  }
  const value = Math.max(0, Number.isFinite(progress) ? progress : 0)
  const frame: CaseReplayFrame = { sessionIds: new Set(), messageIds: new Set(), partIds: new Set() }
  for (const cue of timeline.cues) {
    if (cue.at > value) break
    if (cue.type === "session") frame.sessionIds.add(cue.sessionId)
    if (cue.type === "message") {
      frame.sessionIds.add(cue.sessionId)
      frame.messageIds.add(cue.messageId)
    }
    if (cue.type === "part") frame.partIds.add(cue.partId)
  }
  return frame
}

function partTime(part: Part) {
  if (part.type !== "tool") return
  if (part.state.status === "running") return part.state.time.start
  if (part.state.status === "completed" || part.state.status === "error") return part.state.time.end
}
