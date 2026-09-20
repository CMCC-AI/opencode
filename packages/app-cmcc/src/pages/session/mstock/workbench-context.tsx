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
import type { SessionTranscript } from "../agent-workbench/model"
import type { AgentArtifactSource } from "../agent-workbench/artifact-source"
import type { DeepTradingWorkbenchContextValue } from "../deeptrading/workbench-context"
import { useSDK } from "@/context/sdk"
import { useSync } from "@/context/sync"
import { useFile } from "@/context/file"
import { artifactText } from "../artifact-preview"
import { discoverSessionArtifacts } from "../agent-workbench/artifacts"
import { createArtifactFileCatalog } from "../agent-workbench/artifact-file-catalog"
import { createWorkbenchRuntime } from "../agent-workbench/runtime"
import { createReportLength } from "../agent-workbench/report-length-context"
import { createCaseSnapshotReplay } from "../agent-workbench/snapshot-replay"
import { MSTOCK_ARTIFACT_ROLES } from "./config"
import { mstockFiles, mstockProgress, mstockScope, mstockWorkbench } from "./data"

export type MstockWorkbenchContextValue = DeepTradingWorkbenchContextValue & {
  reportLength: Accessor<number | undefined>
  progressPercent: Accessor<number>
}
const Context = createContext<MstockWorkbenchContextValue>()
export function useMstockWorkbench() {
  const value = useContext(Context)
  if (!value) throw new Error("Mstock workbench provider missing")
  return value
}
export function MstockWorkbenchValueProvider(props: ParentProps<{ value: MstockWorkbenchContextValue }>) {
  return <Context.Provider value={props.value}>{props.children}</Context.Provider>
}

