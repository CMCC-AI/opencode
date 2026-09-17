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
import { createStore, reconcile } from "solid-js/store"
import { createWorkbenchRuntime } from "../agent-workbench/runtime"
import { createArtifactFileCatalog } from "../agent-workbench/artifact-file-catalog"
import { createReportLength } from "../agent-workbench/report-length-context"
import { useFile } from "@/context/file"
import { useSDK } from "@/context/sdk"
import { useSync } from "@/context/sync"
import { artifactText } from "@/pages/session/artifact-preview"
import type { AgentArtifactSource } from "../agent-workbench/artifact-source"
import { discoverSessionArtifacts } from "../agent-workbench/artifacts"
import type { AgentWorkbench, SessionTranscript } from "../agent-workbench/model"
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
import { calculateElapsedMs, sumSessionTokens } from "../agent-workbench/statistics"
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
} from "../deeptrading/replay"
import { DEEPINSIGHT_ARTIFACT_ROLES, DEEPINSIGHT_MEMBERS } from "./config"
import {
  deepInsightArtifactScope,
  deepInsightArtifactRevision,
  deepInsightCatalogArtifacts,
  deepInsightProgress,
  deepInsightReports,
  safeDeepInsightArtifacts,
} from "./data"
import { createDeepInsightRoute } from "./route-context"

const MESSAGE_PAGE_SIZE = 200
const MEMBER_IDS = new Set(DEEPINSIGHT_MEMBERS.map((member) => member.id))

