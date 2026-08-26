import { DataProvider } from "@opencode-ai/session-ui/context"
import { Markdown } from "@opencode-ai/session-ui/markdown"
import { SessionTurn } from "@opencode-ai/session-ui/session-turn"
import { Icon } from "@opencode-ai/ui/icon"
import { Icon as IconV2 } from "@opencode-ai/ui/v2/icon"
import { createMediaQuery } from "@solid-primitives/media"
import { For, Match, Show, Switch, createMemo, createResource, onCleanup, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import { useNavigate, useParams } from "@solidjs/router"
import type { Message, Part, Session, SessionStatus } from "@opencode-ai/sdk/v2"
import type { DockApiCaseArtifact, DockApiCaseDetail, DockApiCaseSnapshot } from "@/context/dockapi"
import { dockApiUrl, useDockApi } from "@/context/dockapi"
import { useServer } from "@/context/server"
import { useServerSDK } from "@/context/server-sdk"
import { useTabs } from "@/context/tabs"
import { DeepTradingResultsPanel } from "@/pages/session/deeptrading/deeptrading-results-panel"
import { DeepTradingSessionView } from "@/pages/session/deeptrading/deeptrading-session-view"
import { DeepTradingSnapshotWorkbenchProvider } from "@/pages/session/deeptrading/snapshot-workbench"
import { DeepTradingSplitLayout } from "@/pages/session/deeptrading/split-layout"
import type { DeepTradingArtifactSource, DeepTradingArtifactContent } from "@/pages/session/deeptrading/workbench-context"
import { cmccArtifactWorkspace, cmccEnsureWorkspace, cmccRememberConversationWorkspace } from "@/utils/cmcc-workspace"
import { Persist, persisted } from "@/utils/persist"
import { showToast } from "@/utils/toast"
import { CASE_REPLAY_DURATION_MS, caseReplayFrame, compileCaseReplay } from "./replay"
import {
  CASE_FILE_PANEL_DEFAULT_WIDTH,
  caseFilePanelMaxWidth,
  caseFilePanelWidthAfterDrag,
  clampCaseFilePanelWidth,
} from "./file-panel-layout"
import echartsRuntimeUrl from "../../../node_modules/echarts/dist/echarts.min.js?url"

type LoadedCase = {
  detail: DockApiCaseDetail
  snapshot: DockApiCaseSnapshot
  previewBaseUrl: string
}

export function CmccCaseDetailRoute() {
  const params = useParams<{ caseCode: string }>()
  const dockapi = useDockApi()
  const navigate = useNavigate()
  const [loaded] = createResource(
    () => params.caseCode,
    async (caseCode): Promise<LoadedCase> => {
      const [detail, snapshot, ticket] = await Promise.all([
        dockapi.cases.detail(caseCode),
        dockapi.cases.snapshot(caseCode),
        dockapi.cases.previewTicket(caseCode),
      ])
      if (snapshot.schemaVersion !== 1 || snapshot.caseCode !== detail.caseCode) {
        throw new Error("案例快照版本或编号不匹配")
      }
      return {
        detail,
        snapshot,
        previewBaseUrl: dockApiUrl(ticket.baseUrl).replace(/\/$/, ""),
      }
    },
  )

  return (
    <Switch>
      <Match when={loaded.loading}>
        <div class="flex size-full items-center justify-center bg-white text-[13px] text-[#8b94a7]">正在加载案例详情...</div>
      </Match>
      <Match when={loaded.error}>
        <div class="flex size-full flex-col items-center justify-center bg-white px-6 text-center">
          <strong class="text-[15px] text-[#3d4659]">案例详情加载失败</strong>
          <span class="mt-2 text-[13px] text-[#8b94a7]">{loaded.error instanceof Error ? loaded.error.message : String(loaded.error)}</span>
          <button type="button" class="mt-5 h-9 rounded-[6px] bg-[#edf3ff] px-4 text-[13px] text-[#3474e8]" onClick={() => navigate("/cases")}>返回案例库</button>
        </div>
      </Match>
      <Match when={loaded()} keyed>
        {(value) => <CaseDetailContent value={value} />}
      </Match>
    </Switch>
  )
}

function CaseDetailContent(props: { value: LoadedCase }) {
  const navigate = useNavigate()
  const source = createCaseArtifactSource(props.value.previewBaseUrl)
  const header = (
    <header class="flex h-12 shrink-0 items-center gap-3 border-b border-[#e3e7ef] bg-white px-4">
      <button type="button" class="flex size-8 items-center justify-center rounded-[6px] text-[#63708a] hover:bg-[#f0f3f8]" aria-label="返回案例库" onClick={() => navigate("/cases")}>
        <Icon name="arrow-left" class="size-4" />
      </button>
      <span class="min-w-0 flex-1">
        <strong class="block truncate text-[14px] font-medium text-[#30394d]">{props.value.detail.caseName}</strong>
        <small class="block truncate text-[11px] text-[#8a93a6]">{props.value.detail.categoryLabel} · {props.value.detail.caseTag}</small>
      </span>
      <span class="rounded-full bg-[#edf3ff] px-2.5 py-1 text-[11px] text-[#3d73d8]">案例快照</span>
    </header>
  )

  if (props.value.detail.agentType === "deeptrading") {
    return (
      <DeepTradingSnapshotWorkbenchProvider snapshot={() => props.value.snapshot} artifactSource={source}>
        <DeepTradingCaseLayout header={header} />
      </DeepTradingSnapshotWorkbenchProvider>
    )
  }
  return (
    <GenericCaseLayout
      value={props.value}
      source={source}
      header={header}
      historyStyle={props.value.detail.agentType === "deepinsight"}
    />
  )
}

function DeepTradingCaseLayout(props: { header: JSX.Element }) {
  const desktop = createMediaQuery("(min-width: 768px)")
  const [state, setState] = createStore({ mobileView: "content" as "content" | "results" })
  return (
    <div class="flex size-full min-h-0 flex-col overflow-hidden bg-[#f7f8fb]">
      {props.header}
      <div class="min-h-0 flex-1">
        <Show
          when={desktop()}
          fallback={
            <div class="flex size-full min-h-0 flex-col">
              <div class="grid h-10 shrink-0 grid-cols-2 border-b border-[#e0e4eb] bg-white p-1">
                <button type="button" data-selected={state.mobileView === "content" ? "" : undefined} class="rounded-[6px] text-[12px] text-[#7a8498] data-[selected]:bg-[#edf3ff] data-[selected]:text-[#3474e8]" onClick={() => setState("mobileView", "content")}>分析内容</button>
                <button type="button" data-selected={state.mobileView === "results" ? "" : undefined} class="rounded-[6px] text-[12px] text-[#7a8498] data-[selected]:bg-[#edf3ff] data-[selected]:text-[#3474e8]" onClick={() => setState("mobileView", "results")}>分析结果</button>
              </div>
              <div class="min-h-0 flex-1 overflow-hidden">{state.mobileView === "content" ? <DeepTradingSessionView /> : <DeepTradingResultsPanel />}</div>
            </div>
          }
        >
          <DeepTradingSplitLayout left={<DeepTradingSessionView />} right={<DeepTradingResultsPanel />} />
        </Show>
      </div>
    </div>
  )
}

function GenericCaseLayout(props: {
  value: LoadedCase
  source: DeepTradingArtifactSource
  header: JSX.Element
  historyStyle?: boolean
}) {
  const dockapi = useDockApi()
  const server = useServer()
  const serverSDK = useServerSDK()
  const tabs = useTabs()
  const navigate = useNavigate()
  const timeline = compileCaseReplay(props.value.snapshot)
  const [state, setState] = createStore({
    selectedSessionId: props.value.snapshot.rootSessionId,
    view: "process" as "process" | "files",
    filesOpen: false,
    playing: false,
    progress: 1,
  })
  let timer: number | undefined
  let startedAt = 0
  let runId = 0

  const stop = () => {
    runId += 1
    if (timer !== undefined) window.clearInterval(timer)
    timer = undefined
    setState({ playing: false, progress: 1 })
  }
  const start = () => {
    stop()
    const currentRun = ++runId
    startedAt = performance.now()
    setState({
      selectedSessionId: props.value.snapshot.rootSessionId,
      view: "process",
      filesOpen: false,
      playing: true,
      progress: 0,
    })
    timer = window.setInterval(() => {
      if (currentRun !== runId) return
      const progress = Math.min(1, (performance.now() - startedAt) / CASE_REPLAY_DURATION_MS)
      setState("progress", progress)
      if (progress >= 1) stop()
    }, 500)
  }
  onCleanup(stop)

  const frame = createMemo(() => caseReplayFrame(timeline, state.playing ? state.progress : 1))
  const data = createMemo(() => snapshotData(props.value.snapshot, frame()))
  const selectedMessages = createMemo(() => data().message[state.selectedSessionId] ?? [])
  const userMessages = createMemo(() => selectedMessages().filter((message) => message.role === "user"))
  const visibleSessions = createMemo(() => data().session)
  const selectedSession = createMemo(() =>
    visibleSessions().find((session) => session.id === state.selectedSessionId),
  )

  const createSame = () => {
    const query = props.value.detail.query.trim()
    const directory = dockapi.workspace?.directoryPath
    const artifactDirectory = cmccArtifactWorkspace(directory)
    if (!query || !directory || !artifactDirectory || !tabs.ready()) {
      showToast({ variant: "error", title: "无法创建同款会话", description: "查询内容或用户工作目录尚未准备完成。" })
      return
    }
    tabs.newDraft(
      { server: server.key, directory, artifactDirectory, expertID: props.value.detail.agentType },
      query,
      { agent: props.value.detail.rootAgent },
    )
    cmccRememberConversationWorkspace(directory)
    server.projects.touch(directory)
    void cmccEnsureWorkspace(
      artifactDirectory,
      (path) => serverSDK().client.file.createDirectory({ path }, { throwOnError: true }),
      serverSDK().scope,
    ).catch((error) => {
      showToast({ variant: "error", title: "无法准备会话产物目录", description: error instanceof Error ? error.message : String(error) })
    })
  }

  if (props.historyStyle) {
    return (
      <div class="relative flex size-full min-h-0 flex-col overflow-hidden bg-v2-background-bg-base">
        <header class="flex h-12 shrink-0 items-center gap-2 border-b border-v2-border-border-base bg-v2-background-bg-base px-3">
          <button
            type="button"
            aria-label="返回案例库"
            class="flex size-8 shrink-0 items-center justify-center rounded-[6px] text-v2-icon-icon-muted hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-icon-icon-base"
            onClick={() => navigate("/cases")}
          >
            <Icon name="arrow-left" class="size-4" />
          </button>
          <div class="flex min-w-0 flex-1 items-center gap-2">
            <Show
              when={state.selectedSessionId !== props.value.snapshot.rootSessionId}
              fallback={<h1 class="truncate text-[14px] font-medium text-v2-text-text-strong">{props.value.detail.caseName}</h1>}
            >
              <button
                type="button"
                class="max-w-[40%] truncate text-[14px] text-v2-text-text-muted hover:text-v2-text-text-base"
                onClick={() => setState("selectedSessionId", props.value.snapshot.rootSessionId)}
              >
                {props.value.detail.caseName}
              </button>
              <span class="text-[13px] text-v2-text-text-faint">/</span>
              <h1 class="truncate text-[14px] font-medium text-v2-text-text-strong">
                {selectedSession()?.title || selectedSession()?.agent || "子会话"}
              </h1>
            </Show>
          </div>
          <button
            type="button"
            title={props.value.snapshot.artifacts.length ? "文件" : "该案例没有产物文件"}
            aria-label="文件"
            aria-expanded={state.filesOpen}
            disabled={!props.value.snapshot.artifacts.length}
            class="flex size-8 shrink-0 items-center justify-center rounded-[6px] text-v2-icon-icon-muted hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-icon-icon-base disabled:cursor-default disabled:opacity-35"
            classList={{ "bg-v2-overlay-simple-overlay-hover text-v2-icon-icon-base": state.filesOpen }}
            onClick={() => setState("filesOpen", !state.filesOpen)}
          >
            <IconV2 name="sidebar-right" class="size-4" />
          </button>
        </header>

        <div class="flex min-h-0 flex-1 overflow-hidden pb-[72px]">
          <main class="min-w-0 flex-1 overflow-y-auto bg-v2-background-bg-base px-4 py-5 max-sm:px-2">
            <DataProvider
              data={data()}
              directory="case://workspace"
              onNavigateToSession={(id) => setState("selectedSessionId", id)}
            >
              <div role="log" data-slot="session-turn-list" class="mx-auto flex w-full max-w-[800px] flex-col px-4">
                <For each={userMessages()}>
                  {(message) => (
                    <SessionTurn
                      sessionID={state.selectedSessionId}
                      messageID={message.id}
                      messages={selectedMessages()}
                      active={false}
                      status={{ type: "idle" }}
                      showReasoningSummaries={false}
                      shellToolDefaultOpen={false}
                      editToolDefaultOpen={false}
                      classes={{
                        root: "min-w-0 w-full relative",
                        content: "flex flex-col justify-between !overflow-visible",
                        container: "w-full",
                      }}
                    />
                  )}
                </For>
                <Show when={!userMessages().length}>
                  <div class="py-20 text-center text-[13px] text-v2-text-text-faint">
                    该会话尚未进入回放时间轴
                  </div>
                </Show>
              </div>
            </DataProvider>
          </main>

          <CaseHistoryFilePanel
            open={state.filesOpen}
            artifacts={props.value.snapshot.artifacts}
            source={props.source}
            onClose={() => setState("filesOpen", false)}
          />
        </div>

        <CaseReplayControls
          playing={state.playing}
          progress={state.progress}
          onReplay={() => (state.playing ? stop() : start())}
          onCreateSame={createSame}
        />
      </div>
    )
  }

  return (
    <div class="relative flex size-full min-h-0 flex-col overflow-hidden bg-[#f7f8fb]">
      {props.header}
      <div class="flex h-11 shrink-0 items-center gap-2 border-b border-[#e1e5ed] bg-white px-4">
        <button type="button" data-selected={state.view === "process" ? "" : undefined} class="h-8 rounded-[6px] px-4 text-[12px] text-[#7a8498] data-[selected]:bg-[#edf3ff] data-[selected]:text-[#3474e8]" onClick={() => setState("view", "process")}>分析过程</button>
        <button type="button" data-selected={state.view === "files" ? "" : undefined} class="h-8 rounded-[6px] px-4 text-[12px] text-[#7a8498] data-[selected]:bg-[#edf3ff] data-[selected]:text-[#3474e8]" onClick={() => setState("view", "files")}>文件</button>
      </div>
      <div class="min-h-0 flex-1 pb-[72px]">
        <Show when={state.view === "process"} fallback={<GenericCaseFiles artifacts={props.value.snapshot.artifacts} source={props.source} />}>
          <div class="flex size-full min-h-0 max-md:flex-col">
            <aside class="w-[220px] shrink-0 overflow-y-auto border-r border-[#e1e5ed] bg-white p-3 max-md:h-[88px] max-md:w-full max-md:border-b max-md:border-r-0">
              <div class="flex flex-col gap-1.5 max-md:flex-row max-md:overflow-x-auto">
                <For each={visibleSessions()}>
                  {(session) => (
                    <button type="button" data-selected={state.selectedSessionId === session.id ? "" : undefined} class="min-h-11 shrink-0 rounded-[6px] px-3 py-2 text-left text-[12px] text-[#667188] hover:bg-[#f3f6fb] data-[selected]:bg-[#eaf1ff] data-[selected]:text-[#326edc] max-md:w-[150px]" onClick={() => setState("selectedSessionId", session.id)}>
                      <strong class="block truncate font-medium">{session.id === props.value.snapshot.rootSessionId ? "总览" : session.agent || session.title}</strong>
                      <small class="mt-0.5 block truncate text-[10px] opacity-70">{session.title}</small>
                    </button>
                  )}
                </For>
              </div>
            </aside>
            <div class="min-h-0 flex-1 overflow-y-auto bg-[#f7f8fb] px-5 py-5 max-sm:px-3">
              <DataProvider data={data()} directory="case://workspace" onNavigateToSession={(id) => setState("selectedSessionId", id)}>
                <div class="mx-auto w-full max-w-[900px] space-y-5">
                  <For each={userMessages()}>
                    {(message) => (
                      <SessionTurn
                        sessionID={state.selectedSessionId}
                        messageID={message.id}
                        messages={selectedMessages()}
                        active={false}
                        status={{ type: "idle" }}
                        classes={{ root: "!max-w-none", container: "!max-w-none" }}
                      />
                    )}
                  </For>
                  <Show when={!userMessages().length}>
                    <div class="py-20 text-center text-[13px] text-[#929bad]">该节点尚未进入回放时间轴</div>
                  </Show>
                </div>
              </DataProvider>
            </div>
          </div>
        </Show>
      </div>
      <CaseReplayControls
        playing={state.playing}
        progress={state.progress}
        onReplay={() => (state.playing ? stop() : start())}
        onCreateSame={createSame}
      />
    </div>
  )
}

function CaseReplayControls(props: {
  playing: boolean
  progress: number
  onReplay: () => void
  onCreateSame: () => void
}) {
  return (
    <div class="pointer-events-none absolute inset-x-0 bottom-3 z-30 flex justify-center px-3">
      <div class="pointer-events-auto flex max-w-full items-center gap-3 rounded-[18px] border border-[#dfe5ef] bg-white/95 px-2.5 py-2 shadow-[0_8px_24px_rgba(29,45,78,0.14)] backdrop-blur">
        <div class="flex items-center gap-2 whitespace-nowrap text-[13px] font-semibold text-[#2563eb]">
          <span class="flex size-[26px] items-center justify-center rounded-[8px] bg-[#eff6ff] text-[14px] font-bold shadow-[inset_0_0_0_1px_#bfdbfe]">
            深
          </span>
          <strong class="hidden sm:inline">深度洞察</strong>
        </div>
        <Show when={props.playing}>
          <div class="h-[5px] w-[72px] overflow-hidden rounded-full bg-[#eef2ff]">
            <span
              class="block h-full rounded-full bg-[#4d78eb] transition-[width] duration-300"
              style={{ width: `${Math.round(props.progress * 100)}%` }}
            />
          </div>
        </Show>
        <button
          type="button"
          class="h-9 rounded-[18px] bg-[#eff6ff] px-5 text-[14px] font-bold text-[#3b82f6]"
          onClick={props.onReplay}
        >
          {props.playing ? "停止回放" : "看回放"}
        </button>
        <Show when={!props.playing}>
          <button
            type="button"
            class="h-9 rounded-[18px] bg-[#eff6ff] px-5 text-[14px] font-bold text-[#3b82f6]"
            onClick={props.onCreateSame}
          >
            做同款
          </button>
        </Show>
      </div>
    </div>
  )
}

function snapshotData(snapshot: DockApiCaseSnapshot, frame: ReturnType<typeof caseReplayFrame>) {
  const sessions = snapshot.sessions.filter((entry) => frame.sessionIds.has(entry.session.id))
  const message: Record<string, Message[]> = {}
  const part: Record<string, Part[]> = {}
  const status: Record<string, SessionStatus> = {}
  for (const entry of sessions) {
    status[entry.session.id] = entry.status
    message[entry.session.id] = entry.messages
      .filter((item) => frame.messageIds.has(item.info.id))
      .map((item) => item.info)
    for (const item of entry.messages) {
      if (!frame.messageIds.has(item.info.id)) continue
      part[item.info.id] = item.parts.filter((value) => frame.partIds.has(value.id))
    }
  }
  return {
    session: sessions.map((entry) => entry.session),
    session_status: status,
    session_diff: {},
    message,
    part,
  }
}

function createCaseArtifactSource(baseUrl: string): DeepTradingArtifactSource {
  const [content, setContent] = createStore<Record<string, DeepTradingArtifactContent | undefined>>({})
  const url = (path: string) => {
    const value = new URL(`${baseUrl}/artifacts/${path.split("/").map(encodeURIComponent).join("/")}`)
    if (/\.html?$/i.test(path)) value.searchParams.set("runtime", new URL(echartsRuntimeUrl, window.location.origin).toString())
    return value.toString()
  }
  const load = async (path: string) => {
    if (content[path]?.loaded || content[path]?.loading) return
    setContent(path, { loaded: false, loading: true })
    await fetch(url(path))
      .then(async (response) => {
        if (!response.ok) throw new Error(`文件读取失败，HTTP ${response.status}`)
        setContent(path, { loaded: true, loading: false, text: await response.text() })
      })
      .catch((error) => {
        setContent(path, { loaded: false, loading: false, error: error instanceof Error ? error.message : String(error) })
      })
  }
  return {
    get: (path) => content[path],
    load,
    async download(path) {
      const response = await fetch(url(path))
      if (!response.ok) throw new Error(`文件下载失败，HTTP ${response.status}`)
      return response.blob()
    },
    previewUrl: url,
  }
}

function CaseHistoryFilePanel(props: {
  open: boolean
  artifacts: DockApiCaseArtifact[]
  source: DeepTradingArtifactSource
  onClose: () => void
}) {
  const desktop = createMediaQuery("(min-width: 768px)")
  const [layout, setLayout] = persisted(
    Persist.global("case-history-file-panel"),
    createStore({ width: CASE_FILE_PANEL_DEFAULT_WIDTH }),
  )
  const [state, setState] = createStore({
    selected: undefined as DockApiCaseArtifact | undefined,
    dragging: false,
    startX: 0,
    startWidth: CASE_FILE_PANEL_DEFAULT_WIDTH,
    maxWidth: CASE_FILE_PANEL_DEFAULT_WIDTH,
  })
  let panel: HTMLElement | undefined
  let previousUserSelect = ""
  let previousCursor = ""

  const availableWidth = () => panel?.parentElement?.getBoundingClientRect().width ?? window.innerWidth
  const maxWidth = () => caseFilePanelMaxWidth(availableWidth())
  const width = () => clampCaseFilePanelWidth(layout.width, maxWidth())
  const filename = () => state.selected?.path.split("/").at(-1) ?? "文件"

  const stopDrag = () => {
    if (!state.dragging) return
    setState("dragging", false)
    document.body.style.userSelect = previousUserSelect
    document.body.style.cursor = previousCursor
    window.removeEventListener("pointermove", moveDrag)
    window.removeEventListener("pointerup", stopDrag)
    window.removeEventListener("pointercancel", stopDrag)
  }

  const moveDrag = (event: PointerEvent) => {
    if (!state.dragging) return
    setLayout(
      "width",
      caseFilePanelWidthAfterDrag({
        startWidth: state.startWidth,
        startX: state.startX,
        currentX: event.clientX,
        maxWidth: state.maxWidth,
      }),
    )
  }

  const startDrag = (event: PointerEvent) => {
    if (event.button !== 0 || !desktop()) return
    event.preventDefault()
    previousUserSelect = document.body.style.userSelect
    previousCursor = document.body.style.cursor
    document.body.style.userSelect = "none"
    document.body.style.cursor = "col-resize"
    setState({
      dragging: true,
      startX: event.clientX,
      startWidth: width(),
      maxWidth: maxWidth(),
    })
    window.addEventListener("pointermove", moveDrag)
    window.addEventListener("pointerup", stopDrag)
    window.addEventListener("pointercancel", stopDrag)
  }

  const resizeByKeyboard = (event: KeyboardEvent) => {
    const step = event.shiftKey ? 40 : 16
    if (event.key === "ArrowLeft") {
      event.preventDefault()
      setLayout("width", clampCaseFilePanelWidth(width() + step, maxWidth()))
    }
    if (event.key === "ArrowRight") {
      event.preventDefault()
      setLayout("width", clampCaseFilePanelWidth(width() - step, maxWidth()))
    }
  }

  const download = () => {
    const artifact = state.selected
    if (!artifact) return
    void props.source
      .download(artifact.path)
      .then((blob) => downloadBlob(blob, filename()))
      .catch((error) => {
        showToast({
          variant: "error",
          title: "文件下载失败",
          description: error instanceof Error ? error.message : String(error),
        })
      })
  }

  onCleanup(stopDrag)

  return (
    <aside
      ref={panel}
      aria-label="案例文件"
      aria-hidden={!props.open}
      inert={!props.open}
      class="absolute inset-y-0 right-0 z-20 min-w-0 shrink-0 overflow-hidden bg-v2-background-bg-base md:relative"
      classList={{
        "pointer-events-none": !props.open,
        "transition-[width] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[width] motion-reduce:transition-none":
          !state.dragging,
      }}
      style={{ width: props.open ? (desktop() ? `${width()}px` : "100%") : "0px" }}
    >
      <Show when={props.open}>
        <div class="relative flex size-full min-w-0 flex-col border-l border-v2-border-border-base bg-v2-background-bg-base shadow-[-8px_0_24px_rgba(30,45,75,0.05)] md:shadow-none">
          <Show when={desktop()}>
            <div
              role="separator"
              aria-label="调整文件栏宽度"
              aria-orientation="vertical"
              aria-valuemin={300}
              aria-valuemax={Math.round(maxWidth())}
              aria-valuenow={Math.round(width())}
              tabIndex={0}
              class="absolute inset-y-0 -left-1 z-30 w-2 touch-none cursor-col-resize outline-none before:absolute before:inset-y-0 before:left-1/2 before:w-px before:-translate-x-1/2 before:bg-v2-border-border-base hover:before:bg-[#8099ce] focus-visible:before:bg-[#6687d6]"
              onPointerDown={startDrag}
              onKeyDown={resizeByKeyboard}
            />
          </Show>

          <header class="flex h-10 shrink-0 items-center gap-2 border-b border-v2-border-border-base bg-v2-background-bg-layer-01 px-2">
            <Show
              when={state.selected}
              fallback={
                <div class="flex min-w-0 flex-1 items-center gap-2 px-2 text-[12px] font-medium text-v2-text-text-strong">
                  <Icon name="file-tree" class="size-4 text-v2-icon-icon-muted" />
                  <span>文件</span>
                </div>
              }
            >
              <div class="flex min-w-0 flex-1 items-center gap-1 rounded-[6px] bg-v2-background-bg-base px-2 py-1 text-[12px] text-v2-text-text-base">
                <Icon name="file-tree" class="size-3.5 shrink-0 text-v2-icon-icon-muted" />
                <span class="min-w-0 flex-1 truncate">{filename()}</span>
                <button
                  type="button"
                  aria-label="返回文件列表"
                  class="flex size-5 shrink-0 items-center justify-center rounded-[4px] hover:bg-v2-overlay-simple-overlay-hover"
                  onClick={() => setState("selected", undefined)}
                >
                  <Icon name="close-small" class="size-3" />
                </button>
              </div>
              <button
                type="button"
                aria-label="下载文件"
                title="下载文件"
                class="flex size-7 shrink-0 items-center justify-center rounded-[6px] text-v2-icon-icon-muted hover:bg-v2-overlay-simple-overlay-hover"
                onClick={download}
              >
                <Icon name="download" class="size-3.5" />
              </button>
            </Show>
            <button
              type="button"
              aria-label="关闭文件栏"
              class="flex size-7 shrink-0 items-center justify-center rounded-[6px] text-v2-icon-icon-muted hover:bg-v2-overlay-simple-overlay-hover"
              onClick={props.onClose}
            >
              <Icon name="close" class="size-4" />
            </button>
          </header>

          <div class="min-h-0 flex-1 overflow-hidden bg-v2-background-bg-base">
            <Show
              when={state.selected}
              keyed
              fallback={
                <Show
                  when={props.artifacts.length}
                  fallback={<div class="px-6 py-24 text-center text-[13px] text-v2-text-text-faint">该案例没有产物文件</div>}
                >
                  <div class="size-full overflow-y-auto bg-v2-background-bg-layer-01 px-2 py-3">
                    <For each={props.artifacts}>
                      {(artifact) => (
                        <button
                          type="button"
                          class="flex h-10 w-full min-w-0 items-center gap-2 rounded-[6px] px-2 text-left hover:bg-v2-overlay-simple-overlay-hover"
                          onClick={() => setState("selected", artifact)}
                        >
                          <Icon name="file-tree" class="size-4 shrink-0 text-v2-icon-icon-muted" />
                          <span class="min-w-0 flex-1 truncate text-[12px] text-v2-text-text-base">{artifact.path}</span>
                          <small class="shrink-0 text-[10px] text-v2-text-text-faint">{formatBytes(artifact.size)}</small>
                        </button>
                      )}
                    </For>
                  </div>
                </Show>
              }
            >
              {(artifact) => <GenericArtifactPreview artifact={artifact} source={props.source} embedded />}
            </Show>
          </div>
        </div>
      </Show>
    </aside>
  )
}

function GenericCaseFiles(props: {
  artifacts: DockApiCaseArtifact[]
  source: DeepTradingArtifactSource
}) {
  const [state, setState] = createStore({ selected: undefined as DockApiCaseArtifact | undefined })
  return (
    <div class="size-full overflow-y-auto bg-[#f7f8fb] p-4">
      <Show when={props.artifacts.length} fallback={<div class="py-24 text-center text-[13px] text-[#929bad]">该案例没有产物文件</div>}>
        <Show when={state.selected} keyed fallback={
          <div class="mx-auto grid w-full max-w-[920px] grid-cols-2 gap-3 max-md:grid-cols-1">
            <For each={props.artifacts}>{(artifact) => (
              <button type="button" class="flex min-w-0 items-center gap-3 rounded-[8px] border border-[#e1e5ed] bg-white p-3 text-left" onClick={() => setState("selected", artifact)}>
                <span class="flex size-9 shrink-0 items-center justify-center rounded-[7px] bg-[#eef3fb] text-[#5871aa]"><Icon name="file-tree" class="size-4" /></span>
                <span class="min-w-0"><strong class="block truncate text-[12px] font-medium text-[#394154]">{artifact.path.split("/").at(-1)}</strong><small class="mt-0.5 block text-[10px] text-[#8d96a8]">{formatBytes(artifact.size)}</small></span>
              </button>
            )}</For>
          </div>
        }>
          {(artifact) => <GenericArtifactPreview artifact={artifact} source={props.source} back={() => setState("selected", undefined)} />}
        </Show>
      </Show>
    </div>
  )
}

function GenericArtifactPreview(props: {
  artifact: DockApiCaseArtifact
  source: DeepTradingArtifactSource
  back?: () => void
  embedded?: boolean
}) {
  const extension = props.artifact.path.split(".").at(-1)?.toLowerCase() ?? ""
  const text = ["md", "txt", "json", "csv", "xml", "yaml", "yml"].includes(extension)
  if (text) void props.source.load(props.artifact.path)
  const content = () => props.source.get(props.artifact.path)
  const download = () => void props.source.download(props.artifact.path).then((blob) => downloadBlob(blob, props.artifact.path.split("/").at(-1) ?? "case-file"))
  const preview = () => (
    <div
      class="min-h-[480px] flex-1 overflow-auto border border-[#e1e5ed] bg-white"
      classList={{ "size-full !min-h-0 border-0": props.embedded, "rounded-[8px]": !props.embedded }}
    >
      <Switch>
        <Match when={text && content()?.loaded && extension === "md"}><div class="p-5"><Markdown text={content()?.text ?? ""} cacheKey={`case:${props.artifact.path}`} class="select-text text-[13px] leading-7" /></div></Match>
        <Match when={text && content()?.loaded}><pre class="m-0 whitespace-pre-wrap break-words p-5 text-[12px] leading-6">{content()?.text}</pre></Match>
        <Match when={["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(extension)}><div class="flex min-h-[480px] items-center justify-center p-4"><img src={props.source.previewUrl(props.artifact.path)} alt="" class="max-h-full max-w-full object-contain" /></div></Match>
        <Match when={["html", "htm", "pdf"].includes(extension)}><iframe title={props.artifact.path} class="block size-full min-h-[600px] border-0" src={props.source.previewUrl(props.artifact.path)} sandbox={extension === "pdf" ? undefined : "allow-scripts"} /></Match>
        <Match when={text}><div class="py-24 text-center text-[13px] text-[#929bad]">正在读取文件...</div></Match>
        <Match when={true}><div class="py-24 text-center text-[13px] text-[#929bad]">该文件暂不支持在线预览，请下载后查看</div></Match>
      </Switch>
    </div>
  )

  if (props.embedded) return preview()

  return (
    <div class="mx-auto flex size-full max-w-[920px] flex-col">
      <header class="mb-3 flex items-center gap-2"><button type="button" class="h-8 rounded-[6px] border border-[#d5dce8] px-3 text-[12px] text-[#5c687f]" onClick={props.back}>返回</button><strong class="min-w-0 flex-1 truncate text-[12px] text-[#3b4457]">{props.artifact.path}</strong><button type="button" class="h-8 rounded-[6px] bg-[#edf3ff] px-3 text-[12px] text-[#3972dc]" onClick={download}>下载</button></header>
      {preview()}
    </div>
  )
}

function formatBytes(value: number) {
  if (value < 1024) return `${value}B`
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)}KB`
  return `${(value / 1024 / 1024).toFixed(1)}MB`
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
