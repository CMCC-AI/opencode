import type {
  AgentNodeStatus,
  AgentWorkbench,
  NestedAgentSessionView,
  SessionArtifact,
} from "../agent-workbench/model"
import type { SearchUrlEvent } from "../agent-workbench/statistics"

export const DEEPTRADING_REPLAY_DURATION_MS = 60_000

export type DeepTradingReplayStage = "idle" | "team" | "files" | "text" | "visual"

type ReplayCuePayload =
  | { at: number; type: "overview-start" }
  | { at: number; type: "overview-block"; content: string }
  | { at: number; type: "overview-finish" }
  | { at: number; type: "agent-start"; agentId: string }
  | { at: number; type: "agent-block"; agentId: string; content: string }
  | { at: number; type: "agent-finish"; agentId: string }
  | { at: number; type: "search-urls"; urls: string[] }
  | { at: number; type: "artifact"; artifact: SessionArtifact }
  | { at: number; type: "text-report-start"; path: string }
  | { at: number; type: "text-report-block"; content: string }
  | { at: number; type: "visual-report"; path: string }

type ReplayCue = ReplayCuePayload & { sequence: number }

export type DeepTradingReplayTimeline = {
  source: AgentWorkbench
  textReportMarkdown: string
  cues: ReplayCue[]
  sourceStartAt?: number
  sourceEndAt?: number
  hasFiles: boolean
  hasTextReport: boolean
  hasVisualReport: boolean
}

export type DeepTradingReplayFrame = {
  workbench: AgentWorkbench
  textReportMarkdown: string
  seenSearchUrls: string[]
  progress: number
}

export function compileDeepTradingReplay(input: {
  workbench: AgentWorkbench
  searchUrlEvents: readonly SearchUrlEvent[]
  textReportMarkdown: string
}) {
  const source = input.workbench
  const observedTimes = [
    ...source.agents.flatMap((agent) => [agent.startedAt, agent.completedAt]),
    ...input.searchUrlEvents.map((event) => event.completedAt),
  ].filter(isFiniteNumber)
  const sourceStartAt = observedTimes.length ? Math.min(...observedTimes) : undefined
  const sourceEndAt = observedTimes.length ? Math.max(...observedTimes) : undefined
  const cues: ReplayCue[] = []
  let sequence = 0
  const push = (cue: ReplayCuePayload) => cues.push({ ...cue, sequence: sequence++ } as ReplayCue)

  push({ at: 0.001, type: "overview-start" })
  const overviewBlocks = splitReplayMarkdown(source.overviewMarkdown)
  overviewBlocks.forEach((content, index) =>
    push({ at: spreadPosition(index, overviewBlocks.length, 0.02, 0.6), type: "overview-block", content }),
  )
  push({ at: 0.64, type: "overview-finish" })

  const activeAgents = source.agents.filter((agent) => agent.sessionId && agent.status !== "waiting")
  activeAgents.forEach((agent) => {
    const sourceIndex = source.agents.findIndex((item) => item.id === agent.id)
    const fallbackStart = spreadPosition(sourceIndex, source.agents.length, 0.07, 0.52)
    const start = progressForTimestamp(sourceStartAt, sourceEndAt, agent.startedAt) ?? fallbackStart
    const fallbackEnd = Math.min(0.63, start + 0.08)
    const completed = progressForTimestamp(sourceStartAt, sourceEndAt, agent.completedAt) ?? fallbackEnd
    const end = Math.max(start, Math.min(0.63, completed))
    const blocks = splitReplayMarkdown(agent.markdown)

    push({ at: start, type: "agent-start", agentId: agent.id })
    blocks.forEach((content, index) =>
      push({
        at: spreadPosition(index, blocks.length, Math.min(0.63, start + 0.005), Math.max(start, end - 0.005)),
        type: "agent-block",
        agentId: agent.id,
        content,
      }),
    )
    push({ at: end, type: "agent-finish", agentId: agent.id })
  })

  input.searchUrlEvents.forEach((event, index) =>
    push({
      at:
        progressForTimestamp(sourceStartAt, sourceEndAt, event.completedAt) ??
        spreadPosition(index, input.searchUrlEvents.length, 0.1, 0.62),
      type: "search-urls",
      urls: event.urls,
    }),
  )

  source.artifacts.forEach((artifact, index) =>
    push({
      at: spreadPosition(index, source.artifacts.length, 0.66, 0.74),
      type: "artifact",
      artifact,
    }),
  )

  if (source.textReportPath) {
    push({ at: 0.75, type: "text-report-start", path: source.textReportPath })
    const reportBlocks = splitReplayMarkdown(input.textReportMarkdown)
    reportBlocks.forEach((content, index) =>
      push({
        at: spreadPosition(index, reportBlocks.length, 0.76, 0.91),
        type: "text-report-block",
        content,
      }),
    )
  }
  if (source.visualReportPath) push({ at: 0.92, type: "visual-report", path: source.visualReportPath })

  return {
    source,
    textReportMarkdown: input.textReportMarkdown,
    cues: cues.sort((left, right) => left.at - right.at || left.sequence - right.sequence),
    sourceStartAt,
    sourceEndAt,
    hasFiles: source.artifacts.length > 0,
    hasTextReport: !!source.textReportPath,
    hasVisualReport: !!source.visualReportPath,
  } satisfies DeepTradingReplayTimeline
}

