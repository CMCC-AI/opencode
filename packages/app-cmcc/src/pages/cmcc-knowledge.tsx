import type {
  FileContent,
  FileNode,
  Message,
  OpencodeClient,
  Part,
  Session,
  TextPart,
} from "@opencode-ai/sdk/v2/client"
import { Markdown } from "@opencode-ai/session-ui/markdown"
import { Icon } from "@opencode-ai/ui/icon"
import { Navigate, useNavigate, useParams, useSearchParams } from "@solidjs/router"
import { batch, createEffect, createMemo, createSignal, For, onCleanup, Show, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import { ArtifactPreview } from "@/components/artifact-preview"
import { ProductIntroButton } from "@/components/dialog-product-intro"
import { ForceKnowledgeGraph } from "@/components/force-knowledge-graph"
import { PromptInput } from "@/components/prompt-input"
import { buildRequestParts } from "@/components/prompt-input/build-request-parts"
import { notifySessionTabsRemoved } from "@/components/titlebar-session-events"
import { useLayout } from "@/context/layout"
import { useLocal } from "@/context/local"
import { usePlatform } from "@/context/platform"
import { DEFAULT_PROMPT, type ImageAttachmentPart, type Prompt, usePrompt } from "@/context/prompt"
import { useSDK } from "@/context/sdk"
import { useServerSDK } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"
import { useSync } from "@/context/sync"
import { createPromptInputController } from "@/pages/session/composer"
import { Identifier } from "@/utils/id"
import { Persist, persisted } from "@/utils/persist"
import { showToast } from "@/utils/toast"
import { uuid } from "@/utils/uuid"
import {
  cmccBuildKnowledgeGraph,
  cmccForgetKnowledgeSession,
  CMCC_KNOWLEDGE_DELETED_MARKER,
  cmccKnowledgeDirectory,
  cmccKnowledgeNotebooks,
  cmccKnowledgeRoot,
  cmccRecoverKnowledgeNotebooks,
  cmccRememberKnowledgeSession,
  cmccSaveKnowledgeNotebooks,
  cmccUpsertKnowledgeNotebook,
  normalizeWikiName,
  type KnowledgeGraph,
  type KnowledgeGraphNode,
  type KnowledgeNotebook,
} from "@/utils/cmcc-knowledge"

type ChatMessage = { info: Message; parts: Part[] }
type PreviewTab = { path: string; name: string }
type GraphMode = "all" | "upstream" | "downstream"
type ImportPhase = "idle" | "collecting" | "staging" | "organizing" | "validating" | "completed" | "failed"

const notebookEmojis = ["📚", "🧭", "🧠", "🗂️", "🔬", "📊", "🏛️", "🌐"]
const markdownExtensions = /\.(md|markdown|mdx)$/i
const attachmentBatchSize = 6
const wikiBatchSize = 12
const maxImportFiles = 1000

const SIDEBAR_DEFAULT_WIDTH = 260
const SIDEBAR_MIN_WIDTH = 200
const SIDEBAR_MAX_WIDTH = 400
const SIDEBAR_COLLAPSE_THRESHOLD = 100
const SIDEBAR_RESTORE_THRESHOLD = 140
const GRAPH_DEFAULT_WIDTH = 340
const GRAPH_MIN_WIDTH = 260
const GRAPH_MAX_RATIO = 0.45
const GRAPH_COLLAPSE_THRESHOLD = 140
const GRAPH_RESTORE_THRESHOLD = 180
const CONTENT_MIN_WIDTH = 360

// vertical split: sidebar session list / file tree
const SESSION_LIST_DEFAULT_HEIGHT = 144
const SESSION_LIST_MIN_HEIGHT = 60
const SESSION_LIST_MAX_HEIGHT = 400

// vertical split: graph canvas / detail panel
const GRAPH_DETAIL_DEFAULT_HEIGHT = 180
const GRAPH_DETAIL_MIN_HEIGHT = 80
const GRAPH_DETAIL_MAX_HEIGHT = 400

export function CmccKnowledgeHomeRoute() {
  const navigate = useNavigate()
  const serverSDK = useServerSDK()
  const sync = useServerSync()
  const [notebooks, setNotebooks] = createSignal(cmccKnowledgeNotebooks())
  const [discovering, setDiscovering] = createSignal(true)
  const [dialog, setDialog] = createStore({ open: false, name: "", description: "", creating: false })
  const [removal, setRemoval] = createStore({ notebook: undefined as KnowledgeNotebook | undefined, removing: false })
  const [rename, setRename] = createStore({ notebook: undefined as KnowledgeNotebook | undefined, name: "" })
  const recent = createMemo(() => notebooks().slice(0, 12))
  let discoveredHome = ""

  createEffect(() => {
    const home = sync().data.path.home
    if (!home || home === discoveredHome) return
    discoveredHome = home
    const root = cmccKnowledgeRoot(home)
    void serverSDK()
      .client.file.createDirectory({ path: root }, { throwOnError: true })
      .then(async () => {
        const rootClient = serverSDK().createClient({ directory: root, throwOnError: true })
        const entries = await rootClient.file.list({ path: "" }).then((result) => result.data ?? [])
        const directories = await Promise.all(
          entries
            .filter((entry) => entry.type === "directory" && !entry.name.startsWith("."))
            .map(async (entry) => {
              const directory = entry.absolute
              const client = serverSDK().createClient({ directory, throwOnError: true })
              const children = await client.file.list({ path: "" }).then((result) => result.data ?? [])
              if (children.some((child) => child.name === CMCC_KNOWLEDGE_DELETED_MARKER)) {
                await rootClient.file.remove({ path: entry.name, recursive: true }, { throwOnError: true })
                return
              }
              return directory
            }),
        )
        const recovered = cmccRecoverKnowledgeNotebooks(
          notebooks(),
          directories.filter((directory): directory is string => directory !== undefined),
        )
        cmccSaveKnowledgeNotebooks(recovered)
        setNotebooks(recovered)
      })
      .catch((error) =>
        showToast({
          title: "读取知识库目录失败",
          description: error instanceof Error ? error.message : String(error),
          variant: "error",
        }),
      )
      .finally(() => setDiscovering(false))
  })

  const createNotebook = async () => {
    const home = sync().data.path.home
    const name = dialog.name.trim()
    if (!home) return showToast({ title: "正在连接工作区，请稍后重试" })
    if (!name) return showToast({ title: "请输入笔记本名称" })

    const id = uuid()
    const now = Date.now()
    const notebook: KnowledgeNotebook = {
      id,
      name,
      description: dialog.description.trim(),
      emoji: notebookEmojis[notebooks().length % notebookEmojis.length],
      directory: cmccKnowledgeDirectory(home, name, id),
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now,
      sourceCount: 0,
    }

    setDialog("creating", true)
    await serverSDK()
      .client.file.createDirectory({ path: notebook.directory }, { throwOnError: true })
      .then(() => {
        const next = cmccUpsertKnowledgeNotebook(notebooks(), notebook)
        cmccSaveKnowledgeNotebooks(next)
        setNotebooks(next)
        navigate(`/knowledge/${notebook.id}`)
      })
      .catch((error) => {
        setDialog("creating", false)
        showToast({
          title: "创建笔记本失败",
          description: error instanceof Error ? error.message : String(error),
          variant: "error",
        })
      })
  }

  const openNotebook = (notebook: KnowledgeNotebook) => {
    const next = cmccUpsertKnowledgeNotebook(notebooks(), { ...notebook, lastOpenedAt: Date.now() })
    cmccSaveKnowledgeNotebooks(next)
    setNotebooks(next)
    navigate(`/knowledge/${notebook.id}`)
  }

  const removeNotebook = async () => {
    const notebook = removal.notebook
    if (!notebook) return
    const home = sync().data.path.home
    if (!home) return showToast({ title: "正在连接工作区，请稍后重试" })
    const root = cmccKnowledgeRoot(home)
    const target = relativeKnowledgePath(root, notebook.directory)
    if (!target)
      return showToast({
        title: "删除笔记本失败",
        description: "笔记本目录不在 DeepInsight 知识库根目录内。",
        variant: "error",
      })
    setRemoval("removing", true)
    const client = serverSDK().createClient({ directory: notebook.directory, throwOnError: true })
    await client.session
      .list({ directory: notebook.directory, roots: true, limit: 10_000 }, { throwOnError: true })
      .then(async (result) => {
        const sessionIDs = (result.data ?? []).map((session) => session.id)
        await Promise.all(
          sessionIDs.map((sessionID) =>
            client.session.delete({ sessionID, directory: notebook.directory }, { throwOnError: true }),
          ),
        )
        await serverSDK()
          .createClient({ directory: root, throwOnError: true })
          .file.remove({ path: target, recursive: true }, { throwOnError: true })
        return sessionIDs
      })
      .then((sessionIDs) => {
        const next = notebooks().filter((item) => item.id !== notebook.id)
        cmccSaveKnowledgeNotebooks(next)
        setNotebooks(next)
        sessionIDs.forEach(sync().session.evict)
        notifySessionTabsRemoved({ directory: notebook.directory, sessionIDs })
        setRemoval({ notebook: undefined, removing: false })
        showToast({
          title: `已删除“${notebook.name}”`,
          description: "知识库目录、全部文件及关联对话已永久删除。",
          variant: "success",
        })
      })
      .catch((error) => {
        setRemoval("removing", false)
        showToast({
          title: "删除笔记本失败",
          description: error instanceof Error ? error.message : String(error),
          variant: "error",
        })
      })
  }

  const renameNotebook = () => {
    const notebook = rename.notebook
    const name = rename.name.trim()
    if (!notebook) return
    if (!name) return showToast({ title: "请输入笔记本标题" })
    const next = cmccUpsertKnowledgeNotebook(notebooks(), { ...notebook, name, updatedAt: Date.now() })
    cmccSaveKnowledgeNotebooks(next)
    setNotebooks(next)
    setRename({ notebook: undefined, name: "" })
    showToast({ title: "笔记本标题已修改" })
  }

  const togglePinned = (notebook: KnowledgeNotebook) => {
    const pinned = !notebook.pinned
    const next = cmccUpsertKnowledgeNotebook(notebooks(), { ...notebook, pinned, updatedAt: Date.now() })
    cmccSaveKnowledgeNotebooks(next)
    setNotebooks(next)
    showToast({ title: pinned ? `已置顶“${notebook.name}”` : `已取消置顶“${notebook.name}”` })
  }

  return (
    <div class="relative min-h-0 flex-1 overflow-y-auto bg-v2-background-bg-deep">
      <ProductIntroButton class="absolute right-5 top-3 z-30 flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium text-v2-text-text-base transition-colors hover:bg-v2-background-bg-layer-02" />
      <div class="mx-auto flex w-full max-w-[1320px] flex-col gap-8 px-6 py-7">
        <header class="relative flex min-w-0 flex-wrap items-end justify-between gap-5">
          <div class="min-w-0">
            <div class="mb-2 flex items-center gap-2 text-[13px] leading-4 text-v2-text-text-muted">
              <Icon name="brain" class="size-4" />
              <span>DeepInsight Knowledge</span>
            </div>
            <h1 class="m-0 text-[28px] font-semibold leading-9 text-v2-text-text-base">知识库</h1>
            <p class="m-0 mt-2 max-w-[720px] text-[14px] leading-6 text-v2-text-text-muted">
              把文件、研究材料与 DeepInsight 对话组织进笔记本，在同一个工作台中阅读、追问和探索知识关系。
            </p>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <button
              type="button"
              class="flex h-9 shrink-0 items-center gap-2 rounded-[7px] bg-v2-text-text-base px-4 text-[13px] font-medium leading-4 text-v2-background-bg-layer-01 hover:opacity-90"
              onClick={() => setDialog("open", true)}
              disabled={discovering()}
            >
              <Icon name="plus" class="size-4" />
              新建笔记本
            </button>
          </div>
        </header>

        <section class="rounded-[14px] border border-v2-border-border-base bg-v2-background-bg-layer-01 p-5">
          <div class="grid gap-5 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
            <div>
              <div class="mb-3 flex size-10 items-center justify-center rounded-[10px] bg-v2-background-bg-layer-03 text-xl">
                ✦
              </div>
              <h2 class="m-0 text-[19px] font-semibold leading-7 text-v2-text-text-base">
                从原始材料到可对话的知识网络
              </h2>
              <p class="m-0 mt-2 max-w-[680px] text-[13px] leading-6 text-v2-text-text-muted">
                导入文件后会调用 llm-wiki skill 进行归档、解析和双链组织。原始文件保持可追溯，整理后的 Markdown
                自动进入关系图谱，并成为当前笔记本对话的上下文。
              </p>
            </div>
            <div class="grid grid-cols-3 gap-2">
              <FeatureStep icon="cloud-upload" label="导入来源" />
              <FeatureStep icon="brain" label="llm-wiki 解析" />
              <FeatureStep icon="branch" label="生成图谱" />
            </div>
          </div>
        </section>

        <section class="flex min-w-0 flex-col gap-4">
          <div class="flex items-center justify-between gap-3">
            <div>
              <h2 class="m-0 text-[18px] font-semibold leading-6 text-v2-text-text-base">最近打开的笔记本</h2>
              <p class="m-0 mt-1 text-[12px] leading-4 text-v2-text-text-faint">{notebooks().length} 个笔记本</p>
            </div>
          </div>
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <button
              type="button"
              class="group flex min-h-[178px] flex-col items-center justify-center rounded-[12px] border border-dashed border-v2-border-border-strong bg-v2-background-bg-layer-01 text-v2-text-text-muted hover:bg-v2-background-bg-layer-02 hover:text-v2-text-text-base disabled:cursor-wait disabled:opacity-60"
              onClick={() => setDialog("open", true)}
              disabled={discovering()}
            >
              <span class="mb-3 flex size-11 items-center justify-center rounded-full bg-v2-background-bg-layer-03">
                <Icon name="plus" class="size-5" />
              </span>
              <span class="text-[14px] font-medium">新建笔记本</span>
            </button>
            <For each={recent()}>
              {(notebook, index) => (
                <NotebookCard
                  notebook={notebook}
                  index={index()}
                  open={() => openNotebook(notebook)}
                  remove={() => setRemoval("notebook", notebook)}
                  rename={() => setRename({ notebook, name: notebook.name })}
                  togglePinned={() => togglePinned(notebook)}
                />
              )}
            </For>
          </div>
        </section>

        <Show when={discovering()}>
          <div class="flex items-center gap-2 text-[12px] text-v2-text-text-muted">
            <span class="size-3 animate-spin rounded-full border border-current border-r-transparent" />
            正在扫描磁盘中的知识库目录...
          </div>
        </Show>

        <Show when={!discovering() && notebooks().length === 0}>
          <div class="rounded-[12px] border border-v2-border-border-base bg-v2-background-bg-layer-01 px-5 py-4 text-[13px] leading-6 text-v2-text-text-muted">
            还没有笔记本。创建后会先生成一个空白目录，你可以上传文件、拖入材料或导入整个目录。
          </div>
        </Show>
      </div>

      <Show when={dialog.open}>
        <Modal title="新建笔记本" close={() => !dialog.creating && setDialog("open", false)}>
          <div class="flex flex-col gap-4">
            <label class="flex flex-col gap-1.5">
              <span class="text-[12px] leading-4 text-v2-text-text-muted">名称</span>
              <input
                autofocus
                class="h-10 rounded-[7px] border border-v2-border-border-base bg-v2-background-bg-layer-02 px-3 text-[14px] text-v2-text-text-base outline-none placeholder:text-v2-text-text-faint focus:border-v2-border-border-active"
                placeholder="例如：跨境数据合规研究"
                value={dialog.name}
                onInput={(event) => setDialog("name", event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void createNotebook()
                }}
              />
            </label>
            <label class="flex flex-col gap-1.5">
              <span class="text-[12px] leading-4 text-v2-text-text-muted">说明（可选）</span>
              <textarea
                class="min-h-[88px] resize-none rounded-[7px] border border-v2-border-border-base bg-v2-background-bg-layer-02 px-3 py-2 text-[13px] leading-5 text-v2-text-text-base outline-none placeholder:text-v2-text-text-faint focus:border-v2-border-border-active"
                placeholder="这个笔记本要解决什么问题？"
                value={dialog.description}
                onInput={(event) => setDialog("description", event.currentTarget.value)}
              />
            </label>
            <div class="rounded-[7px] border border-v2-border-border-base bg-v2-background-bg-layer-02 px-3 py-2 text-[12px] leading-5 text-v2-text-text-muted">
              将在当前 DeepInsight 主目录下创建独立的知识库目录，原始材料与 llmwiki 产物都保存在其中。
            </div>
            <button
              type="button"
              class="flex h-10 items-center justify-center gap-2 rounded-[7px] bg-v2-text-text-base px-4 text-[13px] font-medium text-v2-background-bg-layer-01 disabled:opacity-50"
              disabled={dialog.creating || !dialog.name.trim()}
              onClick={() => void createNotebook()}
            >
              <Show when={dialog.creating} fallback={<Icon name="plus" class="size-4" />}>
                <span class="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" />
              </Show>
              {dialog.creating ? "正在创建..." : "创建笔记本"}
            </button>
          </div>
        </Modal>
      </Show>

      <Show when={removal.notebook} keyed>
        {(notebook) => (
          <Modal title="删除笔记本" close={() => !removal.removing && setRemoval("notebook", undefined)}>
            <div class="flex flex-col gap-4">
              <p class="m-0 text-[14px] leading-6 text-v2-text-text-base">
                确定从 DeepInsight 中删除“{notebook.name}”吗？
              </p>
              <div class="rounded-[7px] border border-red-500/35 bg-red-500/8 px-3 py-2 text-[12px] leading-5 text-v2-text-text-muted">
                此操作会永久删除知识库目录、关联对话、原始资料、LLM Wiki 产物和其他全部文件，删除后无法恢复。
              </div>
              <div class="flex justify-end gap-2">
                <button
                  type="button"
                  class="h-9 rounded-[7px] border border-v2-border-border-base px-4 text-[13px] text-v2-text-text-base hover:bg-v2-background-bg-layer-02"
                  disabled={removal.removing}
                  onClick={() => setRemoval("notebook", undefined)}
                >
                  取消
                </button>
                <button
                  type="button"
                  class="flex h-9 items-center gap-2 rounded-[7px] bg-v2-text-text-base px-4 text-[13px] font-medium text-v2-background-bg-layer-01 disabled:opacity-50"
                  disabled={removal.removing}
                  onClick={() => void removeNotebook()}
                >
                  <Show when={removal.removing} fallback={<Icon name="trash" class="size-4" />}>
                    <span class="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" />
                  </Show>
                  {removal.removing ? "正在删除..." : "确认删除"}
                </button>
              </div>
            </div>
          </Modal>
        )}
      </Show>

      <Show when={rename.notebook} keyed>
        {(notebook) => (
          <Modal title="修改标题" close={() => setRename({ notebook: undefined, name: "" })}>
            <div class="flex flex-col gap-4">
              <label class="flex flex-col gap-1.5">
                <span class="text-[12px] leading-4 text-v2-text-text-muted">笔记本标题</span>
                <input
                  autofocus
                  class="h-10 rounded-[7px] border border-v2-border-border-base bg-v2-background-bg-layer-02 px-3 text-[14px] text-v2-text-text-base outline-none focus:border-v2-border-border-active"
                  value={rename.name}
                  onInput={(event) => setRename("name", event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") renameNotebook()
                  }}
                />
              </label>
              <p class="m-0 text-[12px] leading-5 text-v2-text-text-muted">
                只修改界面显示标题，不会重命名本地目录，避免影响已有文件和对话路径。
              </p>
              <div class="flex justify-end gap-2">
                <button
                  type="button"
                  class="h-9 rounded-[7px] border border-v2-border-border-base px-4 text-[13px] text-v2-text-text-base hover:bg-v2-background-bg-layer-02"
                  onClick={() => setRename({ notebook: undefined, name: "" })}
                >
                  取消
                </button>
                <button
                  type="button"
                  class="h-9 rounded-[7px] bg-v2-text-text-base px-4 text-[13px] font-medium text-v2-background-bg-layer-01 disabled:opacity-50"
                  disabled={!rename.name.trim() || rename.name.trim() === notebook.name}
                  onClick={renameNotebook}
                >
                  确认修改
                </button>
              </div>
            </div>
          </Modal>
        )}
      </Show>
    </div>
  )
}

export function CmccKnowledgeNotebookRoute() {
  const params = useParams<{ id: string; sessionID?: string }>()
  const [searchParams, setSearchParams] = useSearchParams<{ prompt?: string }>()
  const navigate = useNavigate()
  const layout = useLayout()
  const platform = usePlatform()
  const sdk = useSDK()
  const sync = useSync()
  const serverSync = useServerSync()
  const local = useLocal()
  const composerPrompt = usePrompt()
  const [notebooks, setNotebooks] = createSignal(cmccKnowledgeNotebooks())
  const [notebook, setNotebook] = createSignal(notebooks().find((item) => item.id === params.id))
  const [state, setState] = createStore({
    files: [] as FileNode[],
    contents: {} as Record<string, FileContent>,
    tabs: [] as PreviewTab[],
    activeTab: "chat",
    expanded: [""] as string[],
    loading: true,
    loadingPath: "",
    importing: false,
    importPhase: "idle" as ImportPhase,
    importTotal: 0,
    importCompleted: 0,
    importMessage: "",
    dropActive: false,
    sessions: [] as Session[],
    messages: [] as ChatMessage[],
    sending: false,
    optimisticPrompt: "",
    graph: { nodes: [], edges: [] } as KnowledgeGraph,
    graphMode: "all" as GraphMode,
    graphQuery: "",
    graphSelection: "",
  })
  const [fileRemoval, setFileRemoval] = createStore({
    file: undefined as FileNode | undefined,
    removing: false,
  })
  const [sessionRemoval, setSessionRemoval] = createStore({
    session: undefined as Session | undefined,
    removing: false,
  })
  let inputElement: HTMLInputElement | undefined
  let loadedSession = ""
  const client = createMemo(() => sdk().client)
  const activeSessionID = createMemo(() =>
    params.sessionID === "new" ? undefined : (params.sessionID ?? notebook()?.sessionID),
  )
  const composerControls = createPromptInputController({
    sessionKey: () => `knowledge:${params.id}`,
    sessionID: activeSessionID,
    queryOptions: serverSync().queryOptions,
  })
  createEffect(() => {
    if (!composerPrompt.ready()) return
    const text = searchParams.prompt
    if (!text) return
    composerPrompt.set([{ type: "text", content: text, start: 0, end: text.length }], text.length)
    setSearchParams({ prompt: undefined }, { replace: true })
  })
  const sourceFiles = createMemo(() => (state.files ?? []).filter((item) => item.type === "file"))
  const graph = createMemo<KnowledgeGraph>(() => ({
    nodes: state.graph?.nodes ?? [],
    edges: state.graph?.edges ?? [],
  }))
  const rootChildren = createMemo(() => fileChildren(state.files ?? [], ""))
  const activePreview = createMemo(() => state.tabs.find((tab) => tab.path === state.activeTab))

  // --- panel resize state (persisted to localStorage) ---
  const [panelStore, setPanelStore] = createStore({
    sidebarOpened: true,
    sidebarWidth: SIDEBAR_DEFAULT_WIDTH,
    graphOpened: true,
    graphWidth: GRAPH_DEFAULT_WIDTH,
    sessionListHeight: SESSION_LIST_DEFAULT_HEIGHT,
    graphDetailHeight: GRAPH_DETAIL_DEFAULT_HEIGHT,
    historyOpened: true,
    directoryOpened: true,
  })
  persisted(Persist.global("knowledge-panels"), [panelStore, setPanelStore])

  const graphMaxWidth = () =>
    typeof window === "undefined" ? 600 : Math.floor(window.innerWidth * GRAPH_MAX_RATIO)

  // left separator drag (sidebar ↔ content)
  const [leftDrag, setLeftDrag] = createStore({ active: false, startX: 0, startWidth: 0 })

  const stopLeftDrag = () => {
    if (!leftDrag.active) return
    setLeftDrag("active", false)
    document.body.style.userSelect = ""
    document.body.style.cursor = ""
    window.removeEventListener("pointermove", moveLeftDrag)
    window.removeEventListener("pointerup", stopLeftDrag)
    window.removeEventListener("pointercancel", stopLeftDrag)
  }

  const moveLeftDrag = (event: PointerEvent) => {
    const raw = leftDrag.startWidth + event.clientX - leftDrag.startX
    if (raw <= SIDEBAR_COLLAPSE_THRESHOLD) {
      batch(() => {
        setPanelStore("sidebarOpened", false)
        setPanelStore("sidebarWidth", SIDEBAR_DEFAULT_WIDTH)
      })
      return
    }
    if (!panelStore.sidebarOpened && raw < SIDEBAR_RESTORE_THRESHOLD) return
    if (!panelStore.sidebarOpened) setPanelStore("sidebarOpened", true)
    setPanelStore("sidebarWidth", Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, raw)))
  }

  const startLeftDrag = (event: PointerEvent) => {
    event.preventDefault()
    document.body.style.userSelect = "none"
    document.body.style.cursor = "col-resize"
    setLeftDrag({
      active: true,
      startX: event.clientX,
      startWidth: panelStore.sidebarOpened ? panelStore.sidebarWidth : 0,
    })
    window.addEventListener("pointermove", moveLeftDrag)
    window.addEventListener("pointerup", stopLeftDrag)
    window.addEventListener("pointercancel", stopLeftDrag)
  }

  // right separator drag (content ↔ graph)
  const [rightDrag, setRightDrag] = createStore({ active: false, startX: 0, startWidth: 0 })

  const stopRightDrag = () => {
    if (!rightDrag.active) return
    setRightDrag("active", false)
    document.body.style.userSelect = ""
    document.body.style.cursor = ""
    window.removeEventListener("pointermove", moveRightDrag)
    window.removeEventListener("pointerup", stopRightDrag)
    window.removeEventListener("pointercancel", stopRightDrag)
  }

  const moveRightDrag = (event: PointerEvent) => {
    // right panel grows when pointer moves rightward from the separator's perspective,
    // but in screen coordinates rightward means the panel shrinks, so invert delta
    const raw = rightDrag.startWidth - (event.clientX - rightDrag.startX)
    if (raw <= GRAPH_COLLAPSE_THRESHOLD) {
      batch(() => {
        setPanelStore("graphOpened", false)
        setPanelStore("graphWidth", GRAPH_DEFAULT_WIDTH)
      })
      return
    }
    if (!panelStore.graphOpened && raw < GRAPH_RESTORE_THRESHOLD) return
    if (!panelStore.graphOpened) setPanelStore("graphOpened", true)
    setPanelStore("graphWidth", Math.min(graphMaxWidth(), Math.max(GRAPH_MIN_WIDTH, raw)))
  }

  const startRightDrag = (event: PointerEvent) => {
    event.preventDefault()
    document.body.style.userSelect = "none"
    document.body.style.cursor = "col-resize"
    setRightDrag({
      active: true,
      startX: event.clientX,
      startWidth: panelStore.graphOpened ? panelStore.graphWidth : 0,
    })
    window.addEventListener("pointermove", moveRightDrag)
    window.addEventListener("pointerup", stopRightDrag)
    window.addEventListener("pointercancel", stopRightDrag)
  }

  onCleanup(() => {
    stopLeftDrag()
    stopRightDrag()
    stopSessionDrag()
    stopDetailDrag()
  })

  // vertical separator drag: sidebar session list ↔ file tree
  const [sessionDrag, setSessionDrag] = createStore({ active: false, startY: 0, startHeight: 0 })

  const stopSessionDrag = () => {
    if (!sessionDrag.active) return
    setSessionDrag("active", false)
    document.body.style.userSelect = ""
    document.body.style.cursor = ""
    window.removeEventListener("pointermove", moveSessionDrag)
    window.removeEventListener("pointerup", stopSessionDrag)
    window.removeEventListener("pointercancel", stopSessionDrag)
  }

  const moveSessionDrag = (event: PointerEvent) => {
    const raw = sessionDrag.startHeight + event.clientY - sessionDrag.startY
    setPanelStore("sessionListHeight", Math.min(SESSION_LIST_MAX_HEIGHT, Math.max(SESSION_LIST_MIN_HEIGHT, raw)))
  }

  const startSessionDrag = (event: PointerEvent) => {
    event.preventDefault()
    document.body.style.userSelect = "none"
    document.body.style.cursor = "row-resize"
    setSessionDrag({ active: true, startY: event.clientY, startHeight: panelStore.sessionListHeight })
    window.addEventListener("pointermove", moveSessionDrag)
    window.addEventListener("pointerup", stopSessionDrag)
    window.addEventListener("pointercancel", stopSessionDrag)
  }

  // vertical separator drag: graph canvas ↔ detail panel
  const [detailDrag, setDetailDrag] = createStore({ active: false, startY: 0, startHeight: 0 })

  const stopDetailDrag = () => {
    if (!detailDrag.active) return
    setDetailDrag("active", false)
    document.body.style.userSelect = ""
    document.body.style.cursor = ""
    window.removeEventListener("pointermove", moveDetailDrag)
    window.removeEventListener("pointerup", stopDetailDrag)
    window.removeEventListener("pointercancel", stopDetailDrag)
  }

  const moveDetailDrag = (event: PointerEvent) => {
    // detail is at the bottom, so dragging up = detail grows
    const raw = detailDrag.startHeight - (event.clientY - detailDrag.startY)
    setPanelStore("graphDetailHeight", Math.min(GRAPH_DETAIL_MAX_HEIGHT, Math.max(GRAPH_DETAIL_MIN_HEIGHT, raw)))
  }

  const startDetailDrag = (event: PointerEvent) => {
    event.preventDefault()
    document.body.style.userSelect = "none"
    document.body.style.cursor = "row-resize"
    setDetailDrag({ active: true, startY: event.clientY, startHeight: panelStore.graphDetailHeight })
    window.addEventListener("pointermove", moveDetailDrag)
    window.addEventListener("pointerup", stopDetailDrag)
    window.addEventListener("pointercancel", stopDetailDrag)
  }

  const saveNotebook = (next: KnowledgeNotebook) => {
    const updated = cmccUpsertKnowledgeNotebook(notebooks(), next)
    cmccSaveKnowledgeNotebooks(updated)
    setNotebooks(updated)
    setNotebook(next)
  }

  const loadMessages = async (sessionID: string) => {
    const current = client()
    if (!current) return
    await current.session
      .messages({ sessionID, limit: 100 })
      .then((result) => {
        if (activeSessionID() !== sessionID) return
        setState("messages", result.data ?? [])
      })
      .catch((error) =>
        showToast({
          title: "读取知识库对话失败",
          description: error instanceof Error ? error.message : String(error),
          variant: "error",
        }),
      )
  }

  const loadSessions = async () => {
    const current = client()
    const activeNotebook = notebook()
    if (!current || !activeNotebook) return
    await current.session
      .list({ directory: activeNotebook.directory, roots: true, limit: 100 })
      .then((result) => {
        const sessions = (result.data ?? [])
          .filter((session) => !session.parentID && session.time.archived === undefined)
          .toSorted((a, b) => sessionUpdatedAt(b) - sessionUpdatedAt(a))
        setState("sessions", sessions)
        if (params.sessionID === "new" || sessions.some((session) => session.id === activeSessionID())) return
        const latest = sessions[0]
        if (!latest) return
        saveNotebook({ ...cmccRememberKnowledgeSession(activeNotebook, latest.id), lastOpenedAt: Date.now() })
        navigate(`/knowledge/${activeNotebook.id}/session/${latest.id}`, { replace: true })
      })
      .catch((error) =>
        showToast({
          title: "读取知识库对话历史失败",
          description: error instanceof Error ? error.message : String(error),
          variant: "error",
        }),
      )
  }

  const loadFiles = async () => {
    const current = client()
    const activeNotebook = notebook()
    if (!current || !activeNotebook) return
    setState("loading", true)

    await Promise.all([listNotebookFiles(current), current.file.knowledgeGraph().catch(() => undefined)])
      .then(async ([files, graph]) => {
        const resolvedGraph = await resolveKnowledgeGraph(current, files, graph?.data)
        setState("files", files)
        setState("graph", resolvedGraph)
        const latestNotebook = notebook() ?? activeNotebook
        saveNotebook({
          ...latestNotebook,
          sourceCount: files.filter((file) => file.type === "file").length,
          updatedAt: Date.now(),
          lastOpenedAt: Date.now(),
        })
      })
      .catch((error) =>
        showToast({
          title: "读取笔记本目录失败",
          description: error instanceof Error ? error.message : String(error),
          variant: "error",
        }),
      )

    setState("loading", false)
  }

  createEffect(() => {
    if (!client()) return
    void loadFiles()
    void loadSessions()
  })

  createEffect(() => {
    const sessionID = activeSessionID()
    if (!sessionID) {
      loadedSession = ""
      setState("messages", [])
      return
    }
    if (loadedSession === sessionID) return
    loadedSession = sessionID
    serverSync().session.pin(sessionID)
    onCleanup(() => serverSync().session.unpin(sessionID))
    void sync().session.sync(sessionID)
    void loadMessages(sessionID)
  })

  createEffect(() => {
    const sessionID = activeSessionID()
    if (!sessionID) return
    const updated = sync().data.session.find((session) => session.id === sessionID)
    if (!updated) return
    setState("sessions", (session) => session.id === sessionID, updated)
  })

  const ensureSession = async () => {
    const activeNotebook = notebook()
    const current = client()
    if (!activeNotebook || !current) return
    const existing = activeSessionID()
    if (existing) return existing

    return current.session
      .create({
        directory: activeNotebook.directory,
        metadata: { cmccKnowledgeNotebookID: activeNotebook.id, cmccKnowledgeKind: "chat" },
      })
      .then((result) => {
        const sessionID = result.data?.id
        if (!sessionID) throw new Error("创建会话未返回 ID")
        saveNotebook({ ...cmccRememberKnowledgeSession(activeNotebook, sessionID), updatedAt: Date.now() })
        navigate(`/knowledge/${activeNotebook.id}/session/${sessionID}`, { replace: true })
        void sync().session.sync(sessionID)
        void loadSessions()
        return sessionID
      })
      .catch((error) => {
        showToast({
          title: "无法创建知识库对话",
          description: error instanceof Error ? error.message : String(error),
          variant: "error",
        })
        return undefined
      })
  }

  const send = async (text?: string) => {
    const target = composerPrompt.capture()
    const currentPrompt: Prompt = text
      ? [{ type: "text", content: text, start: 0, end: text.length }]
      : target.current().slice()
    const value = currentPrompt
      .map((part) => ("content" in part ? part.content : ""))
      .join("")
      .trim()
    const current = client()
    const activeNotebook = notebook()
    if (state.importing) {
      showToast({ title: "资料仍在入库，请等待整理与校验完成" })
      return
    }
    if (!value || !current || !activeNotebook || state.sending) return
    const currentModel = local.model.current()
    const currentAgent = local.agent.current()
    if (!currentModel || !currentAgent) {
      showToast({ title: "请选择模型和 Agent 后再发送" })
      return
    }
    setState({ sending: true, optimisticPrompt: value, activeTab: "chat" })
    const sessionID = await ensureSession()
    if (!sessionID) {
      setState({ sending: false, optimisticPrompt: "" })
      return
    }

    const context = target.context.items().slice()
    const messageID = Identifier.ascending("message")
    const requestParts = buildRequestParts({
      prompt: currentPrompt,
      context,
      images: currentPrompt.filter((part): part is ImageAttachmentPart => part.type === "image"),
      text: value,
      sessionID,
      messageID,
      sessionDirectory: activeNotebook.directory,
    }).requestParts
    if (!text) {
      target.set(DEFAULT_PROMPT, 0)
      context.forEach((item) => target.context.remove(item.key))
    }

    const succeeded = await current.session
      .prompt({
        sessionID,
        system: knowledgeSystemPrompt(activeNotebook),
        agent: currentAgent.name,
        model: { providerID: currentModel.provider.id, modelID: currentModel.id },
        variant: local.model.variant.current(),
        parts: requestParts,
      })
      .then(async () => {
        await Promise.all([loadMessages(sessionID), loadSessions()])
        return true
      })
      .catch((error) => {
        showToast({
          title: "知识库问答失败",
          description: error instanceof Error ? error.message : String(error),
          variant: "error",
        })
        return false
      })
    if (!succeeded && !text && !composerPrompt.dirty()) {
      target.set(
        currentPrompt,
        currentPrompt.reduce((length, part) => length + ("content" in part ? part.content.length : 0), 0),
      )
      context.forEach((item) =>
        target.context.add({
          type: item.type,
          path: item.path,
          selection: item.selection,
          comment: item.comment,
          commentID: item.commentID,
          commentOrigin: item.commentOrigin,
          preview: item.preview,
        }),
      )
    }
    setState({ sending: false, optimisticPrompt: "" })
  }

  const composerSubmission = {
    abort: async () => {
      const sessionID = activeSessionID()
      if (!sessionID) return
      await client()
        .session.abort({ sessionID })
        .catch(() => {})
    },
    handleSubmit: (event: Event) => {
      event.preventDefault()
      void send()
    },
  }

  const openFile = async (file: FileNode | { path: string; name?: string }) => {
    if (file.path === state.activeTab && state.contents[file.path]) return
    const name = file.name ?? basename(file.path)
    if (!state.tabs.some((tab) => tab.path === file.path))
      setState("tabs", (tabs) => [...tabs, { path: file.path, name }])
    setState({ activeTab: file.path, graphSelection: file.path })
    if (state.contents[file.path]) return
    const current = client()
    if (!current) return
    setState("loadingPath", file.path)
    await current.file
      .read({ path: file.path })
      .then((result) => {
        if (result.data) setState("contents", file.path, result.data)
      })
      .catch((error) =>
        showToast({
          title: "打开文件失败",
          description: error instanceof Error ? error.message : String(error),
          variant: "error",
        }),
      )
    setState("loadingPath", "")
  }

  const closeTab = (path: string) => {
    const index = state.tabs.findIndex((tab) => tab.path === path)
    setState("tabs", (tabs) => tabs.filter((tab) => tab.path !== path))
    if (state.activeTab !== path) return
    setState("activeTab", state.tabs[index - 1]?.path ?? "chat")
  }

  const removeFile = async () => {
    const file = fileRemoval.file
    const current = client()
    if (!file || !current || state.importing) return
    setFileRemoval("removing", true)
    await current.file
      .remove({ path: file.path }, { throwOnError: true })
      .then(async () => {
        setState("tabs", (tabs) => tabs.filter((tab) => tab.path !== file.path))
        setState("contents", (contents) =>
          Object.fromEntries(Object.entries(contents).filter(([path]) => path !== file.path)),
        )
        if (state.activeTab === file.path) setState("activeTab", "chat")
        if (state.graphSelection === file.path) setState("graphSelection", "")
        setFileRemoval({ file: undefined, removing: false })
        await loadFiles()
        showToast({ title: `已删除“${file.name}”`, description: "文件已从知识库目录永久删除。", variant: "success" })
      })
      .catch((error) => {
        setFileRemoval("removing", false)
        showToast({
          title: "删除文档失败",
          description: error instanceof Error ? error.message : String(error),
          variant: "error",
        })
      })
  }

  const openKnowledgeSession = (session: Session) => {
    const activeNotebook = notebook()
    if (!activeNotebook || activeSessionID() === session.id) return
    saveNotebook({ ...cmccRememberKnowledgeSession(activeNotebook, session.id), lastOpenedAt: Date.now() })
    setState({ activeTab: "chat", messages: [], optimisticPrompt: "" })
    navigate(`/knowledge/${activeNotebook.id}/session/${session.id}`)
  }

  const newKnowledgeSession = () => {
    const activeNotebook = notebook()
    if (!activeNotebook || state.sending || state.importing) return
    setState({ activeTab: "chat", messages: [], optimisticPrompt: "" })
    navigate(`/knowledge/${activeNotebook.id}/session/new`)
  }

  const removeKnowledgeSession = async () => {
    const session = sessionRemoval.session
    const activeNotebook = notebook()
    const current = client()
    if (!session || !activeNotebook || !current || state.sending || state.importing) return
    setSessionRemoval("removing", true)
    await current.session
      .delete({ sessionID: session.id, directory: activeNotebook.directory }, { throwOnError: true })
      .then((result) => {
        if (!result.data) throw new Error("删除请求未成功")
        const remaining = state.sessions.filter((item) => item.id !== session.id)
        const deletingActive = activeSessionID() === session.id
        saveNotebook({
          ...cmccForgetKnowledgeSession(activeNotebook, session.id, deletingActive ? remaining[0]?.id : undefined),
          updatedAt: Date.now(),
        })
        sync().session.evict(session.id)
        setState("sessions", remaining)
        setSessionRemoval({ session: undefined, removing: false })
        if (deletingActive) {
          loadedSession = ""
          setState({ activeTab: "chat", messages: [], optimisticPrompt: "" })
          navigate(
            remaining[0]
              ? `/knowledge/${activeNotebook.id}/session/${remaining[0].id}`
              : `/knowledge/${activeNotebook.id}/session/new`,
            { replace: true },
          )
        }
        showToast({ title: "对话已删除", description: "该对话及其消息已永久删除。", variant: "success" })
      })
      .catch((error) => {
        setSessionRemoval("removing", false)
        showToast({
          title: "删除对话失败",
          description: error instanceof Error ? error.message : String(error),
          variant: "error",
        })
      })
  }

  const importProgress = (phase: ImportPhase, completed: number, total: number, message: string) =>
    setState({ importPhase: phase, importCompleted: completed, importTotal: total, importMessage: message })

  const rawSourcePaths = (files: FileNode[]) =>
    files
      .filter((file) => file.type === "file" && file.path.replaceAll("\\", "/").startsWith("01_Raw_Sources/"))
      .map((file) => file.path)

  const organizeSources = async (
    current: OpencodeClient,
    activeNotebook: KnowledgeNotebook,
    sessionID: string,
    paths: string[],
  ) => {
    if (paths.length === 0) throw new Error("原始资料区没有发现新文件，未启动 llm-wiki")
    const batches = chunk(paths, wikiBatchSize)
    importProgress("organizing", 0, paths.length, `全部 ${paths.length} 个文件已落盘，开始分批构建 LLM Wiki`)
    await batches.reduce(
      (previous, batch, index) =>
        previous.then(async () => {
          importProgress(
            "organizing",
            Math.min(index * wikiBatchSize, paths.length),
            paths.length,
            `正在整理第 ${index + 1}/${batches.length} 批（${batch.length} 个文件）`,
          )
          await current.session.prompt({
            sessionID,
            system: knowledgeSystemPrompt(activeNotebook),
            parts: [{ type: "text", text: batchImportPrompt(activeNotebook, batch, index + 1, batches.length) }],
          })
          importProgress(
            "organizing",
            Math.min((index + 1) * wikiBatchSize, paths.length),
            paths.length,
            `已完成 ${Math.min((index + 1) * wikiBatchSize, paths.length)}/${paths.length} 个文件`,
          )
        }),
      Promise.resolve(),
    )
    importProgress("validating", paths.length, paths.length, "正在重建索引、校验双链与操作日志")
    await current.session.prompt({
      sessionID,
      system: knowledgeSystemPrompt(activeNotebook),
      parts: [{ type: "text", text: validateImportPrompt(paths.length) }],
    })
  }

  const runImport = async (
    activeNotebook: KnowledgeNotebook,
    current: OpencodeClient,
    stage: (sessionID: string, existing: Set<string>) => Promise<void>,
  ) => {
    setState({ importing: true, activeTab: "chat" })
    const existing = new Set(rawSourcePaths(await listNotebookFiles(current)))
    await current.session
      .create({
        directory: activeNotebook.directory,
        title: `知识库导入 · ${activeNotebook.name} · ${formatImportTime(new Date())}`,
        metadata: { cmccKnowledgeNotebookID: activeNotebook.id, cmccKnowledgeKind: "import" },
      })
      .then(async (result) => {
        const sessionID = result.data?.id
        if (!sessionID) throw new Error("创建导入任务未返回 ID")
        await stage(sessionID, existing)
        const staged = rawSourcePaths(await listNotebookFiles(current)).filter((path) => !existing.has(path))
        await organizeSources(current, activeNotebook, sessionID, staged)
        await loadFiles()
        importProgress("completed", staged.length, staged.length, `入库完成：${staged.length} 个文件已整理并通过校验`)
        showToast({ title: `知识库入库完成：${staged.length} 个文件`, variant: "success" })
      })
      .catch((error) => {
        importProgress("failed", 0, 0, error instanceof Error ? error.message : String(error))
        showToast({
          title: "知识库入库失败",
          description: error instanceof Error ? error.message : String(error),
          variant: "error",
        })
      })
    await loadSessions()
    setState("importing", false)
  }

  const importFiles = async (files: File[]) => {
    const activeNotebook = notebook()
    const current = client()
    if (!activeNotebook || !current || files.length === 0 || state.importing) return
    const accepted = files.filter((file) => file.size <= 25 * 1024 * 1024).slice(0, maxImportFiles)
    if (accepted.length !== files.length)
      showToast({ title: `已忽略超过 25 MB 的文件或超出 ${maxImportFiles} 个的部分` })
    if (accepted.length === 0) return
    importProgress("collecting", 0, accepted.length, `已收集 ${accepted.length} 个文件，准备写入原始资料区`)
    await runImport(activeNotebook, current, async () => {
      const used = new Set(rawSourcePaths(await listNotebookFiles(current)))
      const batches = chunk(accepted, attachmentBatchSize)
      await batches.reduce(
        (previous, batch, index) =>
          previous.then(async () => {
            importProgress(
              "staging",
              index * attachmentBatchSize,
              accepted.length,
              `正在落盘第 ${index + 1}/${batches.length} 批附件`,
            )
            await Promise.all(
              batch.map(async (file) => {
                const target = uniqueRawSourcePath(file.name, used)
                await current.file.upload(
                  { path: target, content: await fileBase64(file), encoding: "base64" },
                  { throwOnError: true },
                )
              }),
            )
            importProgress(
              "staging",
              Math.min((index + 1) * attachmentBatchSize, accepted.length),
              accepted.length,
              `已落盘 ${Math.min((index + 1) * attachmentBatchSize, accepted.length)}/${accepted.length} 个文件`,
            )
          }),
        Promise.resolve(),
      )
    })
  }

  const chooseFiles = async () => {
    if (!platform.openAttachmentPickerDialog) {
      inputElement?.click()
      return
    }
    const files: File[] = []
    await platform.openAttachmentPickerDialog({ title: "导入知识库来源", multiple: true }, async (file) => {
      files.push(file)
    })
    await importFiles(files)
  }

  const importDirectory = async () => {
    const activeNotebook = notebook()
    const current = client()
    if (platform.platform !== "desktop" || !activeNotebook || !current || state.importing) return
    const selected = await platform.openDirectoryPickerDialog({ title: "导入知识库目录", multiple: true })
    const paths = (Array.isArray(selected) ? selected : selected ? [selected] : []).filter(Boolean)
    if (paths.length === 0) return
    importProgress("collecting", 0, paths.length, `已选择 ${paths.length} 个目录，准备复制全部原始文件`)
    await runImport(activeNotebook, current, async (sessionID) => {
      importProgress("staging", 0, paths.length, "正在完整复制目录；此阶段不会调用 llm-wiki")
      await current.session.prompt({
        sessionID,
        system: stagingSystemPrompt(activeNotebook),
        parts: [{ type: "text", text: stageDirectoriesPrompt(activeNotebook, paths) }],
      })
      importProgress("staging", paths.length, paths.length, "目录复制完成，正在核对原始文件清单")
    })
  }

  return (
    <Show when={notebook()} fallback={<Navigate href="/knowledge" />}>
      {(activeNotebook) => (
        <div class="flex size-full min-h-0 min-w-0 flex-col bg-v2-background-bg-deep">
          <header
            class="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-v2-border-border-base bg-v2-background-bg-layer-01 px-3 transition-[padding-left] duration-200 motion-reduce:transition-none"
            style={{ "padding-left": layout.sidebar.opened() ? "12px" : "164px" }}
          >
            <div class="flex min-w-0 items-center gap-2">
              <button
                type="button"
                class="flex size-8 shrink-0 items-center justify-center rounded-[6px] text-v2-icon-icon-muted hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-icon-icon-base"
                title="返回知识库"
                onClick={() => navigate("/knowledge")}
              >
                <Icon name="arrow-left" class="size-4" />
              </button>
              <span class="text-lg">{activeNotebook().emoji}</span>
              <div class="min-w-0">
                <div class="truncate text-[14px] font-semibold leading-5 text-v2-text-text-base">
                  {activeNotebook().name}
                </div>
                <div class="truncate text-[11px] leading-4 text-v2-text-text-faint">
                  {sourceFiles().length} 个来源 · {graph().edges.length} 条关系
                </div>
              </div>
            </div>
            <div class="flex shrink-0 items-center gap-1">
              <Show when={!panelStore.sidebarOpened}>
                <button
                  type="button"
                  class="flex h-8 items-center gap-1.5 rounded-[6px] px-2.5 text-[12px] text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base"
                  title="展开来源面板"
                  onClick={() => setPanelStore("sidebarOpened", true)}
                >
                  <Icon name="chevron-right" class="size-3.5" />
                  来源
                </button>
              </Show>
              <button
                type="button"
                class="flex h-8 items-center gap-1.5 rounded-[6px] px-2.5 text-[12px] text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base"
                onClick={() => void loadFiles()}
              >
                <Icon name="reset" class="size-3.5" />
                刷新
              </button>
              <Show when={platform.openPath}>
                <button
                  type="button"
                  class="flex h-8 items-center gap-1.5 rounded-[6px] px-2.5 text-[12px] text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base"
                  onClick={() => void platform.openPath?.(activeNotebook().directory)}
                >
                  <Icon name="folder" class="size-3.5" />
                  打开目录
                </button>
              </Show>
              <Show when={!panelStore.graphOpened}>
                <button
                  type="button"
                  class="flex h-8 items-center gap-1.5 rounded-[6px] px-2.5 text-[12px] text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base"
                  title="展开知识图谱"
                  onClick={() => setPanelStore("graphOpened", true)}
                >
                  知识图谱
                  <Icon name="chevron-left" class="size-3.5" />
                </button>
              </Show>
            </div>
          </header>

          <main class="flex min-h-0 min-w-0 flex-1 overflow-hidden">
            <Show when={panelStore.sidebarOpened}>
            <aside
              class="flex min-h-0 min-w-0 shrink-0 flex-col border-r border-v2-border-border-base bg-v2-background-bg-layer-01"
              style={{ width: `${panelStore.sidebarWidth}px` }}
            >
              <PanelHeader
                title="来源"
                meta={`${sourceFiles().length} 个文件`}
                collapsible
                onCollapse={() => setPanelStore("sidebarOpened", false)}
              />
              <div class="flex shrink-0 flex-col gap-2 border-b border-v2-border-border-base p-3">
                <div
                  class="flex min-h-[104px] flex-col items-center justify-center gap-2 rounded-[8px] border border-dashed border-v2-border-border-strong bg-v2-background-bg-layer-02 px-3 py-3 text-center data-[active]:border-v2-border-border-active data-[active]:bg-v2-background-bg-layer-03"
                  data-active={state.dropActive ? "" : undefined}
                  onDragOver={(event) => {
                    event.preventDefault()
                    setState("dropActive", true)
                  }}
                  onDragLeave={() => setState("dropActive", false)}
                  onDrop={(event) => {
                    event.preventDefault()
                    setState("dropActive", false)
                    void importFiles([...(event.dataTransfer?.files ?? [])])
                  }}
                >
                  <Icon name="cloud-upload" class="size-5 text-v2-icon-icon-muted" />
                  <div class="text-[12px] leading-4 text-v2-text-text-muted">
                    {state.importing ? "资料正在分阶段入库..." : "拖拽文件到这里"}
                  </div>
                  <div class="flex flex-wrap justify-center gap-1.5">
                    <button
                      type="button"
                      class="h-7 rounded-[6px] bg-v2-text-text-base px-2.5 text-[11px] font-medium text-v2-background-bg-layer-01 disabled:opacity-50"
                      disabled={state.importing}
                      onClick={() => void chooseFiles()}
                    >
                      添加文件
                    </button>
                    <Show when={platform.platform === "desktop"}>
                      <button
                        type="button"
                        class="h-7 rounded-[6px] border border-v2-border-border-base bg-v2-background-bg-layer-01 px-2.5 text-[11px] text-v2-text-text-muted hover:text-v2-text-text-base disabled:opacity-50"
                        disabled={state.importing}
                        onClick={() => void importDirectory()}
                      >
                        导入目录
                      </button>
                    </Show>
                  </div>
                  <input
                    ref={inputElement}
                    class="hidden"
                    type="file"
                    multiple
                    onChange={(event) => {
                      void importFiles([...(event.currentTarget.files ?? [])])
                      event.currentTarget.value = ""
                    }}
                  />
                </div>
                <Show when={state.importPhase !== "idle"}>
                  <ImportStatus
                    phase={state.importPhase}
                    completed={state.importCompleted}
                    total={state.importTotal}
                    message={state.importMessage}
                  />
                </Show>
              </div>
              <div
                class="flex shrink-0 min-h-0 flex-col"
                style={
                  !panelStore.historyOpened
                    ? {}
                    : !panelStore.directoryOpened
                    ? { flex: "1 1 0%" }
                    : { height: `${panelStore.sessionListHeight + 36}px` }
                }
              >
                <div class="flex h-9 shrink-0 items-center justify-between px-3 text-[12px] font-semibold text-v2-text-text-muted">
                  <button
                    type="button"
                    class="flex items-center gap-1.5 text-left hover:text-v2-text-text-base focus:outline-none"
                    onClick={() => setPanelStore("historyOpened", !panelStore.historyOpened)}
                  >
                    <Icon
                      name={panelStore.historyOpened ? "chevron-down" : "chevron-right"}
                      class="size-3.5 transition-transform"
                    />
                    <span>对话历史 · {state.sessions.length}</span>
                  </button>
                  <button
                    type="button"
                    class="flex size-6 items-center justify-center rounded-[5px] text-v2-icon-icon-muted hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-icon-icon-base disabled:opacity-40"
                    title="新建知识库对话"
                    aria-label="新建知识库对话"
                    disabled={state.sending || state.importing}
                    onClick={newKnowledgeSession}
                  >
                    <Icon name="new-session" class="size-3.5" />
                  </button>
                </div>
                <Show when={panelStore.historyOpened}>
                  <div class="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
                    <For
                      each={state.sessions}
                      fallback={
                        <div class="px-2 py-2 text-[11px] text-v2-text-text-faint">暂无对话，发送问题后自动创建</div>
                      }
                    >
                      {(session) => {
                        const [hovered, setHovered] = createSignal(false)
                        const [focused, setFocused] = createSignal(false)
                        const deleteVisible = () => hovered() || focused()

                        return (
                          <div
                            class="flex h-8 w-full min-w-0 items-center rounded-[6px] text-[11px] text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base data-[selected]:bg-v2-background-bg-layer-03 data-[selected]:text-v2-text-text-base"
                            data-selected={activeSessionID() === session.id ? "" : undefined}
                            onMouseEnter={() => setHovered(true)}
                            onMouseMove={() => setHovered(true)}
                            onMouseLeave={() => setHovered(false)}
                            onFocusIn={() => setFocused(true)}
                            onFocusOut={(event) => {
                              if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))
                                return
                              setFocused(false)
                            }}
                          >
                          <button
                            type="button"
                            class="flex h-full min-w-0 flex-1 items-center gap-2 px-2 text-left"
                            onClick={() => openKnowledgeSession(session)}
                          >
                            <Icon
                              name={session.metadata?.cmccKnowledgeKind === "import" ? "task" : "brain"}
                              class="size-3.5 shrink-0"
                            />
                            <span class="min-w-0 flex-1 truncate">
                              {knowledgeSessionLabel(session, activeNotebook().name)}
                            </span>
                            <span class="shrink-0 text-[10px] text-v2-text-text-faint">
                              {knowledgeSessionTime(session)}
                            </span>
                          </button>
                          <button
                            type="button"
                            class="relative z-10 mr-1 flex size-6 shrink-0 touch-manipulation items-center justify-center rounded-[5px] text-v2-icon-icon-muted hover:bg-red-500/10 hover:text-red-500 disabled:cursor-not-allowed"
                            style={{
                              visibility: deleteVisible() ? "visible" : "hidden",
                              opacity: deleteVisible() ? "1" : "0",
                              "pointer-events": deleteVisible() ? "auto" : "none",
                            }}
                            title="删除对话"
                            aria-label={`删除对话 ${knowledgeSessionLabel(session, activeNotebook().name)}`}
                            disabled={state.sending || state.importing || sessionRemoval.removing}
                            onPointerDown={(event) => event.stopPropagation()}
                            onPointerUp={(event) => {
                              event.stopPropagation()
                              activateTreePointer(event, () => setSessionRemoval({ session, removing: false }))
                            }}
                            onClick={(event) => {
                              event.stopPropagation()
                              activateTreeClick(event, () => setSessionRemoval({ session, removing: false }))
                            }}
                          >
                            <Icon name="trash" class="size-3.5" />
                          </button>
                          </div>
                        )
                      }}
                    </For>
                  </div>
                </Show>
              </div>

              <Show when={panelStore.historyOpened && panelStore.directoryOpened}>
                <div
                  role="separator"
                  aria-orientation="horizontal"
                  class="relative z-10 h-2 w-full shrink-0 cursor-row-resize bg-transparent before:absolute before:inset-x-0 before:top-1/2 before:h-px before:-translate-y-1/2 before:bg-v2-border-border-base hover:before:bg-v2-border-border-strong"
                  onPointerDown={startSessionDrag}
                />
              </Show>

              <div class="flex h-9 shrink-0 items-center justify-between px-3 text-[12px] font-semibold text-v2-text-text-muted">
                <button
                  type="button"
                  class="flex items-center gap-1.5 text-left hover:text-v2-text-text-base focus:outline-none"
                  onClick={() => setPanelStore("directoryOpened", !panelStore.directoryOpened)}
                >
                  <Icon
                    name={panelStore.directoryOpened ? "chevron-down" : "chevron-right"}
                    class="size-3.5 transition-transform"
                  />
                  <span>笔记本目录</span>
                </button>
                <Show when={state.loading}>
                  <span class="size-3 animate-spin rounded-full border border-current border-r-transparent" />
                </Show>
              </div>
              <Show when={panelStore.directoryOpened}>
                <div class="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
                  <For each={rootChildren()} fallback={<EmptyFiles loading={state.loading} />}>
                    {(file) => (
                      <KnowledgeTreeNode
                        file={file}
                        files={state.files}
                        level={0}
                        active={state.activeTab}
                        expanded={state.expanded}
                        toggle={(path) =>
                          setState("expanded", (items) =>
                            items.includes(path) ? items.filter((item) => item !== path) : [...items, path],
                          )
                        }
                        open={(item) => void openFile(item)}
                        remove={(item) => setFileRemoval({ file: item, removing: false })}
                        deleting={fileRemoval.removing || state.importing}
                      />
                    )}
                  </For>
                </div>
              </Show>
            </aside>
            <div
              role="separator"
              aria-orientation="vertical"
              class="relative z-20 h-full w-1 shrink-0 cursor-col-resize bg-transparent before:absolute before:inset-y-0 before:left-1/2 before:w-px before:-translate-x-1/2 before:bg-v2-border-border-base hover:before:bg-v2-border-border-strong"
              onPointerDown={startLeftDrag}
            />
            </Show>

            <section class="flex min-h-0 min-w-0 flex-1 flex-col bg-v2-background-bg-base" style={{ "min-width": `${CONTENT_MIN_WIDTH}px` }}>
              <div class="flex h-10 shrink-0 items-end gap-1 overflow-x-auto border-b border-v2-border-border-base bg-v2-background-bg-layer-02 px-2 pt-1.5">
                <WorkspaceTab
                  active={state.activeTab === "chat"}
                  label="DeepInsight 对话"
                  icon="brain"
                  select={() => setState("activeTab", "chat")}
                />
                <For each={state.tabs}>
                  {(tab) => (
                    <WorkspaceTab
                      active={state.activeTab === tab.path}
                      label={tab.name}
                      icon="code"
                      select={() => setState("activeTab", tab.path)}
                      close={() => closeTab(tab.path)}
                    />
                  )}
                </For>
              </div>
              <Show
                when={state.activeTab === "chat"}
                fallback={
                  <DocumentPreview
                    notebook={activeNotebook()}
                    tab={activePreview()}
                    content={activePreview() ? state.contents[activePreview()!.path] : undefined}
                    loading={state.loadingPath === state.activeTab}
                    openPath={platform.openPath}
                  />
                }
              >
                <ChatWorkspace
                  notebook={activeNotebook()}
                  messages={state.messages}
                  optimisticPrompt={state.optimisticPrompt}
                  sending={state.sending}
                  importing={state.importing}
                  importMessage={state.importMessage}
                  send={(value) => void send(value)}
                  composer={
                    <PromptInput
                      class="shadow-none! border border-v2-border-border-strong"
                      controls={composerControls()}
                      submission={composerSubmission}
                    />
                  }
                />
              </Show>
            </section>

            <Show when={panelStore.graphOpened}>
            <div
              role="separator"
              aria-orientation="vertical"
              class="relative z-20 h-full w-1 shrink-0 cursor-col-resize bg-transparent before:absolute before:inset-y-0 before:left-1/2 before:w-px before:-translate-x-1/2 before:bg-v2-border-border-base hover:before:bg-v2-border-border-strong"
              onPointerDown={startRightDrag}
            />
            <aside
              class="flex min-h-0 min-w-0 shrink-0 flex-col border-l border-v2-border-border-base bg-v2-background-bg-layer-01"
              style={{ width: `${panelStore.graphWidth}px` }}
            >
              <KnowledgeGraphPanel
                graph={graph()}
                mode={state.graphMode}
                query={state.graphQuery}
                selection={state.graphSelection}
                setMode={(mode) => setState("graphMode", mode)}
                setQuery={(query) => setState("graphQuery", query)}
                select={(node) => {
                  setState("graphSelection", node.path)
                  void openFile({ path: node.path })
                }}
                clear={() => setState({ graphMode: "all", graphQuery: "", graphSelection: "" })}
                onCollapse={() => setPanelStore("graphOpened", false)}
                detailHeight={panelStore.graphDetailHeight}
                onDetailDrag={startDetailDrag}
              />
            </aside>
            </Show>
          </main>
          <Show when={fileRemoval.file} keyed>
            {(file) => (
              <Modal title="删除文档" close={() => !fileRemoval.removing && setFileRemoval("file", undefined)}>
                <div class="flex flex-col gap-4">
                  <p class="m-0 text-[14px] leading-6 text-v2-text-text-base">确定永久删除“{file.name}”吗？</p>
                  <div class="rounded-[7px] border border-red-500/35 bg-red-500/8 px-3 py-2 text-[12px] leading-5 text-v2-text-text-muted">
                    文件将从知识库目录中物理删除且无法恢复；如果其他知识页引用了它，相关链接可能失效。
                  </div>
                  <div class="flex justify-end gap-2">
                    <button
                      type="button"
                      class="h-9 rounded-[7px] border border-v2-border-border-base px-4 text-[13px] text-v2-text-text-base hover:bg-v2-background-bg-layer-02"
                      disabled={fileRemoval.removing}
                      onClick={() => setFileRemoval("file", undefined)}
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      class="flex h-9 items-center gap-2 rounded-[7px] bg-red-600 px-4 text-[13px] font-medium text-white hover:bg-red-500 disabled:opacity-50"
                      disabled={fileRemoval.removing}
                      onClick={() => void removeFile()}
                    >
                      <Show when={fileRemoval.removing} fallback={<Icon name="trash" class="size-4" />}>
                        <span class="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" />
                      </Show>
                      {fileRemoval.removing ? "正在删除..." : "永久删除"}
                    </button>
                  </div>
                </div>
              </Modal>
            )}
          </Show>
          <Show when={sessionRemoval.session} keyed>
            {(session) => (
              <Modal title="删除对话" close={() => !sessionRemoval.removing && setSessionRemoval("session", undefined)}>
                <div class="flex flex-col gap-4">
                  <p class="m-0 text-[14px] leading-6 text-v2-text-text-base">
                    确定永久删除“{knowledgeSessionLabel(session, activeNotebook().name)}”吗？
                  </p>
                  <div class="rounded-[7px] border border-red-500/35 bg-red-500/8 px-3 py-2 text-[12px] leading-5 text-v2-text-text-muted">
                    此对话及其中的全部消息会被永久删除，删除后无法恢复。知识库文件不会受到影响。
                  </div>
                  <div class="flex justify-end gap-2">
                    <button
                      type="button"
                      class="h-9 rounded-[7px] border border-v2-border-border-base px-4 text-[13px] text-v2-text-text-base hover:bg-v2-background-bg-layer-02"
                      disabled={sessionRemoval.removing}
                      onClick={() => setSessionRemoval("session", undefined)}
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      class="flex h-9 items-center gap-2 rounded-[7px] bg-red-600 px-4 text-[13px] font-medium text-white hover:bg-red-500 disabled:opacity-50"
                      disabled={sessionRemoval.removing}
                      onClick={() => void removeKnowledgeSession()}
                    >
                      <Show when={sessionRemoval.removing} fallback={<Icon name="trash" class="size-4" />}>
                        <span class="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" />
                      </Show>
                      {sessionRemoval.removing ? "正在删除..." : "永久删除"}
                    </button>
                  </div>
                </div>
              </Modal>
            )}
          </Show>
        </div>
      )}
    </Show>
  )
}

