import {
  createContext,
  createEffect,
  createMemo,
  on,
  onCleanup,
  useContext,
  type Accessor,
  type ParentProps,
} from "solid-js"
import { createStore } from "solid-js/store"
import { useFile } from "@/context/file"
import { useSDK } from "@/context/sdk"
import { useSync } from "@/context/sync"
import { artifactText } from "@/pages/session/artifact-preview"
import { cmccArtifactDirectory } from "@/utils/cmcc-workspace"
import { artifactByRole, discoverSessionArtifacts } from "../agent-workbench/artifacts"
import type { AgentWorkbench, SessionTranscript } from "../agent-workbench/model"
import {
  buildAgentNodes,
  deriveSessionStatus,
  extractAssistantMarkdown,
  extractOverviewConversation,
  extractTaskChildPreferences,
  extractUserQuery,
  resolveAgentSessions,
} from "../agent-workbench/session-adapter"
import { calculateElapsedMs, sumSessionTokens } from "../agent-workbench/statistics"
import {
  DEEPTRADING_REPLAY_DURATION_MS,
  advanceDeepTradingReplay,
  compileDeepTradingReplay,
  createDeepTradingReplayFrame,
  deepTradingReplayProgressForTimestamp,
  deepTradingReplayStage,
  type DeepTradingReplayFrame,
  type DeepTradingReplayStage,
  type DeepTradingReplayTimeline,
} from "../deeptrading/replay"
import {
  DEEPINSPECT_ARTIFACT_ROLES,
  DEEPINSPECT_CORE_MEMBER_IDS,
  DEEPINSPECT_MEMBERS,
  DEEPINSPECT_OPTIONAL_MEMBER_IDS,
} from "./config"
import {
  buildDeepInspectExecutions,
  deepInspectArtifactDirectoryWarning,
  deepInspectProgress,
  parseDeepInspectIssueCount,
  type DeepInspectExecutionView,
} from "./data"

const MESSAGE_PAGE_SIZE = 200
const MEMBER_IDS = new Set(DEEPINSPECT_MEMBERS.map((member) => member.id))

export type DeepInspectWorkbenchContextValue = {
  workbench: Accessor<AgentWorkbench>
  selectedAgentId: Accessor<string>
  selectAgent: (agentId: string) => void
  retrySession: (sessionId: string) => Promise<void>
  executions: Accessor<DeepInspectExecutionView[]>
  progressPercent: Accessor<number>
  issueCount: Accessor<number | undefined>
  replay: {
    canReplay: Accessor<boolean>
    isPreparing: Accessor<boolean>
    isReplaying: Accessor<boolean>
    progress: Accessor<number>
    stage: Accessor<DeepTradingReplayStage>
    textReportMarkdown: Accessor<string>
    start: () => Promise<boolean>
    stop: () => void
  }
}

const DeepInspectWorkbenchContext = createContext<DeepInspectWorkbenchContextValue>()