export function createDeepTradingReplayFrame(timeline: DeepTradingReplayTimeline): DeepTradingReplayFrame {
  return {
    workbench: {
      ...timeline.source,
      overviewMarkdown: "",
      overviewTurns: [],
      overviewStatus: "waiting",
      agents: timeline.source.agents.map((agent) => ({ ...agent, status: "waiting", markdown: "" })),
      nestedAgentSessions: [],
      nestedAgentSessionsLoading: false,
      nestedAgentSessionsError: undefined,
      stats: {
        elapsedMs: 0,
        tokenCount: timeline.source.stats.tokenCount === undefined ? undefined : 0,
        uniqueSearchUrlCount: 0,
        expertCount: timeline.source.stats.expertCount,
      },
      artifacts: [],
      textReportPath: undefined,
      visualReportPath: undefined,
      loading: false,
      error: undefined,
    },
    textReportMarkdown: "",
    seenSearchUrls: [],
    progress: 0,
  }
}

export function advanceDeepTradingReplay(input: {
  timeline: DeepTradingReplayTimeline
  frame: DeepTradingReplayFrame
  nextCueIndex: number
  progress: number
}) {
  const progress = clampProgress(input.progress)
  const restarted = progress < input.frame.progress
  let frame = restarted ? createDeepTradingReplayFrame(input.timeline) : input.frame
  let nextCueIndex = restarted ? 0 : input.nextCueIndex

  while (nextCueIndex < input.timeline.cues.length && input.timeline.cues[nextCueIndex]!.at <= progress) {
    frame = applyReplayCue(input.timeline, frame, input.timeline.cues[nextCueIndex]!)
    nextCueIndex += 1
  }

  frame = {
    ...frame,
    workbench: {
      ...frame.workbench,
      stats: {
        elapsedMs: Math.round(input.timeline.source.stats.elapsedMs * progress),
        tokenCount:
          input.timeline.source.stats.tokenCount === undefined
            ? undefined
            : Math.round(input.timeline.source.stats.tokenCount * progress),
        uniqueSearchUrlCount: frame.seenSearchUrls.length,
        expertCount: input.timeline.source.stats.expertCount,
      },
    },
    progress,
  }

  if (progress < 1) return { frame, nextCueIndex }
  return {
    frame: {
      workbench: {
        ...input.timeline.source,
        nestedAgentSessions: [],
        nestedAgentSessionsLoading: false,
        nestedAgentSessionsError: undefined,
      },
      textReportMarkdown: input.timeline.textReportMarkdown,
      seenSearchUrls: [
        ...new Set(input.timeline.cues.flatMap((cue) => (cue.type === "search-urls" ? cue.urls : []))),
      ],
      progress: 1,
    },
    nextCueIndex: input.timeline.cues.length,
  }
}

export function deepTradingReplayStage(timeline: DeepTradingReplayTimeline, progress: number): DeepTradingReplayStage {
  const value = clampProgress(progress)
  if (value >= 0.92 && timeline.hasVisualReport) return "visual"
  if (value >= 0.75 && timeline.hasTextReport) return "text"
  if (value >= 0.65 && timeline.hasFiles) return "files"
  return "team"
}

export function replayNestedAgentSessions(
  timeline: DeepTradingReplayTimeline,
  sessions: readonly NestedAgentSessionView[],
  progress: number,
) {
  const value = clampProgress(progress)
  return sessions.flatMap((session) => {
    const start = deepTradingReplayProgressForTimestamp(timeline, session.startedAt)
    if (value < start) return []
    const completed = session.completedAt
      ? deepTradingReplayProgressForTimestamp(timeline, session.completedAt)
      : undefined
    return [{ ...session, status: completed !== undefined && value < completed ? ("running" as const) : session.status }]
  })
}