export function MstockWorkbenchProvider(
  props: ParentProps<{ sessionID: Accessor<string | undefined>; active: Accessor<boolean> }>,
) {
  const sdk = useSDK()
  const sync = useSync()
  const file = useFile()
  const [state, setState] = createStore({
    loading: false,
    error: undefined as string | undefined,
    selected: "overview",
    now: Date.now(),
  })
  const pending = new Map<string, Promise<void>>()
  const loaded = new Set<string>()
  let generation = 0
  const root = createMemo(() =>
    props.active() && props.sessionID() ? sync().session.get(props.sessionID()!) : undefined,
  )
  const tree = createMemo(() => {
    const current = root()
    if (!current) return []
    const ids = new Set([current.id])
    const sessions = sync().data.session
    for (let count = 0; count < 20; count++) {
      const before = ids.size
      sessions.forEach((session) => {
        if (session.parentID && ids.has(session.parentID)) ids.add(session.id)
      })
      if (ids.size === before) break
    }
    return [current, ...sessions.filter((session) => session.id !== current.id && ids.has(session.id))]
  })
  const transcripts = createMemo<SessionTranscript[]>(() =>
    tree().map((session) => ({
      session,
      status: sync().data.session_status[session.id],
      messages: sync().data.message[session.id] ?? [],
      parts: sync().data.part,
    })),
  )
  const ensure = (id: string, force = false) => {
    const existing = pending.get(id)
    if (existing) return existing
    const work = (async () => {
      await sync().session.sync(id, { force, messageLimit: 200 })
      await sync().session.prefetch(id, 200)
      while (sync().session.history.more(id)) {
        const before = sync().data.message[id]?.length ?? 0
        await sync().session.history.loadMore(id, 200)
        if ((sync().data.message[id]?.length ?? 0) === before) break
      }
      loaded.add(id)
    })().finally(() => pending.delete(id))
    pending.set(id, work)
    return work
  }
  createEffect(
    on(
      () => [props.active(), props.sessionID(), sdk().directory] as const,
      ([active, id]) => {
        const current = ++generation
        loaded.clear()
        setState({ selected: "overview", error: undefined, loading: !!active && !!id })
        if (!active || !id) return
        void (async () => {
          const queue = [id]
          const seen = new Set<string>()
          while (queue.length && generation === current) {
            const parent = queue.shift()!
            if (seen.has(parent)) continue
            seen.add(parent)
            if (seen.size > 200) throw new Error("会话数量超过读取上限")
            await ensure(parent)
            const children = await sdk().client.session.children({ sessionID: parent })
            if (current !== generation) return
            for (const child of children.data ?? [])
              if (child.parentID === parent) {
                sync().session.remember(child)
                queue.push(child.id)
              }
          }
        })()
          .catch((error) => {
            if (current === generation) setState("error", String(error))
          })
          .finally(() => {
            if (current === generation) setState("loading", false)
          })
      },
    ),
  )
  createEffect(
    on(
      () =>
        tree()
          .map((session) => session.id)
          .join(":"),
      () => {
        const current = generation
        for (const session of tree())
          if (!loaded.has(session.id))
            void ensure(session.id).catch((error) => {
              if (current === generation) setState("error", String(error))
            })
      },
    ),
  )
  const runtime = createWorkbenchRuntime({
    active: props.active,
    loading: () => state.loading,
    root: () => transcripts()[0],
    children: () => transcripts().slice(1),
    fetchStatuses: async () => {
      const result = (await sdk().client.session.status()).data
      if (!result) throw new Error("未返回会话运行状态")
      return result
    },
    setStatus: (id, status) => sync().set("session_status", id, reconcile(status)),
    reloadSession: async (id, current) => {
      if (current()) await ensure(id, true)
    },
  })
  const discovery = createMemo(() =>
    discoverSessionArtifacts({
      directory: sdk().directory,
      transcripts: transcripts(),
      roles: MSTOCK_ARTIFACT_ROLES,
      allowSameAgentPathRewrites: true,
      allowWorkflowPathRewrites: true,
    }),
  )
  const scope = createMemo(() => mstockScope(sdk().directory, root()?.metadata, discovery().artifacts))
  const revision = createMemo(() =>
    transcripts()
      .flatMap((entry) =>
        entry.messages.flatMap((message) =>
          (entry.parts[message.id] ?? []).flatMap((part) =>
            part.type === "tool" &&
            part.state.status === "completed" &&
            (["write", "edit", "task"].includes(part.tool) ||
              (part.tool === "bash" &&
                /(?:render_html\.py|export-report-pdf\.mjs|stats\.py)/.test(String(part.state.input.command ?? ""))))
              ? [part.id]
              : [],
          ),
        ),
      )
      .join(":"),
  )
  const catalog = createArtifactFileCatalog({
    root,
    status: () => transcripts()[0]?.status,
    artifacts: () => discovery().artifacts,
    rootPath: () => scope().root,
    legacyComparison: true,
    revision,
    list: async (path) => {
      const result = (await sdk().client.file.list({ path })).data
      if (!result) throw new Error("未返回文件清单")
      return result
    },
  })
  const actual = createMemo(() =>
    mstockWorkbench({
      rootId: root()?.id ?? "",
      transcripts: transcripts(),
      files: scope().root
        ? mstockFiles(catalog.files(), transcripts()).filter((item) => item.path.startsWith(`${scope().root}/`))
        : [],
      selected: state.selected,
      running: runtime.running(),
      now: state.now,
      loading: state.loading,
      error: state.error,
      warnings: [
        ...scope().warnings,
        ...discovery().ambiguities,
        ...catalog.warnings(),
        ...(runtime.warning() ? [runtime.warning()!] : []),
      ],
    }),
  )
  const source: AgentArtifactSource = {
    get: (path) => {
      const value = file.get(path)
      return (
        value && {
          loaded: !!value.loaded,
          loading: value.loading,
          error: value.error,
          text:
            value.content?.type === "text" ? artifactText(value.content.content, value.content.encoding) : undefined,
        }
      )
    },
    load: async (path) => {
      await file.load(path)
    },
    download: async (path) => {
      const response = await sdk().client.file.download({ path })
      if (!(response.data instanceof Blob)) throw new Error("文件下载失败")
      return response.data
    },
    previewUrl: () => undefined,
  }
  const replay = createCaseSnapshotReplay({
    workbench: actual,
    selectedAgentId: () => state.selected,
    selectOverview: () => setState("selected", "overview"),
    artifactSource: source,
  })
  const reportLength = createReportLength({
    filename: "20-comparison-report.md",
    scope: () => root()?.id ?? "",
    report: () => actual().artifacts.find((item) => item.path === actual().textReportPath),
    source: { ...source, load: (path, force) => file.load(path, { force }) },
    replaying: replay.replay.isReplaying,
    replayMarkdown: replay.replay.textReportMarkdown,
  })
  createEffect(() => {
    if (actual().visualReportPath) void source.load(actual().visualReportPath!)
  })
  createEffect(
    on(runtime.running, (running) => {
      if (!running) return
      replay.replay.stop()
      setState("now", Date.now())
      const timer = window.setInterval(() => setState("now", Date.now()), 1000)
      onCleanup(() => window.clearInterval(timer))
    }),
  )
  onCleanup(() => {
    generation++
    replay.replay.stop()
  })
  const value: MstockWorkbenchContextValue = {
    workbench: replay.workbench,
    selectedAgentId: () => state.selected,
    selectAgent: (id) => setState("selected", id),
    retrySession: (id) => ensure(id, true),
    replay: replay.replay,
    reportLength,
    progressPercent: () => {
      const data = replay.workbench()
      return mstockProgress(
        data,
        data.overviewStatus === "completed" &&
          !runtime.running() &&
          !!data.textReportPath &&
          !!data.visualReportPath &&
          !!source.get(data.textReportPath)?.text &&
          !!source.get(data.visualReportPath)?.text,
      )
    },
  }
  return <Context.Provider value={value}>{props.children}</Context.Provider>
}
