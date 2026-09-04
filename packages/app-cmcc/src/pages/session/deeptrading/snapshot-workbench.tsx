import { createMemo, onCleanup, type Accessor, type ParentProps } from "solid-js"
import { createStore } from "solid-js/store"
import type { Part, Session } from "@opencode-ai/sdk/v2"
import type { DockApiCaseSnapshot } from "@/context/dockapi"
import {
  buildAgentNodes,
  buildNestedAgentSessions,
  deriveSessionStatus,
  extractAssistantMarkdown,
  extractOverviewConversation,
  extractTaskChildPreferences,
  extractUserQuery,
  resolveAgentSessions,
} from "../agent-workbench/session-adapter"
import type { AgentWorkbench, SessionArtifact, SessionTranscript } from "../agent-workbench/model"
import { calculateElapsedMs, collectDeepAnalysisUrlEvents, sumSessionTokens } from "../agent-workbench/statistics"
import { DEEPTRADING_ARTIFACT_ROLES, DEEPTRADING_MEMBERS } from "./config"
import {
  DEEPTRADING_REPLAY_DURATION_MS,
  advanceDeepTradingReplay,
  compileDeepTradingReplay,
  createDeepTradingReplayFrame,
  deepTradingReplayStage,
  replayNestedAgentSessions,
  type DeepTradingReplayFrame,
  type DeepTradingReplayStage,
  type DeepTradingReplayTimeline,
} from "./replay"
import {
  DeepTradingWorkbenchValueProvider,
  type DeepTradingArtifactSource,
  type DeepTradingWorkbenchContextValue,
} from "./workbench-context"

const MEMBER_IDS = new Set(DEEPTRADING_MEMBERS.map((member) => member.id))

export function DeepTradingSnapshotWorkbenchProvider(
  props: ParentProps<{
    snapshot: Accessor<DockApiCaseSnapshot>
    artifactSource: DeepTradingArtifactSource
  }>,
) {
  const [state, setState] = createStore({
    selectedAgentId: "overview",
    preparing: false,
    playing: false,
    progress: 0,
    stage: "idle" as DeepTradingReplayStage,
    frame: undefined as DeepTradingReplayFrame | undefined,
  })
  let runId = 0
  let timer: number | undefined
  let startedAt = 0
  let timeline: DeepTradingReplayTimeline | undefined
  let nextCueIndex = 0

  const transcripts = createMemo(() => snapshotTranscripts(props.snapshot()))
  const actual = createMemo<AgentWorkbench>(() => buildWorkbench(props.snapshot(), transcripts(), state.selectedAgentId))
  const searchEvents = createMemo(() => collectDeepAnalysisUrlEvents([...transcripts().values()]))

  const clearTimer = () => {
    if (timer === undefined) return
    window.clearInterval(timer)
    timer = undefined
  }

  const stop = () => {
    runId += 1
    clearTimer()
    timeline = undefined
    nextCueIndex = 0
    setState({ preparing: false, playing: false, progress: 0, stage: "idle", frame: undefined })
  }

  const finish = (currentRun: number) => {
    if (currentRun !== runId) return
    clearTimer()
    timeline = undefined
    nextCueIndex = 0
    setState({ preparing: false, playing: false, progress: 1, stage: "idle", frame: undefined })
  }

  const start = async () => {
    if (state.preparing || state.playing || !canReplay()) return false
    const currentRun = ++runId
    setState({ preparing: true, progress: 0, stage: "idle", frame: undefined })
    const source = actual()
    let report = ""
    if (source.textReportPath) {
      await props.artifactSource.load(source.textReportPath)
      report = props.artifactSource.get(source.textReportPath)?.text ?? ""
    }
    if (currentRun !== runId) return false
    timeline = compileDeepTradingReplay({ workbench: source, searchUrlEvents: searchEvents(), textReportMarkdown: report })
    nextCueIndex = 0
    startedAt = performance.now()
    setState({
      preparing: false,
      playing: true,
      progress: 0,
      stage: "team",
      frame: createDeepTradingReplayFrame(timeline),
    })
    timer = window.setInterval(() => {
      if (currentRun !== runId || !timeline || !state.frame) {
        clearTimer()
        return
      }
      const progress = Math.min(1, (performance.now() - startedAt) / DEEPTRADING_REPLAY_DURATION_MS)
      const advanced = advanceDeepTradingReplay({
        timeline,
        frame: state.frame,
        nextCueIndex,
        progress,
      })
      nextCueIndex = advanced.nextCueIndex
      setState({ frame: advanced.frame, progress, stage: deepTradingReplayStage(timeline, progress) })
      if (progress >= 1) finish(currentRun)
    }, 500)
    return true
  }

  const canReplay = () => {
    const source = actual()
    return !!(source.overviewMarkdown || source.agents.some((agent) => agent.markdown))
  }

  const displayed = createMemo<AgentWorkbench>(() => {
    const source = actual()
    if (!state.playing || !timeline || !state.frame) return source
    if (state.selectedAgentId === "overview") return state.frame.workbench
    const selected = state.frame.workbench.agents.find((agent) => agent.id === state.selectedAgentId)
    if (!selected || selected.status === "waiting") return state.frame.workbench
    return {
      ...state.frame.workbench,
      nestedAgentSessions: replayNestedAgentSessions(timeline, source.nestedAgentSessions, state.progress),
    }
  })

  onCleanup(() => {
    runId += 1
    clearTimer()
  })

  const value: DeepTradingWorkbenchContextValue = {
    workbench: displayed,
    selectedAgentId: () => state.selectedAgentId,
    selectAgent(agentId) {
      if (agentId !== "overview" && !MEMBER_IDS.has(agentId)) return
      setState("selectedAgentId", agentId)
    },
    retrySession: () => Promise.resolve(),
    artifactSource: props.artifactSource,
    replay: {
      canReplay,
      isPreparing: () => state.preparing,
      isReplaying: () => state.playing,
      progress: () => state.progress,
      stage: () => state.stage,
      textReportMarkdown: () => state.frame?.textReportMarkdown ?? "",
      start,
      stop,
    },
  }

  return <DeepTradingWorkbenchValueProvider value={value}>{props.children}</DeepTradingWorkbenchValueProvider>
}