export function deepTradingReplayProgressForTimestamp(timeline: DeepTradingReplayTimeline, timestamp?: number) {
  return progressForTimestamp(timeline.sourceStartAt, timeline.sourceEndAt, timestamp) ?? 0.08
}

export function splitReplayMarkdown(value: string) {
  const content = value.replace(/\r\n/g, "\n").trim()
  if (!content) return []
  const blocks: string[] = []
  let current: string[] = []
  let fence: "`" | "~" | undefined
  const flush = () => {
    const block = current.join("\n").trim()
    if (block) blocks.push(block)
    current = []
  }

  for (const line of content.split("\n")) {
    const marker = line.trim().match(/^(`{3,}|~{3,})/)?.[1]?.[0] as "`" | "~" | undefined
    if (!fence && /^#{1,6}\s/.test(line) && current.some((item) => item.trim())) flush()
    if (!fence && !line.trim()) {
      flush()
      continue
    }
    current.push(line)
    if (!marker) continue
    if (!fence) fence = marker
    else if (fence === marker) fence = undefined
  }
  flush()
  return blocks
}

function applyReplayCue(
  timeline: DeepTradingReplayTimeline,
  frame: DeepTradingReplayFrame,
  cue: ReplayCue,
): DeepTradingReplayFrame {
  if (cue.type === "overview-start") return updateOverview(frame, "running")
  if (cue.type === "overview-block") {
    return {
      ...frame,
      workbench: {
        ...frame.workbench,
        overviewMarkdown: appendMarkdown(frame.workbench.overviewMarkdown, cue.content),
      },
    }
  }
  if (cue.type === "overview-finish") return updateOverview(frame, timeline.source.overviewStatus)
  if (cue.type === "agent-start") return updateAgent(frame, cue.agentId, "running")
  if (cue.type === "agent-block") return updateAgent(frame, cue.agentId, undefined, cue.content)
  if (cue.type === "agent-finish") {
    const source = timeline.source.agents.find((agent) => agent.id === cue.agentId)
    return updateAgent(frame, cue.agentId, source?.status ?? "completed")
  }
  if (cue.type === "search-urls") {
    return { ...frame, seenSearchUrls: [...new Set([...frame.seenSearchUrls, ...cue.urls])] }
  }
  if (cue.type === "artifact") {
    if (frame.workbench.artifacts.some((artifact) => artifact.path === cue.artifact.path)) return frame
    return {
      ...frame,
      workbench: { ...frame.workbench, artifacts: [...frame.workbench.artifacts, cue.artifact] },
    }
  }
  if (cue.type === "text-report-start") {
    return { ...frame, workbench: { ...frame.workbench, textReportPath: cue.path } }
  }
  if (cue.type === "text-report-block") {
    return { ...frame, textReportMarkdown: appendMarkdown(frame.textReportMarkdown, cue.content) }
  }
  return { ...frame, workbench: { ...frame.workbench, visualReportPath: cue.path } }
}

function updateOverview(frame: DeepTradingReplayFrame, status: AgentNodeStatus) {
  return { ...frame, workbench: { ...frame.workbench, overviewStatus: status } }
}

function updateAgent(
  frame: DeepTradingReplayFrame,
  agentId: string,
  status?: AgentNodeStatus,
  content?: string,
) {
  return {
    ...frame,
    workbench: {
      ...frame.workbench,
      agents: frame.workbench.agents.map((agent) =>
        agent.id === agentId
          ? {
              ...agent,
              status: status ?? agent.status,
              markdown: content ? appendMarkdown(agent.markdown, content) : agent.markdown,
            }
          : agent,
      ),
    },
  }
}

function progressForTimestamp(start?: number, end?: number, timestamp?: number) {
  if (start === undefined || end === undefined || timestamp === undefined || end <= start) return
  return 0.08 + clampProgress((timestamp - start) / (end - start)) * 0.54
}

function spreadPosition(index: number, total: number, start: number, end: number) {
  if (total <= 0) return start
  return start + ((index + 1) / (total + 1)) * (end - start)
}

function appendMarkdown(current: string, content: string) {
  return current ? `${current}\n\n${content}` : content
}

function clampProgress(value: number) {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0))
}

function isFiniteNumber(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value)
}