function NotebookCard(props: {
  notebook: KnowledgeNotebook
  index: number
  open: () => void
  remove: () => void
  rename: () => void
  togglePinned: () => void
}) {
  const [menuOpen, setMenuOpen] = createSignal(false)
  let menuElement: HTMLDivElement | undefined
  const gradient = () => {
    const colors = [
      ["#244c48", "#172f33"],
      ["#4b3d58", "#2b283a"],
      ["#4a4632", "#2f3027"],
      ["#36495c", "#252f3a"],
      ["#563a3d", "#33282c"],
    ][props.index % 5]
    return `linear-gradient(145deg, ${colors[0]}, ${colors[1]})`
  }

  createEffect(() => {
    if (!menuOpen()) return
    const close = (event: PointerEvent) => {
      if (menuElement?.contains(event.target as Node)) return
      setMenuOpen(false)
    }
    document.addEventListener("pointerdown", close)
    onCleanup(() => document.removeEventListener("pointerdown", close))
  })

  return (
    <article
      class="group relative flex min-h-[178px] min-w-0 flex-col rounded-[12px] border border-v2-border-border-base text-left shadow-[var(--v2-elevation-flat)] transition-transform hover:-translate-y-0.5 hover:border-v2-border-border-strong"
      classList={{ "z-30": menuOpen() }}
    >
      <button
        type="button"
        class="flex min-h-0 flex-1 flex-col justify-between rounded-t-[11px] p-4 text-left text-white"
        style={{ background: gradient() }}
        onClick={props.open}
      >
        <div class="flex items-start gap-2 text-3xl">
          <span>{props.notebook.emoji}</span>
          <Show when={props.notebook.pinned}>
            <span class="text-[14px] leading-5" title="已置顶">
              📌
            </span>
          </Show>
        </div>
        <div class="min-w-0">
          <h3 class="m-0 line-clamp-2 text-[16px] font-semibold leading-6">{props.notebook.name}</h3>
          <p class="m-0 mt-1 line-clamp-2 text-[11px] leading-4 text-white/65">
            {props.notebook.description || "可对话的个人知识空间"}
          </p>
        </div>
      </button>
      <div ref={menuElement} class="absolute right-2.5 top-2.5 z-20">
        <button
          type="button"
          class="flex size-8 items-center justify-center rounded-[7px] text-[22px] leading-none text-white/75 hover:bg-black/20 hover:text-white"
          aria-label={`更多${props.notebook.name}`}
          aria-expanded={menuOpen()}
          onClick={(event) => {
            event.stopPropagation()
            setMenuOpen((open) => !open)
          }}
        >
          ⋮
        </button>
        <Show when={menuOpen()}>
          <div class="absolute right-0 top-9 flex w-[148px] flex-col gap-1 rounded-[9px] border border-v2-border-border-base bg-v2-background-bg-layer-02 p-1.5 text-v2-text-text-base shadow-[0_14px_40px_rgba(0,0,0,0.28)]">
            <NotebookMenuItem
              icon={<Icon name="trash" class="size-4" />}
              label="删除"
              action={() => {
                setMenuOpen(false)
                props.remove()
              }}
            />
            <NotebookMenuItem
              icon={<Icon name="pencil-line" class="size-4" />}
              label="修改标题"
              action={() => {
                setMenuOpen(false)
                props.rename()
              }}
            />
            <NotebookMenuItem
              icon={<span class="text-[14px] leading-none">📌</span>}
              label={props.notebook.pinned ? "取消置顶" : "置顶"}
              action={() => {
                setMenuOpen(false)
                props.togglePinned()
              }}
            />
          </div>
        </Show>
      </div>
      <div class="flex h-10 shrink-0 items-center gap-2 rounded-b-[11px] bg-v2-background-bg-layer-01 px-3 text-[11px] text-v2-text-text-faint">
        <button type="button" class="min-w-0 flex-1 truncate text-left" onClick={props.open}>
          最近打开于 {formatDate(props.notebook.lastOpenedAt)} · {props.notebook.sourceCount ?? 0} 个来源
        </button>
      </div>
    </article>
  )
}

