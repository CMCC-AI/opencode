import { createSimpleContext } from "@opencode-ai/ui/context"
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
import { artifactByRole, discoverSessionArtifacts } from "../agent-workbench/artifacts"
import type { AgentWorkbench, SessionTranscript } from "../agent-workbench/model"
import {
  buildNestedAgentSessions,
  buildAgentNodes,
  deriveSessionStatus,
  extractAssistantMarkdown,
  extractOverviewConversation,
  extractTaskChildPreferences,
  extractUserQuery,
  resolveAgentSessions,
} from "../agent-workbench/session-adapter"
import { calculateElapsedMs, collectSearchUrlEvents, sumSessionTokens } from "../agent-workbench/statistics"
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

const MESSAGE_PAGE_SIZE = 200
const DEEPTRADING_MEMBER_IDS = new Set(DEEPTRADING_MEMBERS.map((member) => member.id))

export type DeepTradingArtifactContent = {
  loaded: boolean
  loading?: boolean
  error?: string
  text?: string
}

export type DeepTradingArtifactSource = {
  get: (path: string) => DeepTradingArtifactContent | undefined
  load: (path: string) => Promise<void>
  download: (path: string) => Promise<Blob>
  previewUrl: (path: string) => string | undefined
}

export type DeepTradingWorkbenchContextValue = {
  workbench: Accessor<AgentWorkbench>
  selectedAgentId: Accessor<string>
  selectAgent: (agentId: string) => void
  retrySession: (sessionId: string) => Promise<void>
  artifactSource?: DeepTradingArtifactSource
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

const DeepTradingWorkbenchContext = createContext<DeepTradingWorkbenchContextValue>()

function createLiveDeepTradingWorkbench(props: { sessionID: Accessor<string | undefined>; active: Accessor<boolean> }) {
    const file = useFile()
    const sdk = useSDK()
    const sync = useSync()
    const pending = new Map<string, Promise<void>>()
    const nestedPending = new Map<string, Promise<void>>()
    const nestedLoaded = new Set<string>()
    const invalidSearchOutputs = new Set<string>()
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
        (session) => session.parentID === root.id && !!session.agent && DEEPTRADING_MEMBER_IDS.has(session.agent),
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

    const loadNestedChildren = (parentSessionId: string) => {
      if (nestedLoaded.has(parentSessionId)) return Promise.resolve()
      const current = nestedPending.get(parentSessionId)
      if (current) return current
      setState("nestedLoading", parentSessionId, true)
      setState("nestedLoadErrors", parentSessionId, undefined)
      const task = sdk()
        .client.session.children({ sessionID: parentSessionId })
        .then(async (response) => {
          const items = (response.data ?? []).filter((session) => session.parentID === parentSessionId)
          items.forEach(sync().session.remember)
          nestedLoaded.add(parentSessionId)
          await Promise.allSettled(items.map((session) => ensureComplete(session.id)))
        })
        .catch((error: unknown) => {
          setState(
            "nestedLoadErrors",
            parentSessionId,
            error instanceof Error ? error.message : String(error),
          )
          throw error
        })
        .finally(() => {
          nestedPending.delete(parentSessionId)
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
          invalidSearchOutputs.clear()
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
                  (session) =>
                    session.parentID === input.sessionId &&
                    !!session.agent &&
                    DEEPTRADING_MEMBER_IDS.has(session.agent),
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
        members: DEEPTRADING_MEMBERS,
        children: children(),
        preferredSessionIds: root ? extractTaskChildPreferences(root) : undefined,
      })
    })
    const selectedParentSession = createMemo(() =>
      resolution().members.find(({ member }) => member.id === state.selectedAgentId)?.session,
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
    const selectedChildTranscripts = createMemo(() => {
      const transcriptById = new Map(childTranscripts().map((item) => [item.session.id, item]))
      return resolution().members.flatMap(({ session }) => {
        const item = session ? transcriptById.get(session.id) : undefined
        return item ? [item] : []
      })
    })
    const searchUrlEvents = createMemo(() =>
      collectSearchUrlEvents(selectedChildTranscripts(), (input) => {
        const key = `${input.sessionId}/${input.messageId}/${input.partId}`
        if (invalidSearchOutputs.has(key)) return
        invalidSearchOutputs.add(key)
        console.warn(`DeepTrading websearch output is invalid: ${key}`)
      }),
    )
    const nodeResult = createMemo(() => {
      const transcripts = childTranscripts()
      const nodes = buildAgentNodes({
        members: DEEPTRADING_MEMBERS,
        children: children(),
        transcripts: new Map(transcripts.map((item) => [item.session.id, item])),
        resolution: resolution(),
      })
      const agentNodes = nodes.nodes.map((node) => {
        const error = node.sessionId ? state.loadErrors[node.sessionId] : undefined
        return error ? { ...node, status: "failed" as const, ambiguity: `会话加载失败：${error}` } : node
      })
      return { agentNodes, ambiguities: nodes.ambiguities }
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
    const running = createMemo(
      () => overviewStatus() === "running" || nodeResult().agentNodes.some((node) => node.status === "running"),
    )
    const discovery = createMemo(() => {
      const root = rootTranscript()
      if (!root) return { artifacts: [], ambiguities: [] }
      return discoverSessionArtifacts({
        directory: sdk().directory,
        transcripts: [root, ...childTranscripts()],
        roles: DEEPTRADING_ARTIFACT_ROLES,
      })
    })
    const reports = createMemo(() => ({
      text: artifactByRole(discovery(), "text-report"),
      visual: artifactByRole(discovery(), "visual-report"),
    }))

    const stableStats = createMemo(() => {
      const root = rootTranscript()
      if (!root) return { tokenCount: undefined, uniqueSearchUrlCount: 0 }
      const selected = selectedChildTranscripts()
      return {
        tokenCount: sumSessionTokens([root.session, ...selected.map((item) => item.session)]),
        uniqueSearchUrlCount: new Set(searchUrlEvents().flatMap((event) => event.urls)).size,
      }
    })

    const elapsedMs = createMemo(() => {
      const root = rootTranscript()
      if (!root) return 0
      return calculateElapsedMs({
        root,
        transcripts: [root, ...selectedChildTranscripts()],
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
      const stats = stableStats()
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
          tokenCount: stats.tokenCount,
          uniqueSearchUrlCount: stats.uniqueSearchUrlCount,
          expertCount: DEEPTRADING_MEMBERS.length,
        },
        artifacts: artifacts.artifacts,
        textReportPath: reportFiles.text?.path,
        visualReportPath: reportFiles.visual?.path,
        ambiguities: [...nodes.ambiguities, ...artifacts.ambiguities],
        loading: state.loading,
        error: state.error,
      }
    })

    const canReplay = createMemo(() => {
      const source = actualWorkbench()
      if (!props.active() || state.loading || source.loading || source.error || running()) return false
      if (source.overviewStatus !== "completed") return false
      return !!(
        source.overviewMarkdown.trim() ||
        source.agents.some((agent) => agent.markdown.trim() || agent.sessionId) ||
        source.artifacts.length ||
        source.textReportPath ||
        source.visualReportPath
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

    const finishReplay = (runId: number) => {
      if (runId !== replayRunId) return
      stopReplay(true)
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
      const timeline = compileDeepTradingReplay({
        workbench: source,
        searchUrlEvents: searchUrlEvents(),
        textReportMarkdown,
      })
      replayTimeline = timeline
      replayNextCueIndex = 0
      replayStartedAt = performance.now()
      setState("selectedAgentId", "overview")
      setReplayState({
        preparing: false,
        playing: true,
        progress: 0,
        stage: "team",
        frame: createDeepTradingReplayFrame(timeline),
      })
      updateReplay(0.001)
      replayTimer = window.setInterval(() => {
        if (runId !== replayRunId) {
          clearReplayTimer()
          return
        }
        const progress = Math.min(1, (performance.now() - replayStartedAt) / DEEPTRADING_REPLAY_DURATION_MS)
        updateReplay(progress)
        if (progress >= 1) finishReplay(runId)
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
        (running) => {
          if (!running) return
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

    return {
      workbench,
      selectedAgentId: () => state.selectedAgentId,
      selectAgent(agentId: string) {
        if (agentId !== "overview" && !DEEPTRADING_MEMBERS.some((member) => member.id === agentId)) return
        setState("selectedAgentId", agentId)
      },
      retrySession(sessionId: string) {
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
}

export function useDeepTradingWorkbench() {
  const value = useContext(DeepTradingWorkbenchContext)
  if (!value) throw new Error("DeepTradingWorkbench context must be used within a provider")
  return value
}

export function DeepTradingWorkbenchProvider(
  props: ParentProps<{ sessionID: Accessor<string | undefined>; active: Accessor<boolean> }>,
) {
  const value = createLiveDeepTradingWorkbench(props)
  return <DeepTradingWorkbenchContext.Provider value={value}>{props.children}</DeepTradingWorkbenchContext.Provider>
}

export function DeepTradingWorkbenchValueProvider(
  props: ParentProps<{ value: DeepTradingWorkbenchContextValue }>,
) {
  return <DeepTradingWorkbenchContext.Provider value={props.value}>{props.children}</DeepTradingWorkbenchContext.Provider>
}

function emptyWorkbench(loading: boolean, error?: string, rootSessionId = ""): AgentWorkbench {
  return {
    rootSessionId,
    query: "",
    overviewMarkdown: "",
    overviewTurns: [],
    overviewStatus: "waiting",
    agents: DEEPTRADING_MEMBERS.map((member) => ({ ...member, status: "waiting", markdown: "" })),
    nestedAgentSessions: [],
    nestedAgentSessionsLoading: false,
    stats: { elapsedMs: 0, uniqueSearchUrlCount: 0, expertCount: DEEPTRADING_MEMBERS.length },
    artifacts: [],
    ambiguities: [],
    loading,
    error,
  }
}