export function DeepInspectWorkbenchProvider(
  props: ParentProps<{ sessionID: Accessor<string | undefined>; active: Accessor<boolean> }>,
) {
  const file = useFile()
  const sdk = useSDK()
  const sync = useSync()
  const pending = new Map<string, Promise<void>>()
  const [state, setState] = createStore({
    loading: false,
    error: undefined as string | undefined,
    selectedAgentId: "overview",
    now: Date.now(),
    loadErrors: {} as Record<string, string | undefined>,
  })
  const [replayState, setReplayState] = createStore({
    preparing: false,
    playing: false,
    progress: 0,
    stage: "idle" as DeepTradingReplayStage,
    frame: undefined as DeepTradingReplayFrame | undefined,
  })
  let generation = 0
  let replayRunId = 0
  let replayTimer: number | undefined
  let replayStartedAt = 0
  let replayTimeline: DeepTradingReplayTimeline | undefined
  let replayNextCueIndex = 0

  const clearReplayTimer = () => {
    if (replayTimer === undefined) return
    window.clearInterval(replayTimer)
    replayTimer = undefined
  }

  const stopReplay = (completed = false) => {
    replayRunId += 1
    clearReplayTimer()
    replayTimeline = undefined
    replayNextCueIndex = 0
    setReplayState({
      preparing: false,
      playing: false,
      progress: completed ? 1 : 0,
      stage: "idle",
      frame: undefined,
    })
  }

  const rootSession = createMemo(() => {
    const id = props.active() ? props.sessionID() : undefined
    return id ? sync().session.get(id) : undefined
  })
  const children = createMemo(() => {
    const root = rootSession()
    if (!root) return []
    return sync().data.session.filter(
      (session) => session.parentID === root.id && !!session.agent && MEMBER_IDS.has(session.agent),
    )
  })
  const childKey = createMemo(() =>
    children()
      .map((session) => session.id)
      .sort()
      .join(":"),
  )

  const transcript = (sessionId: string): SessionTranscript | undefined => {
    const session = sync().session.get(sessionId)
    if (!session) return
    return {
      session,
      status: sync().data.session_status[sessionId],
      messages: sync().data.message[sessionId] ?? [],
      parts: sync().data.part,
    }
  }

  const ensureComplete = (sessionId: string, force = false) => {
    const current = pending.get(sessionId)
    if (current) return current
    setState("loadErrors", sessionId, undefined)
    const task = Promise.resolve()
      .then(async () => {
        await sync().session.sync(sessionId, { force, messageLimit: MESSAGE_PAGE_SIZE })
        await sync().session.prefetch(sessionId, MESSAGE_PAGE_SIZE)
        while (sync().session.history.more(sessionId)) {
          const count = sync().data.message[sessionId]?.length ?? 0
          await sync().session.history.loadMore(sessionId, MESSAGE_PAGE_SIZE)
          if ((sync().data.message[sessionId]?.length ?? 0) === count) break
        }
      })
      .catch((error: unknown) => {
        setState("loadErrors", sessionId, error instanceof Error ? error.message : String(error))
        throw error
      })
      .finally(() => pending.delete(sessionId))
    pending.set(sessionId, task)
    return task
  }

  createEffect(
    on(
      () => ({ active: props.active(), directory: sdk().directory, sessionId: props.sessionID() }),
      (input) => {
        stopReplay()
        const current = ++generation
        setState("selectedAgentId", "overview")
        setState("error", undefined)
        setState("loadErrors", {})
        if (!input.active || !input.sessionId) {
          setState("loading", false)
          return
        }

        setState("loading", true)
        void Promise.all([
          ensureComplete(input.sessionId),
          sdk()
            .client.session.children({ sessionID: input.sessionId })
            .then((response) => {
              if (generation !== current) return []
              const items = (response.data ?? []).filter(
                (session) => session.parentID === input.sessionId && !!session.agent && MEMBER_IDS.has(session.agent),
              )
              items.forEach(sync().session.remember)
              return Promise.allSettled(items.map((session) => ensureComplete(session.id)))
            }),
        ])
          .catch((error: unknown) => {
            if (generation !== current) return
            setState("error", error instanceof Error ? error.message : String(error))
          })
          .finally(() => {
            if (generation === current) setState("loading", false)
          })
      },
      { defer: false },
    ),
  )

  createEffect(
    on(childKey, () => {
      if (!props.active()) return
      children().forEach((session) => void ensureComplete(session.id).catch(() => undefined))
    }),
  )

  const rootTranscript = createMemo(() => {
    const root = rootSession()
    return root ? transcript(root.id) : undefined
  })
  const childTranscripts = createMemo(() =>
    children().flatMap((session) => {
      const item = transcript(session.id)
      return item ? [item] : []
    }),
  )
  const transcriptById = createMemo(() => new Map(childTranscripts().map((item) => [item.session.id, item] as const)))
  const preferences = createMemo(() => {
    const root = rootTranscript()
    return root ? extractTaskChildPreferences(root) : new Map<string, string>()
  })
  const resolution = createMemo(() =>
    resolveAgentSessions({
      members: DEEPINSPECT_MEMBERS,
      children: children(),
      preferredSessionIds: preferences(),
    }),
  )
  const nodeResult = createMemo(() => {
    const nodes = buildAgentNodes({
      members: DEEPINSPECT_MEMBERS,
      children: children(),
      transcripts: transcriptById(),
      resolution: resolution(),
    })
    return {
      agentNodes: nodes.nodes.map((node) => {
        const error = node.sessionId ? state.loadErrors[node.sessionId] : undefined
        return error ? { ...node, status: "failed" as const, ambiguity: `会话加载失败：${error}` } : node
      }),
      ambiguities: nodes.ambiguities,
    }
  })
  const overviewStatus = createMemo(() => {
    const root = rootSession()
    const rootData = rootTranscript()
    if (!root || !rootData) return "waiting" as const
    return deriveSessionStatus({
      session: root,
      status: rootData.status,
      messages: rootData.messages,
      parts: rootData.parts,
    })
  })
  const running = createMemo(
    () => overviewStatus() === "running" || nodeResult().agentNodes.some((node) => node.status === "running"),
  )
  const discovery = createMemo(() => {
    const root = rootTranscript()
    if (!root) return { artifacts: [], ambiguities: [] }
    return discoverSessionArtifacts({
      directory: sdk().directory,
      transcripts: [root, ...childTranscripts()],
      roles: DEEPINSPECT_ARTIFACT_ROLES,
      allowSameAgentPathRewrites: true,
    })
  })
  const reports = createMemo(() => ({
    text: artifactByRole(discovery(), "text-report"),
    visual: artifactByRole(discovery(), "visual-report"),
  }))
  const issueArtifact = createMemo(() => {
    const runDirectory = discovery().runDirectory
    if (!runDirectory) return
    return discovery().artifacts.find(
      (artifact) =>
        artifact.filename === "06-consolidated-issues.json" &&
        artifact.path.split("/").slice(0, -1).join("/") === runDirectory,
    )
  })

  createEffect(() => {
    const artifact = issueArtifact()
    if (artifact) void file.load(artifact.path)
  })

  const actualIssueCount = createMemo(() => {
    const artifact = issueArtifact()
    if (!artifact) return
    const content = file.get(artifact.path)?.content
    return content ? parseDeepInspectIssueCount(artifactText(content.content, content.encoding)) : undefined
  })
  const elapsedMs = createMemo(() => {
    const root = rootTranscript()
    if (!root) return 0
    return calculateElapsedMs({
      root,
      transcripts: [root, ...childTranscripts()],
      running: running(),
      now: state.now,
    })
  })

  const actualWorkbench = createMemo<AgentWorkbench>(() => {
    const root = rootSession()
    const rootData = rootTranscript()
    if (!root || !rootData) return emptyWorkbench(state.loading, state.error, props.sessionID() ?? "")
    const nodes = nodeResult()
    const reportFiles = reports()
    const artifacts = discovery()
    const artifactDirectory = cmccArtifactDirectory(root.metadata, sdk().directory)
    const directoryWarning = deepInspectArtifactDirectoryWarning({
      workspaceDirectory: sdk().directory,
      artifactDirectory,
      runDirectory: artifacts.runDirectory,
    })

    return {
      rootSessionId: root.id,
      query: extractUserQuery(rootData.messages, rootData.parts),
      overviewMarkdown: extractAssistantMarkdown(rootData.messages, rootData.parts),
      overviewTurns: extractOverviewConversation(rootData.messages, rootData.parts),
      overviewStatus: overviewStatus(),
      agents: nodes.agentNodes,
      nestedAgentSessions: [],
      nestedAgentSessionsLoading: false,
      stats: {
        elapsedMs: elapsedMs(),
        tokenCount: sumSessionTokens([root, ...childTranscripts().map((item) => item.session)]),
        uniqueSearchUrlCount: 0,
        expertCount: DEEPINSPECT_MEMBERS.length,
      },
      artifacts: artifacts.artifacts,
      textReportPath: reportFiles.text?.path,
      visualReportPath: reportFiles.visual?.path,
      ambiguities: [...nodes.ambiguities, ...artifacts.ambiguities, ...(directoryWarning ? [directoryWarning] : [])],
      loading: state.loading,
      error: state.error,
    }
  })

  const actualExecutions = createMemo(() => {
    const agentId = state.selectedAgentId
    if (agentId === "overview") return []
    return buildDeepInspectExecutions({
      agentId,
      children: children(),
      transcripts: transcriptById(),
      preferredSessionId: preferences().get(agentId),
      loadErrors: state.loadErrors,
    })
  })
  const canReplay = createMemo(() => {
    const source = actualWorkbench()
    if (!props.active() || state.loading || source.loading || source.error || running()) return false
    if (source.overviewStatus !== "completed") return false
    return !!(
      source.overviewMarkdown.trim() ||
      source.agents.some((agent) => agent.markdown.trim() || agent.sessionId) ||
      source.artifacts.length
    )
  })

  const updateReplay = (progress: number) => {
    const timeline = replayTimeline
    const frame = replayState.frame
    if (!timeline || !frame) return
    const advanced = advanceDeepTradingReplay({
      timeline,
      frame,
      nextCueIndex: replayNextCueIndex,
      progress,
    })
    replayNextCueIndex = advanced.nextCueIndex
    setReplayState({
      preparing: false,
      playing: true,
      progress: advanced.frame.progress,
      stage: deepTradingReplayStage(timeline, advanced.frame.progress),
      frame: advanced.frame,
    })
  }

  const startReplay = async () => {
    if (replayState.preparing || replayState.playing || !canReplay()) return false
    const runId = ++replayRunId
    const source = actualWorkbench()
    const rootSessionId = source.rootSessionId
    setReplayState("preparing", true)
    if (source.textReportPath) await file.load(source.textReportPath)
    if (runId !== replayRunId) return false
    if (actualWorkbench().rootSessionId !== rootSessionId || !canReplay()) {
      setReplayState("preparing", false)
      return false
    }
    const reportState = source.textReportPath ? file.get(source.textReportPath) : undefined
    const textReportMarkdown = reportState?.content
      ? artifactText(reportState.content.content, reportState.content.encoding)
      : ""
    replayTimeline = compileDeepTradingReplay({ workbench: source, searchUrlEvents: [], textReportMarkdown })
    replayNextCueIndex = 0
    replayStartedAt = performance.now()
    setState("selectedAgentId", "overview")
    setReplayState({
      preparing: false,
      playing: true,
      progress: 0,
      stage: "team",
      frame: createDeepTradingReplayFrame(replayTimeline),
    })
    updateReplay(0.001)
    replayTimer = window.setInterval(() => {
      if (runId !== replayRunId) {
        clearReplayTimer()
        return
      }
      const progress = Math.min(1, (performance.now() - replayStartedAt) / DEEPTRADING_REPLAY_DURATION_MS)
      updateReplay(progress)
      if (progress >= 1) stopReplay(true)
    }, 500)
    return true
  }

  const workbench = createMemo<AgentWorkbench>(() => {
    const source = actualWorkbench()
    if (!replayState.playing || !replayTimeline || !replayState.frame) return source
    return replayState.frame.workbench
  })
  const executions = createMemo(() => {
    const source = actualExecutions()
    const timeline = replayTimeline
    if (!replayState.playing || !timeline) return source
    return source.flatMap((execution) => {
      const start = deepTradingReplayProgressForTimestamp(timeline, execution.startedAt)
      if (replayState.progress < start) return []
      const completed = execution.completedAt
        ? deepTradingReplayProgressForTimestamp(timeline, execution.completedAt)
        : undefined
      return [
        {
          ...execution,
          status: completed !== undefined && replayState.progress < completed ? ("running" as const) : execution.status,
        },
      ]
    })
  })
  const issueCount = createMemo(() => {
    const value = actualIssueCount()
    if (!replayState.playing) return value
    const path = issueArtifact()?.path
    return path && workbench().artifacts.some((artifact) => artifact.path === path)
      ? value
      : value === undefined
        ? undefined
        : 0
  })
  const progressPercent = createMemo(() =>
    deepInspectProgress({
      nodes: workbench().agents,
      coreAgentIds: DEEPINSPECT_CORE_MEMBER_IDS,
      optionalAgentIds: DEEPINSPECT_OPTIONAL_MEMBER_IDS,
    }),
  )

  createEffect(
    on(
      () => props.active() && running(),
      (active) => {
        if (!active) return
        stopReplay()
        setState("now", Date.now())
        const timer = window.setInterval(() => setState("now", Date.now()), 1_000)
        onCleanup(() => window.clearInterval(timer))
      },
    ),
  )

  onCleanup(() => {
    replayRunId += 1
    clearReplayTimer()
  })

  const value: DeepInspectWorkbenchContextValue = {
    workbench,
    selectedAgentId: () => state.selectedAgentId,
    selectAgent(agentId) {
      if (agentId !== "overview" && !MEMBER_IDS.has(agentId)) return
      setState("selectedAgentId", agentId)
    },
    retrySession(sessionId) {
      return ensureComplete(sessionId, true)
    },
    executions,
    progressPercent,
    issueCount,
    replay: {
      canReplay,
      isPreparing: () => replayState.preparing,
      isReplaying: () => replayState.playing,
      progress: () => replayState.progress,
      stage: () => replayState.stage,
      textReportMarkdown: () => replayState.frame?.textReportMarkdown ?? "",
      start: startReplay,
      stop: () => stopReplay(),
    },
  }

  return <DeepInspectWorkbenchContext.Provider value={value}>{props.children}</DeepInspectWorkbenchContext.Provider>
}

export function useDeepInspectWorkbench() {
  const value = useContext(DeepInspectWorkbenchContext)
  if (!value) throw new Error("DeepInspectWorkbench context must be used within a provider")
  return value
}

function emptyWorkbench(loading: boolean, error?: string, rootSessionId = ""): AgentWorkbench {
  return {
    rootSessionId,
    query: "",
    overviewMarkdown: "",
    overviewTurns: [],
    overviewStatus: "waiting",
    agents: DEEPINSPECT_MEMBERS.map((member) => ({ ...member, status: "waiting", markdown: "" })),
    nestedAgentSessions: [],
    nestedAgentSessionsLoading: false,
    stats: { elapsedMs: 0, uniqueSearchUrlCount: 0, expertCount: DEEPINSPECT_MEMBERS.length },
    artifacts: [],
    ambiguities: [],
    loading,
    error,
  }
}