function NotebookMenuItem(props: { icon: JSX.Element; label: string; action: () => void }) {
  return (
    <button
      type="button"
      class="flex h-9 w-full items-center gap-3 rounded-[6px] px-2.5 text-left text-[13px] hover:bg-v2-overlay-simple-overlay-hover"
      onClick={props.action}
    >
      <span class="flex size-5 items-center justify-center text-v2-icon-icon-muted">{props.icon}</span>
      <span>{props.label}</span>
    </button>
  )
}

function FeatureStep(props: { icon: Parameters<typeof Icon>[0]["name"]; label: string }) {
  return (
    <div class="flex min-h-[88px] flex-col items-center justify-center gap-2 rounded-[9px] bg-v2-background-bg-layer-02 px-2 text-center text-[12px] text-v2-text-text-muted">
      <Icon name={props.icon} class="size-5 text-v2-icon-icon-base" />
      <span>{props.label}</span>
    </div>
  )
}

function Modal(props: { title: string; close: () => void; children: import("solid-js").JSX.Element }) {
  return (
    <div class="fixed inset-0 z-[220] flex items-center justify-center bg-black/55 px-4 py-6" onClick={props.close}>
      <section
        class="w-full max-w-[480px] rounded-[12px] border border-v2-border-border-base bg-v2-background-bg-layer-01 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.34)]"
        onClick={(event) => event.stopPropagation()}
      >
        <header class="mb-5 flex items-center justify-between gap-3">
          <h2 class="m-0 text-[18px] font-semibold leading-6 text-v2-text-text-base">{props.title}</h2>
          <button
            type="button"
            class="flex size-8 items-center justify-center rounded-[6px] text-v2-icon-icon-muted hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-icon-icon-base"
            onClick={props.close}
          >
            <Icon name="close" class="size-4" />
          </button>
        </header>
        {props.children}
      </section>
    </div>
  )
}

