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
import { useSDK } from "@/context/sdk"
import { useSync } from "@/context/sync"
import { cmccScanWorkspaceArtifactPaths, cmccWorkspaceRelativePath } from "@/utils/cmcc-artifact-paths"
import { cmccArtifactDirectory } from "@/utils/cmcc-workspace"
import { discoverSessionArtifacts } from "../agent-workbench/artifacts"
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
import { AI_SCIENCE_MEMBERS } from "./config"
import {
  aiScienceOutOfArtifactWriteCount,
  aiScienceProgress,
  buildAiScienceExecutions,
  mergeAiScienceArtifacts,
  type AiScienceExecutionView,
} from "./data"

const MESSAGE_PAGE_SIZE = 200
const ARTIFACT_REFRESH_MS = 5_000
const ARTIFACT_SCAN_LIMIT = 200
const MEMBER_IDS = new Set(AI_SCIENCE_MEMBERS.map((member) => member.id))

export type AiScienceWorkbenchContextValue = {
  workbench: Accessor<AgentWorkbench>
  selectedAgentId: Accessor<string>
  selectAgent: (agentId: string) => void
  retrySession: (sessionId: string) => Promise<void>
  executions: Accessor<AiScienceExecutionView[]>
  progressPercent: Accessor<number>
  artifactRoot: Accessor<string | undefined>
  filesLoading: Accessor<boolean>
  replay: {
    canReplay: Accessor<boolean>
    isPreparing: Accessor<boolean>
    isReplaying: Accessor<boolean>
    progress: Accessor<number>
    stage: Accessor<DeepTradingReplayStage>
    start: () => Promise<boolean>
    stop: () => void
  }
}

const AiScienceWorkbenchContext = createContext<AiScienceWorkbenchContextValue>()