function snapshotTranscripts(snapshot: DockApiCaseSnapshot) {
  return new Map(
    snapshot.sessions.map((entry) => {
      const transcript: SessionTranscript = {
        session: entry.session,
        status: entry.status,
        messages: entry.messages.map((message) => message.info),
        parts: Object.fromEntries(entry.messages.map((message) => [message.info.id, message.parts])),
      }
      return [entry.session.id, transcript] as const
    }),
  )
}

function buildWorkbench(
  snapshot: DockApiCaseSnapshot,
  transcripts: ReadonlyMap<string, SessionTranscript>,
  selectedAgentId: string,
): AgentWorkbench {
  const root = transcripts.get(snapshot.rootSessionId)
  if (!root) return emptyWorkbench(snapshot.rootSessionId, "案例快照缺少根会话")
  const sessions = [...transcripts.values()].map((item) => item.session)
  const children = sessions.filter(
    (session) => session.parentID === root.session.id && !!session.agent && MEMBER_IDS.has(session.agent),
  )
  const preferences = extractTaskChildPreferences(root)
  const resolution = resolveAgentSessions({ members: DEEPTRADING_MEMBERS, children, preferredSessionIds: preferences })
  const nodes = buildAgentNodes({
    members: DEEPTRADING_MEMBERS,
    children,
    transcripts,
    preferredSessionIds: preferences,
    resolution,
  })
  const selected = nodes.nodes.find((agent) => agent.id === selectedAgentId)
  const nested = buildNestedAgentSessions({
    parentSessionId: selected?.sessionId,
    sessions,
    transcripts,
  })
  const allTranscripts = [...transcripts.values()]
  const searchEvents = collectDeepAnalysisUrlEvents(allTranscripts)
  const urls = new Set(searchEvents.flatMap((event) => event.urls))
  const artifacts = snapshotArtifacts(snapshot, allTranscripts)
  const textReport = uniqueArtifact(artifacts, "30-final-report.md")
  const visualReport = uniqueArtifact(artifacts, "40-report.html")
  return {
    rootSessionId: root.session.id,
    query: extractUserQuery(root.messages, root.parts) || snapshot.query,
    overviewMarkdown: extractAssistantMarkdown(root.messages, root.parts),
    overviewTurns: extractOverviewConversation(root.messages, root.parts),
    overviewStatus: deriveSessionStatus({
      session: root.session,
      status: root.status,
      messages: root.messages,
      parts: root.parts,
    }),
    agents: nodes.nodes,
    nestedAgentSessions: nested,
    nestedAgentSessionsLoading: false,
    stats: {
      elapsedMs: calculateElapsedMs({ root, transcripts: allTranscripts, running: false, now: Date.now() }),
      tokenCount: sumSessionTokens(allTranscripts.map((item) => item.session)),
      uniqueSearchUrlCount: urls.size,
      expertCount: DEEPTRADING_MEMBERS.length,
    },
    artifacts,
    textReportPath: textReport?.path,
    visualReportPath: visualReport?.path,
    ambiguities: nodes.ambiguities,
    loading: false,
  }
}