function PanelHeader(props: { title: string; meta: string; collapsible?: boolean; onCollapse?: () => void }) {
  return (
    <div class="flex h-10 shrink-0 items-center justify-between gap-3 border-b border-v2-border-border-base px-3">
      <h2 class="m-0 text-[13px] font-semibold leading-5 text-v2-text-text-base">{props.title}</h2>
      <div class="flex items-center gap-1">
        <span class="text-[11px] text-v2-text-text-faint">{props.meta}</span>
        <Show when={props.collapsible && props.onCollapse}>
          <button
            type="button"
            class="flex size-6 items-center justify-center rounded-[5px] text-v2-icon-icon-muted hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-icon-icon-base"
            title="折叠面板"
            onClick={() => props.onCollapse?.()}
          >
            <Icon name="chevron-left" class="size-3.5" />
          </button>
        </Show>
      </div>
    </div>
  )
}

function ImportStatus(props: { phase: ImportPhase; completed: number; total: number; message: string }) {
  const percent = () => (props.total > 0 ? Math.min(100, Math.round((props.completed / props.total) * 100)) : 0)
  const label = () =>
    ({
      idle: "等待导入",
      collecting: "收集清单",
      staging: "落盘原始资料",
      organizing: "构建 LLM Wiki",
      validating: "校验索引与双链",
      completed: "入库完成",
      failed: "入库失败",
    })[props.phase]

  return (
    <div class="rounded-[8px] border border-v2-border-border-base bg-v2-background-bg-layer-02 p-2.5">
      <div class="flex items-center justify-between gap-2 text-[11px] leading-4">
        <span class="font-medium text-v2-text-text-base">{label()}</span>
        <span class="text-v2-text-text-faint">{props.total > 0 ? `${props.completed}/${props.total}` : ""}</span>
      </div>
      <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-v2-background-bg-layer-03">
        <div
          class="h-full rounded-full bg-v2-text-text-base transition-[width] duration-300"
          classList={{ "bg-red-500": props.phase === "failed" }}
          style={{ width: `${props.phase === "validating" || props.phase === "completed" ? 100 : percent()}%` }}
        />
      </div>
      <div class="mt-2 text-[10px] leading-4 text-v2-text-text-muted">{props.message}</div>
    </div>
  )
}