export function AiScienceWorkbenchProvider(
  props: ParentProps<{ sessionID: Accessor<string | undefined>; active: Accessor<boolean> }>,
) {
  const sdk = useSDK()
  const sync = useSync()
  const pending = new Map<string, Promise<void>>()
  const [state, setState] = createStore({
    loading: false,
    error: undefined as string | undefined,
    selectedAgentId: "overview",
    now: Date.now(),
    loadErrors: {} as Record<string, string | undefined>,
    scannedPaths: [] as string[],
    filesLoading: false,
    filesError: undefined as string | undefined,
  })
  const [replayState, setReplayState] = createStore({
    preparing: false,
    playing: false,
    progress: 0,
    stage: "idle" as DeepTradingReplayStage,
    frame: undefined as DeepTradingReplayFrame | undefined,
  })
  let generation = 0
  let artifactGeneration = 0
  let artifactPending: Promise<void> | undefined
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
  const artifactRoot = createMemo(() => {
    const root = rootSession()
    if (!root) return undefined
    const value = cmccArtifactDirectory(root.metadata, sdk().directory)
    return value ? cmccWorkspaceRelativePath(sdk().directory, value) : undefined
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
    if (!session) return undefined
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

  const scanArtifacts = () => {
    const root = artifactRoot()
    if (!props.active() || !root) {
      setState("scannedPaths", [])
      return Promise.resolve()
    }
    if (artifactPending) return artifactPending
    const directory = sdk().directory
    const current = artifactGeneration
    setState("filesLoading", true)
    setState("filesError", undefined)
    const list = (path: string) => sdk().client.file.list({ path }).then((response) => response.data ?? [])
    const task = Promise.all([
      cmccScanWorkspaceArtifactPaths(list, [root], true),
      list(root).then((nodes) =>
        nodes.filter((node) => node.type === "file").map((node) => scopedNodePath(root, node.path)),
      ),
    ])
      .then(([paths, rootFiles]) => {
        if (artifactGeneration !== current || sdk().directory !== directory || artifactRoot() !== root) return
        setState("scannedPaths", [...new Set([...paths, ...rootFiles])].sort((left, right) => left.localeCompare(right)))
      })
      .catch((error: unknown) => {
        if (artifactGeneration !== current) return
        setState("filesError", error instanceof Error ? error.message : String(error))
      })
      .finally(() => {
        if (artifactGeneration === current) setState("filesLoading", false)
        if (artifactPending === task) artifactPending = undefined
      })
    artifactPending = task
    return task
  }

  createEffect(
    on(
      () => ({ active: props.active(), directory: sdk().directory, sessionId: props.sessionID() }),
      (input) => {
        stopReplay()
        const current = ++generation
        artifactGeneration += 1
        artifactPending = undefined
        setState("selectedAgentId", "overview")
        setState("error", undefined)
        setState("loadErrors", {})
        setState("scannedPaths", [])
        setState("filesError", undefined)
        if (!input.active || !input.sessionId) {
          setState("loading", false)
          setState("filesLoading", false)
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
              items.forEach((session) => sync().session.remember(session))
              return Promise.allSettled(items.map((session) => ensureComplete(session.id)))
            }),
        ])
          .catch((error: unknown) => {
            if (generation !== current) return
            setState("error", error instanceof Error ? error.message : String(error))
          })
          .finally(() => {
            if (generation !== current) return
            setState("loading", false)
            void scanArtifacts()
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
      members: AI_SCIENCE_MEMBERS,
      children: children(),
      preferredSessionIds: preferences(),
    }),
  )
  const nodeResult = createMemo(() => {
    const nodes = buildAgentNodes({
      members: AI_SCIENCE_MEMBERS,
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
  const writtenDiscovery = createMemo(() => {
    const root = rootTranscript()
    if (!root) return { artifacts: [], ambiguities: [] }
    return discoverSessionArtifacts({
      directory: sdk().directory,
      transcripts: [root, ...childTranscripts()],
      roles: {},
      allowSameAgentPathRewrites: true,
    })
  })
  const artifacts = createMemo(() =>
    mergeAiScienceArtifacts({
      artifactRoot: artifactRoot(),
      scannedPaths: state.scannedPaths,
      writtenArtifacts: writtenDiscovery().artifacts,
      rootSessionId: rootSession()?.id ?? "",
    }),
  )
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
    const discovered = writtenDiscovery()
    const outsideCount = aiScienceOutOfArtifactWriteCount(discovered.artifacts, artifactRoot())
    const warnings = [
      ...nodes.ambiguities,
      ...discovered.ambiguities,
      ...(outsideCount
        ? [`检测到 ${outsideCount} 个 write 产物位于独立会话目录外，已从文件列表中排除`]
        : []),
      ...(state.filesError ? [`会话产物目录读取失败：${state.filesError}`] : []),
      ...(state.scannedPaths.length >= ARTIFACT_SCAN_LIMIT
        ? [`会话产物达到 ${ARTIFACT_SCAN_LIMIT} 个文件的展示上限，文件列表可能未完全展开`]
        : []),
      ...(!artifactRoot() ? ["当前会话缺少独立产物目录，文件列表仅展示可确认的 write 记录"] : []),
    ]

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
        expertCount: AI_SCIENCE_MEMBERS.length,
      },
      artifacts: artifacts(),
      ambiguities: [...new Set(warnings)],
      loading: state.loading,
      error: state.error,
    }
  })

  const actualExecutions = createMemo(() => {
    const agentId = state.selectedAgentId
    if (agentId === "overview") return []
    return buildAiScienceExecutions({
      agentId,
      children: children(),
      transcripts: transcriptById(),
      preferredSessionId: preferences().get(agentId),
      loadErrors: state.loadErrors,
    })
  })
  const canReplay = createMemo(() => {
    const source = actualWorkbench()
    if (!props.active() || state.loading || state.filesLoading || source.loading || source.error || running()) return false
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
    const advanced = advanceDeepTradingReplay({ timeline, frame, nextCueIndex: replayNextCueIndex, progress })
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
    if (runId !== replayRunId || actualWorkbench().rootSessionId !== rootSessionId || !canReplay()) {
      setReplayState("preparing", false)
      return false
    }
    replayTimeline = compileDeepTradingReplay({ workbench: source, searchUrlEvents: [], textReportMarkdown: "" })
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
  const progressPercent = createMemo(() =>
    replayState.playing
      ? Math.round(replayState.progress * 100)
      : aiScienceProgress({ nodes: workbench().agents, overviewStatus: workbench().overviewStatus }),
  )

  createEffect(
    on(
      () => props.active() && running(),
      (active) => {
        if (!active) return
        stopReplay()
        setState("now", Date.now())
        const elapsedTimer = window.setInterval(() => setState("now", Date.now()), 1_000)
        const artifactTimer = window.setInterval(() => void scanArtifacts(), ARTIFACT_REFRESH_MS)
        onCleanup(() => {
          window.clearInterval(elapsedTimer)
          window.clearInterval(artifactTimer)
        })
      },
    ),
  )

  onCleanup(() => {
    artifactGeneration += 1
    replayRunId += 1
    clearReplayTimer()
  })

  const value: AiScienceWorkbenchContextValue = {
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
    artifactRoot,
    filesLoading: () => state.filesLoading,
    replay: {
      canReplay,
      isPreparing: () => replayState.preparing,
      isReplaying: () => replayState.playing,
      progress: () => replayState.progress,
      stage: () => replayState.stage,
      start: startReplay,
      stop: () => stopReplay(),
    },
  }

  return <AiScienceWorkbenchContext.Provider value={value}>{props.children}</AiScienceWorkbenchContext.Provider>
}

export function useAiScienceWorkbench() {
  const value = useContext(AiScienceWorkbenchContext)
  if (!value) throw new Error("AI for Science workbench context must be used within a provider")
  return value
}

function emptyWorkbench(loading: boolean, error?: string, rootSessionId = ""): AgentWorkbench {
  return {
    rootSessionId,
    query: "",
    overviewMarkdown: "",
    overviewTurns: [],
    overviewStatus: "waiting",
    agents: AI_SCIENCE_MEMBERS.map((member) => ({ ...member, status: "waiting", markdown: "" })),
    nestedAgentSessions: [],
    nestedAgentSessionsLoading: false,
    stats: { elapsedMs: 0, uniqueSearchUrlCount: 0, expertCount: AI_SCIENCE_MEMBERS.length },
    artifacts: [],
    ambiguities: [],
    loading,
    error,
  }
}

function scopedNodePath(root: string, value: string) {
  const normalizedRoot = root.replaceAll("\\", "/").replace(/^\/+|\/+$/g, "")
  const normalizedValue = value.replaceAll("\\", "/").replace(/^\/+|\/+$/g, "")
  if (normalizedValue === normalizedRoot || normalizedValue.startsWith(`${normalizedRoot}/`)) return normalizedValue
  return `${normalizedRoot}/${normalizedValue}`
}