export type DeepInsightWorkbenchContextValue = {
  workbench: Accessor<AgentWorkbench>
  selectedAgentId: Accessor<string>
  selectAgent: (agentId: string) => void
  retrySession: (sessionId: string) => Promise<void>
  reportLength: Accessor<number | undefined>
  progressPercent: Accessor<number>
  artifactSource?: AgentArtifactSource
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

const DeepInsightWorkbenchContext = createContext<DeepInsightWorkbenchContextValue>()

export function DeepInsightWorkbenchProvider(
  props: ParentProps<{ sessionID: Accessor<string | undefined>; active: Accessor<boolean> }>,
) {
  const file = useFile()
  const sdk = useSDK()
  const sync = useSync()
  const pending = new Map<string, Promise<void>>()
  const nestedPending = new Map<string, Promise<void>>()
  const nestedLoaded = new Set<string>()
  const [state, setState] = createStore({
    loading: false,
    error: undefined as string | undefined,
    selectedAgentId: "overview",
    now: Date.now(),
    loadErrors: {} as Record<string, string | undefined>,
    nestedLoading: {} as Record<string, boolean | undefined>,
    nestedLoadErrors: {} as Record<string, string | undefined>,
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
    const scope = generation
    const sessionSync = sync()
    setState("loadErrors", sessionId, undefined)
    const task = Promise.resolve()
      .then(async () => {
        await sessionSync.session.sync(sessionId, { force, messageLimit: MESSAGE_PAGE_SIZE })
        await sessionSync.session.prefetch(sessionId, MESSAGE_PAGE_SIZE)
        while (sessionSync.session.history.more(sessionId)) {
          const count = sessionSync.data.message[sessionId]?.length ?? 0
          await sessionSync.session.history.loadMore(sessionId, MESSAGE_PAGE_SIZE)
          if ((sessionSync.data.message[sessionId]?.length ?? 0) === count) break
        }
      })
      .catch((error: unknown) => {
        if (scope === generation)
          setState("loadErrors", sessionId, error instanceof Error ? error.message : String(error))
        throw error
      })
      .finally(() => {
        if (pending.get(sessionId) === task) pending.delete(sessionId)
      })
    pending.set(sessionId, task)
    return task
  }

  const loadNestedChildren = (parentSessionId: string) => {
    if (nestedLoaded.has(parentSessionId)) return Promise.resolve()
    const current = nestedPending.get(parentSessionId)
    if (current) return current
    const scope = generation
    const sessionSync = sync()
    setState("nestedLoading", parentSessionId, true)
    setState("nestedLoadErrors", parentSessionId, undefined)
    const task = sdk()
      .client.session.children({ sessionID: parentSessionId })
      .then(async (response) => {
        if (scope !== generation) return
        const items = (response.data ?? []).filter((session) => session.parentID === parentSessionId)
        items.forEach(sessionSync.session.remember)
        nestedLoaded.add(parentSessionId)
        await Promise.allSettled(items.map((session) => ensureComplete(session.id)))
      })
      .catch((error: unknown) => {
        if (scope !== generation) return
        setState("nestedLoadErrors", parentSessionId, error instanceof Error ? error.message : String(error))
        throw error
      })
      .finally(() => {
        if (nestedPending.get(parentSessionId) === task) nestedPending.delete(parentSessionId)
        if (scope !== generation) return
        setState("nestedLoading", parentSessionId, false)
      })
    nestedPending.set(parentSessionId, task)
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
        setState("nestedLoading", {})
        setState("nestedLoadErrors", {})
        nestedLoaded.clear()
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
  const resolution = createMemo(() => {
    const root = rootTranscript()
    return resolveAgentSessions({
      members: DEEPINSIGHT_MEMBERS,
      children: children(),
      preferredSessionIds: root ? extractTaskChildPreferences(root) : undefined,
    })
  })
  const selectedParentSession = createMemo(
    () => resolution().members.find(({ member }) => member.id === state.selectedAgentId)?.session,
  )
  const nestedChildren = createMemo(() => {
    const parent = selectedParentSession()
    if (!parent) return []
    return sync().data.session.filter((session) => session.parentID === parent.id)
  })
  const nestedKey = createMemo(() =>
    nestedChildren()
      .map((session) => session.id)
      .sort()
      .join(":"),
  )

  createEffect(
    on(
      () => ({ active: props.active(), parentSessionId: selectedParentSession()?.id }),
      (input) => {
        if (!input.active || !input.parentSessionId) return
        void loadNestedChildren(input.parentSessionId).catch(() => undefined)
      },
      { defer: false },
    ),
  )

  createEffect(
    on(nestedKey, () => {
      if (!props.active()) return
      nestedChildren().forEach((session) => void ensureComplete(session.id).catch(() => undefined))
    }),
  )

  const searchUrlEvents = () => []
  const nodeResult = createMemo(() => {
    const transcripts = childTranscripts()
    const nodes = buildAgentNodes({
      members: DEEPINSIGHT_MEMBERS,
      children: children(),
      transcripts: new Map(transcripts.map((item) => [item.session.id, item])),
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
  const nestedAgentSessions = createMemo(() => {
    const parent = selectedParentSession()
    const transcripts = nestedChildren().flatMap((session) => {
      const item = transcript(session.id)
      return item ? [[session.id, item] as const] : []
    })
    return buildNestedAgentSessions({
      parentSessionId: parent?.id,
      sessions: nestedChildren(),
      transcripts: new Map(transcripts),
      loadErrors: state.loadErrors,
    })
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
  const runtime = createWorkbenchRuntime({
    active: props.active,
    loading: () => state.loading,
    root: rootTranscript,
    children: childTranscripts,
    async fetchStatuses() {
      const response = await sdk().client.session.status()
      if (!response.data) throw new Error("Session status response is unavailable")
      return response.data
    },
    setStatus: (sessionId, status) => sync().set("session_status", sessionId, reconcile(status)),
    async reloadSession(sessionId, isCurrent) {
      await pending.get(sessionId)?.catch(() => undefined)
      if (isCurrent()) await ensureComplete(sessionId, true)
    },
  })
  const running = runtime.running
  const discovery = createMemo(() => {
    const root = rootTranscript()
    if (!root) return { artifacts: [], ambiguities: [] }
    const found = discoverSessionArtifacts({
      directory: sdk().directory,
      transcripts: [root, ...childTranscripts()],
      roles: DEEPINSIGHT_ARTIFACT_ROLES,
      allowSameAgentPathRewrites: true,
    })
    return safeDeepInsightArtifacts(found)
  })
  const artifactScope = createMemo(() =>
    deepInsightArtifactScope(sdk().directory, rootSession()?.metadata, discovery().artifacts),
  )
  const fileCatalog = createArtifactFileCatalog({
    rootPath: () => artifactScope().root,
    legacyResearch: true,
    revision: () =>
      deepInsightArtifactRevision([...(rootTranscript() ? [rootTranscript()!] : []), ...childTranscripts()]),
    root: rootSession,
    status: () => rootTranscript()?.status,
    artifacts: () => discovery().artifacts,
    list: (path) =>
      sdk()
        .client.file.list({ path })
        .then((response) => {
          if (!response.data) throw new Error("File list response is unavailable")
          return response.data
        }),
  })
  const catalogArtifacts = createMemo(() =>
    deepInsightCatalogArtifacts(fileCatalog.files(), [
      ...(rootTranscript() ? [rootTranscript()!] : []),
      ...childTranscripts(),
    ]),
  )
  const reports = createMemo(() => deepInsightReports(catalogArtifacts(), artifactScope().root))
  const researchRoute = createDeepInsightRoute({
    path: () => reports().routePath,
    revision: () =>
      deepInsightArtifactRevision([...(rootTranscript() ? [rootTranscript()!] : []), ...childTranscripts()]),
    source: {
      load: (path, force) => file.load(path, { force }),
      get: (path) => {
        const state = file.get(path)
        return {
          loaded: !!state?.loaded,
          error: state?.error,
          text:
            state?.content?.type === "text" ? artifactText(state.content.content, state.content.encoding) : undefined,
        }
      },
    },
  })
  const reportRevision = createMemo<number | undefined>((previous) =>
    running() ? previous : rootSession()?.time.updated,
  )
  const reportLength = createReportLength({
    scope: () => rootSession()?.id,
    report: () => reports().text,
    revision: reportRevision,
    source: {
      load: (path, force) => file.load(path, { force }),
      get: (path) => {
        const current = file.get(path)
        return {
          loaded: !!current?.loaded,
          loading: current?.loading,
          error: current?.error,
          text:
            current?.content?.type === "text"
              ? artifactText(current.content.content, current.content.encoding)
              : undefined,
        }
      },
    },
    replaying: () => replayState.playing,
    replayMarkdown: () => replayState.frame?.textReportMarkdown ?? "",
  })
  const stats = createMemo(() => {
    const root = rootTranscript()
    if (!root) return { tokenCount: undefined, uniqueSearchUrlCount: 0 }
    return {
      tokenCount: sumSessionTokens([root.session, ...childTranscripts().map((item) => item.session)]),
      uniqueSearchUrlCount: 0,
    }
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
    const currentStats = stats()
    const detailParent = selectedParentSession()
    return {
      rootSessionId: root.id,
      query: extractUserQuery(rootData.messages, rootData.parts),
      overviewMarkdown: extractAssistantMarkdown(rootData.messages, rootData.parts),
      overviewTurns: extractOverviewConversation(rootData.messages, rootData.parts),
      overviewStatus: overviewStatus(),
      agents: nodes.agentNodes,
      nestedAgentSessions: nestedAgentSessions(),
      nestedAgentSessionsLoading: !!detailParent && !!state.nestedLoading[detailParent.id],
      nestedAgentSessionsError: detailParent ? state.nestedLoadErrors[detailParent.id] : undefined,
      stats: {
        elapsedMs: elapsedMs(),
        tokenCount: currentStats.tokenCount,
        uniqueSearchUrlCount: currentStats.uniqueSearchUrlCount,
        expertCount: DEEPINSIGHT_MEMBERS.length,
      },
      artifacts: catalogArtifacts(),
      fileArtifacts: catalogArtifacts(),
      textReportPath: reportFiles.text?.path,
      visualReportPath: reportFiles.visual?.path,
      ambiguities: [
        ...nodes.ambiguities,
        ...artifacts.ambiguities,
        ...fileCatalog.warnings(),
        ...artifactScope().warnings,
        ...reportFiles.ambiguities,
        ...(runtime.warning() ? [runtime.warning()!] : []),
      ],
      loading: state.loading,
      error: state.error,
    }
  })

  const canReplay = createMemo(() => {
    if (fileCatalog.loading()) return false
    const source = actualWorkbench()
    if (runtime.syncing() || runtime.warning() || source.agents.some((agent) => agent.status === "running"))
      return false
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
    replayTimeline = compileDeepTradingReplay({
      workbench: source,
      searchUrlEvents: searchUrlEvents(),
      textReportMarkdown,
    })
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
    const timeline = replayTimeline
    const frame = replayState.frame
    if (!replayState.playing || !timeline || !frame) return source
    if (state.selectedAgentId === "overview") return frame.workbench
    const selected = frame.workbench.agents.find((agent) => agent.id === state.selectedAgentId)
    if (!selected || selected.status === "waiting") return frame.workbench
    return {
      ...frame.workbench,
      nestedAgentSessions: replayNestedAgentSessions(timeline, source.nestedAgentSessions, replayState.progress),
      nestedAgentSessionsLoading: source.nestedAgentSessionsLoading,
      nestedAgentSessionsError: source.nestedAgentSessionsError,
    }
  })

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
    generation += 1
    replayRunId += 1
    clearReplayTimer()
  })

  const value: DeepInsightWorkbenchContextValue = {
    workbench,
    reportLength,
    progressPercent: () =>
      deepInsightProgress(
        workbench().agents,
        researchRoute(),
        (replayState.playing ? workbench().overviewStatus === "running" : running()) ||
          !workbench().artifacts.some((item) => item.filename === "35-report.pdf"),
      ),
    selectedAgentId: () => state.selectedAgentId,
    selectAgent(agentId) {
      if (agentId !== "overview" && !MEMBER_IDS.has(agentId)) return
      setState("selectedAgentId", agentId)
    },
    retrySession(sessionId) {
      return ensureComplete(sessionId, true)
    },
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

  return <DeepInsightWorkbenchContext.Provider value={value}>{props.children}</DeepInsightWorkbenchContext.Provider>
}

export function useDeepInsightWorkbench() {
  const value = useContext(DeepInsightWorkbenchContext)
  if (!value) throw new Error("DeepInsightWorkbench context must be used within a provider")
  return value
}

export function DeepInsightWorkbenchValueProvider(props: ParentProps<{ value: DeepInsightWorkbenchContextValue }>) {
  return (
    <DeepInsightWorkbenchContext.Provider value={props.value}>{props.children}</DeepInsightWorkbenchContext.Provider>
  )
}

function emptyWorkbench(loading: boolean, error?: string, rootSessionId = ""): AgentWorkbench {
  return {
    rootSessionId,
    query: "",
    overviewMarkdown: "",
    overviewTurns: [],
    overviewStatus: "waiting",
    agents: DEEPINSIGHT_MEMBERS.map((member) => ({ ...member, status: "waiting", markdown: "" })),
    nestedAgentSessions: [],
    nestedAgentSessionsLoading: false,
    stats: { elapsedMs: 0, uniqueSearchUrlCount: 0, expertCount: DEEPINSIGHT_MEMBERS.length },
    artifacts: [],
    ambiguities: [],
    loading,
    error,
  }
}