function EmptyFiles(props: { loading: boolean }) {
  return (
    <div class="flex min-h-[160px] flex-col items-center justify-center gap-2 px-4 text-center text-[12px] leading-5 text-v2-text-text-faint">
      <Icon name="folder" class="size-6 opacity-60" />
      <span>{props.loading ? "正在读取目录..." : "空白笔记本\n添加文件后会在这里显示"}</span>
    </div>
  )
}

function KnowledgeTreeNode(props: {
  file: FileNode
  files: FileNode[]
  level: number
  active: string
  expanded: string[]
  toggle: (path: string) => void
  open: (file: FileNode) => void
  remove: (file: FileNode) => void
  deleting: boolean
}) {
  const directory = () => props.file.type === "directory"
  const open = () => props.expanded.includes(props.file.path)
  const children = createMemo(() => fileChildren(props.files, props.file.path))
  const activate = () => (directory() ? props.toggle(props.file.path) : props.open(props.file))
  const [hovered, setHovered] = createSignal(false)
  const [focused, setFocused] = createSignal(false)
  const deleteVisible = () => hovered() || focused()

  return (
    <div>
      <div
        class="flex h-7 w-full min-w-0 items-center gap-1.5 rounded-[5px] pr-1 text-left text-[12px] text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base data-[selected]:bg-v2-background-bg-layer-03 data-[selected]:text-v2-text-text-base"
        style={{ "padding-left": `${6 + props.level * 13}px` }}
        data-selected={!directory() && props.active === props.file.path ? "" : undefined}
        onMouseEnter={() => setHovered(true)}
        onMouseMove={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocusIn={() => setFocused(true)}
        onFocusOut={(event) => {
          if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return
          setFocused(false)
        }}
      >
        <Show when={directory()} fallback={<span class="size-5 shrink-0" />}>
          <button
            type="button"
            class="flex size-5 shrink-0 touch-manipulation items-center justify-center rounded-[4px] hover:bg-v2-overlay-simple-overlay-active"
            aria-label={`${open() ? "收起" : "展开"}${props.file.name}`}
            aria-expanded={open()}
            title={open() ? "收起目录" : "展开目录"}
            onPointerUp={(event) => activateTreePointer(event, () => props.toggle(props.file.path))}
            onClick={(event) => activateTreeClick(event, () => props.toggle(props.file.path))}
          >
            <Icon
              name="chevron-right"
              class="size-3 shrink-0 transition-transform"
              classList={{ "rotate-90": open() }}
            />
          </button>
        </Show>
        <button
          type="button"
          class="flex h-full min-w-0 flex-1 touch-manipulation items-center gap-1.5 text-left"
          aria-label={
            directory() ? `${open() ? "收起" : "展开"}目录 ${props.file.name}` : `打开文档 ${props.file.name}`
          }
          onPointerUp={(event) => activateTreePointer(event, activate)}
          onClick={(event) => activateTreeClick(event, activate)}
        >
          <Icon name={directory() ? "folder" : "code"} class="size-3.5 shrink-0" />
          <span class="min-w-0 flex-1 truncate">{props.file.name}</span>
        </button>
        <Show when={!directory()}>
          <button
            type="button"
            class="relative z-10 flex size-7 shrink-0 touch-manipulation items-center justify-center rounded-[4px] text-v2-icon-icon-muted hover:bg-red-500/10 hover:text-red-500 disabled:cursor-not-allowed"
            style={{
              visibility: deleteVisible() ? "visible" : "hidden",
              opacity: deleteVisible() ? "1" : "0",
              "pointer-events": deleteVisible() ? "auto" : "none",
            }}
            aria-label={`删除文档 ${props.file.name}`}
            title="删除文档"
            disabled={props.deleting}
            onPointerDown={(event) => event.stopPropagation()}
            onPointerUp={(event) => {
              event.stopPropagation()
              activateTreePointer(event, () => props.remove(props.file))
            }}
            onClick={(event) => {
              event.stopPropagation()
              activateTreeClick(event, () => props.remove(props.file))
            }}
          >
            <Icon name="trash" class="size-3.5" />
          </button>
        </Show>
      </div>
      <Show when={directory() && open()}>
        <For each={children()}>
          {(file) => (
            <KnowledgeTreeNode
              file={file}
              files={props.files}
              level={props.level + 1}
              active={props.active}
              expanded={props.expanded}
              toggle={props.toggle}
              open={props.open}
              remove={props.remove}
              deleting={props.deleting}
            />
          )}
        </For>
      </Show>
    </div>
  )
}

function activateTreePointer(event: PointerEvent, action: () => void) {
  if (event.button !== 0) return
  action()
}

function activateTreeClick(event: MouseEvent, action: () => void) {
  if (event.detail !== 0) return
  action()
}

function WorkspaceTab(props: {
  active: boolean
  label: string
  icon: Parameters<typeof Icon>[0]["name"]
  select: () => void
  close?: () => void
}) {
  return (
    <div
      class="group flex h-8 max-w-[210px] shrink-0 items-center rounded-t-[7px] border border-b-0 border-v2-border-border-base bg-v2-background-bg-layer-03 text-v2-text-text-muted data-[selected]:bg-v2-background-bg-base data-[selected]:text-v2-text-text-base"
      data-selected={props.active ? "" : undefined}
    >
      <button
        type="button"
        class="flex h-full min-w-0 items-center gap-1.5 pl-2.5 pr-2 text-[12px]"
        onClick={props.select}
      >
        <Icon name={props.icon} class="size-3.5 shrink-0" />
        <span class="min-w-0 truncate">{props.label}</span>
      </button>
      <Show when={props.close}>
        {(close) => (
          <button
            type="button"
            class="mr-1 flex size-5 shrink-0 items-center justify-center rounded-[4px] text-v2-icon-icon-faint hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-icon-icon-base"
            title="关闭"
            onClick={(event) => {
              event.stopPropagation()
              close()()
            }}
          >
            <Icon name="close-small" class="size-3" />
          </button>
        )}
      </Show>
    </div>
  )
}

function ChatWorkspace(props: {
  notebook: KnowledgeNotebook
  messages: ChatMessage[]
  optimisticPrompt: string
  sending: boolean
  importing: boolean
  importMessage: string
  send: (value: string) => void
  composer: JSX.Element
}) {
  const visibleMessages = createMemo(() =>
    props.messages
      .map((message) => ({
        id: message.info.id,
        role: message.info.role,
        text: message.parts
          .filter((part): part is TextPart => part.type === "text" && !part.ignored)
          .map((part) => part.text)
          .join("\n\n"),
      }))
      .filter((message) => message.text.trim()),
  )

  return (
    <div class="flex min-h-0 flex-1 flex-col">
      <div class="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        <Show
          when={visibleMessages().length > 0 || props.optimisticPrompt}
          fallback={
            <div class="mx-auto flex h-full max-w-[680px] flex-col items-center justify-center text-center">
              <div class="mb-4 flex size-12 items-center justify-center rounded-[14px] bg-v2-background-bg-layer-03 text-2xl">
                {props.notebook.emoji}
              </div>
              <h2 class="m-0 text-[20px] font-semibold leading-7 text-v2-text-text-base">
                与“{props.notebook.name}”对话
              </h2>
              <p class="m-0 mt-2 max-w-[520px] text-[13px] leading-6 text-v2-text-text-muted">
                DeepInsight 会以当前笔记本目录为工作区，检索原始文件和 llm-wiki 产物，并在回答中给出可追溯的文件路径。
              </p>
              <div class="mt-5 grid w-full max-w-[560px] grid-cols-1 gap-2 sm:grid-cols-2">
                <Suggestion label="总结这个笔记本的核心主题" send={props.send} disabled={props.importing} />
                <Suggestion label="找出材料之间最重要的关系" send={props.send} disabled={props.importing} />
                <Suggestion label="哪些结论缺少证据支持？" send={props.send} disabled={props.importing} />
                <Suggestion label="生成一份结构化研究提纲" send={props.send} disabled={props.importing} />
              </div>
            </div>
          }
        >
          <div class="mx-auto flex w-full max-w-[760px] flex-col gap-5">
            <For each={visibleMessages()}>
              {(message) => (
                <div class="flex gap-3" classList={{ "justify-end": message.role === "user" }}>
                  <Show when={message.role === "assistant"}>
                    <div class="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-[8px] bg-v2-background-bg-layer-03">
                      <Icon name="brain" class="size-4" />
                    </div>
                  </Show>
                  <div
                    class="min-w-0 max-w-[88%] rounded-[10px] px-3.5 py-2.5 text-[13px] leading-6"
                    classList={{
                      "bg-v2-background-bg-layer-03 text-v2-text-text-base": message.role === "user",
                      "text-v2-text-text-base": message.role === "assistant",
                    }}
                  >
                    <Markdown text={message.text} cacheKey={message.id} />
                  </div>
                </div>
              )}
            </For>
            <Show when={props.optimisticPrompt}>
              <div class="flex justify-end">
                <div class="max-w-[88%] rounded-[10px] bg-v2-background-bg-layer-03 px-3.5 py-2.5 text-[13px] leading-6 text-v2-text-text-base">
                  {props.optimisticPrompt}
                </div>
              </div>
            </Show>
            <Show when={props.sending}>
              <div class="flex items-center gap-3 text-[12px] text-v2-text-text-faint">
                <div class="flex size-7 items-center justify-center rounded-[8px] bg-v2-background-bg-layer-03">
                  <span class="size-3 animate-spin rounded-full border border-current border-r-transparent" />
                </div>
                DeepInsight 正在检索笔记本...
              </div>
            </Show>
          </div>
        </Show>
      </div>
      <div class="shrink-0 border-t border-v2-border-border-base bg-v2-background-bg-layer-01 p-3">
        <Show when={props.importing}>
          <div class="mx-auto mb-2 max-w-[780px] rounded-[8px] border border-v2-border-border-base bg-v2-background-bg-layer-02 px-3 py-2 text-[11px] leading-5 text-v2-text-text-muted">
            资料入库期间暂时锁定对话，避免重复调用 skill 或读取到不完整索引。{props.importMessage}
          </div>
        </Show>
        <div class="mx-auto max-w-[780px]">{props.composer}</div>
        <div class="mx-auto mt-1.5 max-w-[780px] text-center text-[10px] leading-4 text-v2-text-text-faint">
          回答由 DeepInsight 生成，请结合原始来源核验关键信息
        </div>
      </div>
    </div>
  )
}

function Suggestion(props: { label: string; send: (value: string) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      class="rounded-[8px] border border-v2-border-border-base bg-v2-background-bg-layer-01 px-3 py-2.5 text-left text-[12px] leading-5 text-v2-text-text-muted hover:bg-v2-background-bg-layer-02 hover:text-v2-text-text-base"
      disabled={props.disabled}
      onClick={() => props.send(props.label)}
    >
      {props.label}
    </button>
  )
}

function DocumentPreview(props: {
  notebook: KnowledgeNotebook
  tab: PreviewTab | undefined
  content: FileContent | undefined
  loading: boolean
  openPath?: (path: string, app?: string) => Promise<void>
}) {
  return (
    <div class="flex min-h-0 flex-1 flex-col">
      <Show
        when={props.tab}
        fallback={
          <div class="grid flex-1 place-items-center text-[13px] text-v2-text-text-faint">选择左侧文件进行预览</div>
        }
      >
        {(tab) => (
          <>
            <div class="flex h-10 shrink-0 items-center justify-between gap-3 border-b border-v2-border-border-base px-4">
              <div class="min-w-0">
                <div class="truncate text-[13px] font-medium text-v2-text-text-base">{tab().name}</div>
                <div class="truncate text-[10px] text-v2-text-text-faint">{tab().path}</div>
              </div>
              <Show when={props.openPath}>
                <button
                  type="button"
                  class="flex h-7 shrink-0 items-center gap-1.5 rounded-[6px] px-2 text-[11px] text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base"
                  onClick={() => void props.openPath?.(absolutePath(props.notebook.directory, tab().path))}
                >
                  <Icon name="open-file" class="size-3.5" />
                  系统打开
                </button>
              </Show>
            </div>
            <Show
              when={!props.loading && props.content}
              fallback={
                <div class="flex flex-1 items-center justify-center gap-2 text-[12px] text-v2-text-text-faint">
                  <span class="size-3 animate-spin rounded-full border border-current border-r-transparent" />
                  正在读取文件...
                </div>
              }
            >
              {(content) => (
                <div class="min-h-0 flex-1 overflow-hidden">
                  <ArtifactPreview
                    path={tab().path}
                    content={content()}
                    markdownCacheKey={`knowledge:${tab().path}`}
                    htmlTitle="请使用系统打开"
                    htmlDescription="知识库中的 HTML 文件不会在当前页面执行，可通过右上角“系统打开”查看。"
                    unsupportedDescription="文件已保留在笔记本目录中，并可被 DeepInsight 与 llmwiki 使用。你可以通过右上角“系统打开”查看原始文件。"
                  />
                </div>
              )}
            </Show>
          </>
        )}
      </Show>
    </div>
  )
}

function KnowledgeGraphPanel(props: {
  graph: KnowledgeGraph
  mode: GraphMode
  query: string
  selection: string
  setMode: (mode: GraphMode) => void
  setQuery: (query: string) => void
  select: (node: KnowledgeGraphNode) => void
  clear: () => void
  onCollapse?: () => void
  detailHeight?: number
  onDetailDrag?: (event: PointerEvent) => void
}) {
  const [resetKey, setResetKey] = createSignal(0)
  const nodeMap = createMemo(() => new Map(props.graph.nodes.map((node) => [node.id, node])))
  const selected = createMemo(() => nodeMap().get(props.selection))
  const neighborIDs = createMemo(() => {
    const current = selected()
    if (!current || props.mode === "all") return new Set(props.graph.nodes.map((node) => node.id))
    const ids = new Set([current.id])
    props.graph.edges.forEach((edge) => {
      if (props.mode === "upstream" && edge.target === current.id) ids.add(edge.source)
      if (props.mode === "downstream" && edge.source === current.id) ids.add(edge.target)
    })
    return ids
  })
  const visibleNodes = createMemo(() => props.graph.nodes.filter((node) => neighborIDs().has(node.id)))
  const visibleEdges = createMemo(() =>
    props.graph.edges.filter((edge) => neighborIDs().has(edge.source) && neighborIDs().has(edge.target)),
  )
  const matched = createMemo(() => {
    const query = normalizeWikiName(props.query)
    if (!query) return new Set<string>()
    return new Set(
      props.graph.nodes.filter((node) => normalizeWikiName(node.label).includes(query)).map((node) => node.id),
    )
  })
  const upstream = createMemo(() => {
    const id = selected()?.id
    if (!id) return []
    return props.graph.edges
      .flatMap((edge) => (edge.target === id ? [nodeMap().get(edge.source)] : []))
      .filter((node): node is KnowledgeGraphNode => Boolean(node))
  })
  const downstream = createMemo(() => {
    const id = selected()?.id
    if (!id) return []
    return props.graph.edges
      .flatMap((edge) => (edge.source === id ? [nodeMap().get(edge.target)] : []))
      .filter((node): node is KnowledgeGraphNode => Boolean(node))
  })

  return (
    <div class="flex min-h-0 flex-1 flex-col">
      <PanelHeader
        title="知识图谱"
        meta={`${props.graph.nodes.length} 节点 · ${props.graph.edges.length} 关系`}
        collapsible={!!props.onCollapse}
        onCollapse={props.onCollapse}
      />
      <div class="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-v2-border-border-base p-2">
        <GraphModeButton label="全部" active={props.mode === "all"} click={() => props.setMode("all")} />
        <GraphModeButton label="上游" active={props.mode === "upstream"} click={() => props.setMode("upstream")} />
        <GraphModeButton label="下游" active={props.mode === "downstream"} click={() => props.setMode("downstream")} />
        <label class="ml-auto flex h-7 min-w-[130px] flex-1 items-center gap-1.5 rounded-[6px] border border-v2-border-border-base bg-v2-background-bg-base px-2 text-v2-text-text-faint">
          <Icon name="magnifying-glass" class="size-3.5 shrink-0" />
          <input
            class="min-w-0 flex-1 bg-transparent text-[11px] text-v2-text-text-base outline-none placeholder:text-v2-text-text-faint"
            placeholder="搜索概念"
            value={props.query}
            onInput={(event) => props.setQuery(event.currentTarget.value)}
          />
        </label>
        <button
          type="button"
          class="flex size-7 items-center justify-center rounded-[6px] text-v2-icon-icon-muted hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-icon-icon-base"
          title="重置视图"
          onClick={() => {
            props.clear()
            setResetKey((value) => value + 1)
          }}
        >
          <Icon name="reset" class="size-3.5" />
        </button>
      </div>
      <div class="relative min-h-[280px] flex-1 overflow-hidden bg-v2-background-bg-deep">
        <Show
          when={props.graph.nodes.length > 0}
          fallback={
            <div class="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
              <Icon name="branch" class="size-8 text-v2-icon-icon-muted" />
              <div class="text-[13px] font-medium text-v2-text-text-base">等待生成知识关系</div>
              <div class="max-w-[360px] text-[11px] leading-5 text-v2-text-text-faint">
                导入材料并完成 llmwiki 解析后，Markdown 双链会在这里形成可交互图谱。
              </div>
            </div>
          }
        >
          <ForceKnowledgeGraph
            nodes={visibleNodes()}
            edges={visibleEdges()}
            selection={props.selection}
            matched={matched()}
            query={props.query}
            resetKey={resetKey()}
            select={props.select}
          />
          <div class="pointer-events-none absolute bottom-2 left-2 rounded-[6px] border border-v2-border-border-base bg-v2-background-bg-layer-01/90 px-2 py-1 text-[10px] text-v2-text-text-faint">
            拖动节点 · 滚轮缩放 · 拖动空白处平移 · 点击打开文档
          </div>
        </Show>
      </div>
      <Show when={props.onDetailDrag}>
        <div
          role="separator"
          aria-orientation="horizontal"
          class="relative z-10 h-2 w-full shrink-0 cursor-row-resize bg-transparent before:absolute before:inset-x-0 before:top-1/2 before:h-px before:-translate-y-1/2 before:bg-v2-border-border-base hover:before:bg-v2-border-border-strong"
          onPointerDown={props.onDetailDrag}
        />
      </Show>
      <div
        class="shrink-0 overflow-y-auto border-t border-v2-border-border-base bg-v2-background-bg-layer-01 p-3"
        style={{ height: props.detailHeight ? `${props.detailHeight}px` : "180px" }}
      >
        <Show
          when={selected()}
          fallback={
            <div class="flex h-full items-center justify-center text-center text-[11px] leading-5 text-v2-text-text-faint">
              选择节点查看上下游关系
            </div>
          }
        >
          {(node) => (
            <div>
              <div class="mb-3 flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="truncate text-[13px] font-semibold text-v2-text-text-base">{node().label}</div>
                  <div class="mt-1 truncate text-[10px] text-v2-text-text-faint">{node().path}</div>
                </div>
                <span class="shrink-0 rounded-full bg-v2-background-bg-layer-03 px-2 py-1 text-[10px] text-v2-text-text-muted">
                  {node().degree} 关联
                </span>
              </div>
              <div class="grid grid-cols-2 gap-3">
                <RelationList title={`上游 ${upstream().length}`} nodes={upstream()} select={props.select} />
                <RelationList title={`下游 ${downstream().length}`} nodes={downstream()} select={props.select} />
              </div>
            </div>
          )}
        </Show>
      </div>
    </div>
  )
}

function GraphModeButton(props: { label: string; active: boolean; click: () => void }) {
  return (
    <button
      type="button"
      class="h-7 rounded-[6px] px-2.5 text-[11px] text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover data-[selected]:bg-v2-text-text-base data-[selected]:text-v2-background-bg-layer-01"
      data-selected={props.active ? "" : undefined}
      onClick={props.click}
    >
      {props.label}
    </button>
  )
}

function RelationList(props: {
  title: string
  nodes: KnowledgeGraphNode[]
  select: (node: KnowledgeGraphNode) => void
}) {
  return (
    <div class="min-w-0">
      <div class="mb-1.5 text-[10px] font-medium uppercase tracking-[0.06em] text-v2-text-text-faint">
        {props.title}
      </div>
      <For each={props.nodes} fallback={<div class="text-[10px] leading-5 text-v2-text-text-faint">暂无</div>}>
        {(node) => (
          <button
            type="button"
            class="mb-1 flex h-6 w-full min-w-0 items-center gap-1.5 rounded-[5px] px-1.5 text-left text-[10px] text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base"
            onClick={() => props.select(node)}
          >
            <span class="size-1.5 shrink-0 rounded-full" style={{ background: graphColor(node) }} />
            <span class="truncate">{node.label}</span>
          </button>
        )}
      </For>
    </div>
  )
}

async function listNotebookFiles(client: OpencodeClient, path = ""): Promise<FileNode[]> {
  const files = await client.file.list({ path }).then((result) => result.data ?? [])
  const visible = files
    .filter((file) => !file.ignored && !file.path.split(/[\\/]/).some((part) => part === ".git"))
    .map((file) => ({ ...file, path: normalizeNotebookPath(file.path) }))
  const nested = await Promise.all(
    visible.filter((file) => file.type === "directory").map((file) => listNotebookFiles(client, file.path)),
  )
  return [...visible, ...nested.flat()].toSorted((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1
    return a.path.localeCompare(b.path, "zh-CN")
  })
}

async function resolveKnowledgeGraph(client: OpencodeClient, files: FileNode[], value: unknown) {
  const wikiFiles = files.filter(
    (file) =>
      file.type === "file" &&
      normalizeNotebookPath(file.path).startsWith("02_LLM_Wiki/") &&
      markdownExtensions.test(file.path),
  )
  if (isKnowledgeGraph(value) && (value.nodes.length > 0 || wikiFiles.length === 0)) return value

  const pages = (
    await Promise.all(
      wikiFiles.map(async (file) => {
        const content = await client.file
          .read({ path: file.path })
          .then((result) => result.data)
          .catch(() => undefined)
        if (content?.type !== "text") return
        return { path: file.path, content: content.content }
      }),
    )
  ).filter((page): page is { path: string; content: string } => Boolean(page))
  return cmccBuildKnowledgeGraph(pages)
}

function isKnowledgeGraph(value: unknown): value is KnowledgeGraph {
  if (!value || typeof value !== "object") return false
  const graph = value as Partial<KnowledgeGraph>
  return Array.isArray(graph.nodes) && Array.isArray(graph.edges)
}

function fileChildren(files: FileNode[], parent: string) {
  const normalized = normalizeNotebookPath(parent)
  return files.filter((file) => parentPath(file.path) === normalized)
}

function parentPath(path: string) {
  const parts = normalizeNotebookPath(path).split("/")
  return parts.slice(0, -1).join("/")
}

function normalizeNotebookPath(path: string) {
  return path.replaceAll("\\", "/").replace(/^\.\/+|\/+$/g, "")
}

function basename(path: string) {
  return path.split(/[\\/]/).pop() ?? path
}

function relativeKnowledgePath(root: string, target: string) {
  const normalizedRoot = root.replaceAll("\\", "/").replace(/\/+$/, "")
  const normalizedTarget = target.replaceAll("\\", "/").replace(/\/+$/, "")
  const prefix = `${normalizedRoot}/`
  if (!normalizedTarget.toLowerCase().startsWith(prefix.toLowerCase())) return
  const relative = normalizedTarget.slice(prefix.length)
  if (!relative || relative.split("/").some((part) => !part || part === "." || part === "..")) return
  return relative
}

function absolutePath(directory: string, path: string) {
  const separator = directory.includes("\\") ? "\\" : "/"
  return `${directory.replace(/[\\/]+$/, "")}${separator}${path.replaceAll(/[\\/]/g, separator)}`
}

function formatDate(value: number) {
  return new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric" }).format(value)
}

function fileBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener("load", () => {
      const value = String(reader.result)
      const separator = value.indexOf(",")
      if (separator === -1) return reject(new Error(`无法编码 ${file.name}`))
      resolve(value.slice(separator + 1))
    })
    reader.addEventListener("error", () => reject(reader.error ?? new Error(`无法读取 ${file.name}`)))
    reader.readAsDataURL(file)
  })
}