function snapshotArtifacts(snapshot: DockApiCaseSnapshot, transcripts: readonly SessionTranscript[]) {
  const writers = new Map<string, { agentId: string; sessionId: string; messageId: string; partId: string; at: number }>()
  for (const transcript of transcripts) {
    for (const message of transcript.messages) {
      for (const part of transcript.parts[message.id] ?? []) {
        const path = writtenArtifactPath(part)
        if (!path) continue
        const current = writers.get(path)
        const at = part.type === "tool" && part.state.status === "completed" ? part.state.time.end : 0
        if (current && current.at > at) continue
        writers.set(path, {
          agentId: transcript.session.agent ?? "",
          sessionId: transcript.session.id,
          messageId: message.id,
          partId: part.id,
          at,
        })
      }
    }
  }
  return snapshot.artifacts
    .map((item): SessionArtifact => {
      const filename = item.path.split("/").at(-1) ?? item.path
      const writer = writers.get(item.path)
      const role = DEEPTRADING_ARTIFACT_ROLES[filename]
      return {
        path: item.path,
        filename,
        sizeBytes: item.size,
        ownerAgentId: writer?.agentId ?? snapshot.rootAgent,
        ownerSessionId: writer?.sessionId ?? snapshot.rootSessionId,
        messageId: writer?.messageId ?? "",
        partId: writer?.partId ?? "",
        createdAt: writer?.at,
        role: role?.role ?? "supporting",
        label: role?.label,
      }
    })
    .sort((left, right) => (left.createdAt ?? 0) - (right.createdAt ?? 0) || left.path.localeCompare(right.path))
}

function writtenArtifactPath(part: Part) {
  if (part.type !== "tool" || part.tool !== "write" || part.state.status !== "completed") return
  const metadata = part.state.metadata
  const inputPath = typeof part.state.input.filePath === "string" ? part.state.input.filePath : undefined
  const metadataPath =
    metadata && typeof metadata === "object" && typeof metadata.filepath === "string" ? metadata.filepath : undefined
  const value = inputPath ?? metadataPath
  if (!value) return
  const normalized = value.replaceAll("\\", "/")
  const marker = "case://artifacts/"
  const index = normalized.indexOf(marker)
  return index < 0 ? undefined : normalized.slice(index + marker.length)
}

function uniqueArtifact(artifacts: readonly SessionArtifact[], filename: string) {
  const matches = artifacts.filter((artifact) => artifact.filename === filename)
  return matches.length === 1 ? matches[0] : undefined
}

function emptyWorkbench(rootSessionId: string, error: string): AgentWorkbench {
  return {
    rootSessionId,
    query: "",
    overviewMarkdown: "",
    overviewTurns: [],
    overviewStatus: "failed",
    agents: DEEPTRADING_MEMBERS.map((member) => ({ ...member, status: "waiting", markdown: "" })),
    nestedAgentSessions: [],
    nestedAgentSessionsLoading: false,
    stats: { elapsedMs: 0, uniqueSearchUrlCount: 0, expertCount: DEEPTRADING_MEMBERS.length },
    artifacts: [],
    ambiguities: [],
    loading: false,
    error,
  }
}