function uniqueRawSourcePath(name: string, used: Set<string>, suffix = 1): string {
  const safe = name.replace(/[\\/\u0000-\u001f]/g, "_").trim() || "file"
  const extension = safe.lastIndexOf(".") > 0 ? safe.slice(safe.lastIndexOf(".")) : ""
  const stem = extension ? safe.slice(0, -extension.length) : safe
  const candidate = `01_Raw_Sources/${stem}${suffix === 1 ? "" : ` (${suffix})`}${extension}`
  if (used.has(candidate)) return uniqueRawSourcePath(name, used, suffix + 1)
  used.add(candidate)
  return candidate
}

function knowledgeSystemPrompt(notebook: KnowledgeNotebook) {
  return `你正在 DeepInsight 知识库笔记本“${notebook.name}”中工作。当前工作目录就是该笔记本目录：${notebook.directory}。知识库维护必须使用内置的 llm-wiki skill，并遵循它的 Ingest、Ask、Craft 和 Q&A Archive 模式。回答知识问题前先读取 index.md，再沿 [[双链]] 检索 02_LLM_Wiki 中的原子知识页；明确区分库内事实、综合推断与外部补充，引用结论时给出相对文件路径。除非用户明确要求，不要访问当前笔记本之外的文件。`
}

function stagingSystemPrompt(notebook: KnowledgeNotebook) {
  return `你正在执行知识库“${notebook.name}”的原始资料落盘阶段，目标目录是 ${notebook.directory}。本阶段只做文件复制和完整性核对：不得调用 llm-wiki，不得总结、拆分或改写内容，不得创建 02_LLM_Wiki、index.md 或 log.md。只有在本批文件全部写入 01_Raw_Sources 后才能回复完成。`
}

function stageDirectoriesPrompt(notebook: KnowledgeNotebook, paths: string[]) {
  return `把以下目录中的全部原始文件递归复制到 ${notebook.directory}/01_Raw_Sources/，保留每个来源目录的相对层级：\n${paths.map((path) => `- ${path}`).join("\n")}\n\n忽略 .git、node_modules、构建产物和系统缓存；不要忽略普通 PDF、Office、Markdown、文本、图片或数据文件。同名文件不得覆盖。复制完成后统计实际文件数并核对目标目录。本阶段只负责完整落盘，禁止调用 llm-wiki，禁止创建知识页。`
}

function batchImportPrompt(notebook: KnowledgeNotebook, paths: string[], batch: number, totalBatches: number) {
  return `使用 llm-wiki skill 的 Ingest 模式处理第 ${batch}/${totalBatches} 批已经落盘的原始资料。只处理以下路径：\n${paths.map((path) => `- ${path}`).join("\n")}\n\n笔记本目录：${notebook.directory}\n\n要求：在 02_LLM_Wiki 创建或更新原子知识页；每页包含 tags、aliases、type、source、created，文末包含“## 语义连接”和有效 [[双链]]。本批结束时更新 index.md 和 log.md，并汇报处理成功、跳过和失败数量。不要重新复制原始文件，不要处理清单之外的文件。`
}

function validateImportPrompt(count: number) {
  return `使用 llm-wiki skill 对刚完成的 ${count} 个原始文件执行最终校验：重建 index.md 的全量覆盖，检查 02_LLM_Wiki 中 YAML 必填字段、重复 aliases、失效 [[双链]]、缺失“## 语义连接”的页面，并修复可确定的问题；最后向 log.md 追加 validation 记录。不要重新执行原始文件导入。`
}

function chunk<T>(items: T[], size: number) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  )
}

function formatImportTime(value: Date) {
  return `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`
}

function sessionUpdatedAt(session: Session) {
  return session.time.updated ?? session.time.created
}

function knowledgeSessionLabel(session: Session, notebookName: string) {
  const prefix = `知识库 · ${notebookName}`
  if (session.title === prefix) return "知识库对话"
  if (session.title.startsWith(`${prefix} · `)) return session.title.slice(prefix.length + 3)
  return session.title || "未命名对话"
}

function knowledgeSessionTime(session: Session) {
  const value = new Date(sessionUpdatedAt(session))
  const today = new Date()
  if (value.toDateString() === today.toDateString()) return formatImportTime(value)
  return `${value.getMonth() + 1}/${value.getDate()}`
}

function graphColor(node: KnowledgeGraphNode) {
  if (node.degree >= 10) return "#c8892d"
  if (node.degree >= 5) return "#557ac2"
  if (node.degree >= 2) return "#3a8f75"
  return "#7d8da0"
}
