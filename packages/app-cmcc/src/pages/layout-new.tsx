import type { Session } from "@opencode-ai/sdk/v2/client"
import { ContextMenu } from "@opencode-ai/ui/context-menu"
import { DropdownMenu } from "@opencode-ai/ui/dropdown-menu"
import { Icon } from "@opencode-ai/ui/icon"
import { createEffect, createMemo, For, onCleanup, Show, Suspense, untrack, type ParentProps } from "solid-js"
import { createStore } from "solid-js/store"
import { useLocation, useNavigate } from "@solidjs/router"
import { DebugBar } from "@/components/debug-bar"
import { HelpButton } from "@/components/help-button"
import { notifySessionTabsRemoved } from "@/components/titlebar-session-events"
import { useDirectoryPicker } from "@/components/directory-picker"
import { useSettingsCommand } from "@/components/settings-dialog"
import { useLayout } from "@/context/layout"
import { usePlatform } from "@/context/platform"
import { useServer } from "@/context/server"
import { useServerSDK } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"
import { useTabs } from "@/context/tabs"
import { setNavigate } from "@/utils/notification-click"
import { sessionHref } from "@/utils/session-route"
import { sessionTitle } from "@/utils/session-title"
import { showToast, setV2Toast, ToastRegion } from "@/utils/toast"
import { DeepInsightBrand } from "@/components/brand"
import {
  CMCC_CONVERSATION_WORKSPACES_EVENT,
  cmccConversationDirectories,
  cmccConversationWorkspaces,
  cmccCreateConversationWorkspace,
  cmccDefaultWorkspace,
  cmccForgetConversationWorkspace,
  cmccIsWorkspaceDirectory,
  cmccWorkspaceRoot,
  cmccWorkspaceSessionPath,
} from "@/utils/cmcc-workspace"
import { cmccIsKnowledgeSession, cmccKnowledgeNotebookForSession, cmccKnowledgeNotebooks } from "@/utils/cmcc-knowledge"
import { displayName, sortedRootSessions } from "./layout/helpers"

const SIDEBAR_MIN_WIDTH = 280
const SIDEBAR_MAX_WIDTH = 420
const SIDEBAR_MAIN_MIN_WIDTH = 560
const SIDEBAR_HIDE_THRESHOLD = 88
const SIDEBAR_RESTORE_THRESHOLD = 140
const CMCC_SIDEBAR_INITIALIZED_KEY = "opencode.cmcc.sidebar.initialized"

function sessionUpdatedAt(session: Session) {
  return session.time.updated ?? session.time.created
}

export default function NewLayout(props: ParentProps) {
  const navigate = useNavigate()
  const layout = useLayout()
  setNavigate(navigate)

  createEffect(() => setV2Toast(true))
  createEffect(() => {
    if (!layout.ready()) return
    if (typeof localStorage === "undefined") return
    if (localStorage.getItem(CMCC_SIDEBAR_INITIALIZED_KEY)) return
    layout.sidebar.open()
    localStorage.setItem(CMCC_SIDEBAR_INITIALIZED_KEY, "true")
  })

  return (
    <div
      class="relative bg-v2-background-bg-deep flex-1 min-h-0 min-w-0 flex flex-col select-none [&_input]:select-text [&_textarea]:select-text [&_[contenteditable]]:select-text"
      style={{
        "padding-top": "env(safe-area-inset-top, 0px)",
        "padding-bottom": "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <CmccTopControls />
      <main class="flex-1 min-h-0 min-w-0 overflow-hidden flex items-stretch contain-strict">
        <CmccSidebar />
        <section class="relative min-h-0 min-w-0 flex flex-1 flex-col overflow-hidden bg-white">
          <svg
            aria-hidden="true"
            class="pointer-events-none absolute inset-0 size-full"
            viewBox="0 0 1160 900"
            fill="none"
            preserveAspectRatio="none"
          >
            <rect width="1160" height="900" fill="white" />
            <g opacity="0.1" filter="url(#cmcc-content-yellow-glow)">
              <ellipse cx="982.5" cy="174" rx="180.5" ry="180" fill="#fdffa3" />
            </g>
            <g opacity="0.2" filter="url(#cmcc-content-blue-glow)">
              <circle cx="1002.27" cy="745.205" r="197.838" fill="#a3d4ff" />
            </g>
            <g opacity="0.1" filter="url(#cmcc-content-pink-glow)">
              <circle cx="166.187" cy="204.128" r="198.043" fill="#e689dd" />
            </g>
            <defs>
              <filter id="cmcc-content-yellow-glow" x="502" y="-306" width="961" height="960" filterUnits="userSpaceOnUse">
                <feGaussianBlur stdDeviation="150" />
              </filter>
              <filter id="cmcc-content-blue-glow" x="504.43" y="247.367" width="995.675" height="995.676" filterUnits="userSpaceOnUse">
                <feGaussianBlur stdDeviation="150" />
              </filter>
              <filter id="cmcc-content-pink-glow" x="-411.856" y="-373.914" width="1156.09" height="1156.09" filterUnits="userSpaceOnUse">
                <feGaussianBlur stdDeviation="190" />
              </filter>
            </defs>
          </svg>
          <div class="relative flex min-h-0 min-w-0 flex-1 flex-col">
            <Suspense>{props.children}</Suspense>
          </div>
        </section>
      </main>
      {import.meta.env.DEV && <DebugBar inline />}
      <HelpButton />
      <ToastRegion v2 />
    </div>
  )
}

function CmccTopControls() {
  const navigate = useNavigate()
  const layout = useLayout()
  const location = useLocation()
  const server = useServer()
  const serverSDK = useServerSDK()
  const sync = useServerSync()
  const tabs = useTabs()
  const home = createMemo(() => sync().data.path.home)
  const activeSessionPath = createMemo(() => (location.pathname.includes("/session/") ? location.pathname : undefined))
  const [history, setHistory] = createStore({
    stack: [] as string[],
    index: -1,
  })
  const canBack = createMemo(() => history.index > 0)
  const canForward = createMemo(() => history.index >= 0 && history.index < history.stack.length - 1)

  createEffect(() => {
    const path = activeSessionPath()
    if (!path) return

    const snapshot = untrack(() => ({
      index: history.index,
      stack: history.stack.slice(),
    }))
    if (snapshot.stack[snapshot.index] === path) return

    const base = snapshot.index >= 0 ? snapshot.stack.slice(0, snapshot.index + 1) : []
    setHistory({
      stack: [...base, path],
      index: base.length,
    })
  })

  const toggleSidebar = () => {
    if (layout.sidebar.opened()) {
      layout.sidebar.close()
      return
    }
    layout.sidebar.open()
  }

  const openNewSession = async () => {
    const dir = await cmccCreateConversationWorkspace(home(), (directory) =>
      serverSDK().client.file.createDirectory({ path: directory }, { throwOnError: true }),
    ).catch((error) => {
      showToast({
        title: "无法创建对话目录",
        description: error instanceof Error ? error.message : String(error),
        variant: "error",
      })
      return undefined
    })
    if (!dir || !tabs.ready()) return
    server.projects.touch(dir)
    void sync().project.loadSessions(dir, { limit: 64 })
    tabs.newDraft({ server: server.key, directory: dir })
  }

  const switchSession = (direction: "back" | "forward") => {
    const snapshot = {
      index: history.index,
      stack: history.stack.slice(),
    }
    const index = snapshot.index + (direction === "back" ? -1 : 1)
    const next = snapshot.stack[index]
    if (!next) return
    setHistory("index", index)
    navigate(next)
  }

  return (
    <div class="pointer-events-auto absolute left-3 top-2 z-50 flex h-8 items-center gap-1">
      <CmccTopControlButton
        icon={layout.sidebar.opened() ? "layout-left-full" : "layout-left"}
        label={layout.sidebar.opened() ? "隐藏左栏" : "展开左栏"}
        pressed={layout.sidebar.opened()}
        onClick={toggleSidebar}
      />
      <CmccTopControlButton
        icon="arrow-left"
        label="后退"
        disabled={!canBack()}
        onClick={() => switchSession("back")}
      />
      <CmccTopControlButton
        icon="arrow-right"
        label="前进"
        disabled={!canForward()}
        onClick={() => switchSession("forward")}
      />
      <Show when={!layout.sidebar.opened()}>
        <CmccTopControlButton icon="new-session" label="新建会话" onClick={() => void openNewSession()} />
      </Show>
    </div>
  )
}

function CmccSidebar() {
  const layout = useLayout()
  const location = useLocation()
  const navigate = useNavigate()
  const platform = usePlatform()
  const server = useServer()
  const serverSDK = useServerSDK()
  const sync = useServerSync()
  const tabs = useTabs()
  const pickDirectory = useDirectoryPicker()
  const openSettings = useSettingsCommand()
  const home = createMemo(() => sync().data.path.home)
  const knowledgeNotebooks = createMemo(() => {
    location.pathname
    return cmccKnowledgeNotebooks()
  })
  const [drag, setDrag] = createStore({
    active: false,
    startX: 0,
    startWidth: 0,
  })
  const [conversationStore, setConversationStore] = createStore({
    directories: cmccConversationWorkspaces(),
    sessions: [] as Session[],
  })

  if (typeof window !== "undefined") {
    const refresh = () => setConversationStore("directories", cmccConversationWorkspaces())
    window.addEventListener(CMCC_CONVERSATION_WORKSPACES_EVENT, refresh)
    onCleanup(() => window.removeEventListener(CMCC_CONVERSATION_WORKSPACES_EVENT, refresh))
  }

  const projects = createMemo(() =>
    layout.projects.list().filter((project) => !cmccIsWorkspaceDirectory(project.worktree, home())),
  )
  const conversationDirectories = createMemo(() =>
    cmccConversationDirectories(home(), conversationStore.directories, conversationStore.sessions),
  )
  const conversations = createMemo(() => {
    return conversationDirectories()
      .flatMap((directory) =>
        sortedRootSessions(sync().child(directory, { bootstrap: false })[0], Date.now()).map((session) => ({
          directory,
          session,
        })),
      )
      .filter((record) => !cmccIsKnowledgeSession(knowledgeNotebooks(), record.session))
      .sort((a, b) => sessionUpdatedAt(b.session) - sessionUpdatedAt(a.session))
      .slice(0, 64)
  })

  const loadConversationDirectory = async (directory: string, remembered: Set<string>) => {
    if (remembered.has(directory)) {
      await serverSDK().client.file.createDirectory({ path: directory }, { throwOnError: true })
    }
    await sync().project.loadSessions(directory, { limit: 64 })
  }

  createEffect(() => {
    const directory = cmccWorkspaceRoot(home())
    const path = cmccWorkspaceSessionPath(home())
    if (!directory || !path) return
    void serverSDK()
      .client.session.list(
        { directory, scope: "project", path, roots: true, limit: 200 },
        { throwOnError: true },
      )
      .then((result) => setConversationStore("sessions", result.data ?? []))
      .catch(() => setConversationStore("sessions", []))
  })

  createEffect(() => {
    const remembered = new Set(conversationStore.directories)
    for (const directory of conversationDirectories()) {
      void loadConversationDirectory(directory, remembered).catch(() => {
        if (remembered.has(directory)) cmccForgetConversationWorkspace(directory)
      })
    }
  })

  createEffect(() => {
    for (const project of projects()) void sync().project.loadSessions(project.worktree, { limit: 8 })
  })
  const sidebarMaxWidth = createMemo(() => {
    if (typeof window === "undefined") return SIDEBAR_MAX_WIDTH
    return Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, window.innerWidth - SIDEBAR_MAIN_MIN_WIDTH))
  })
  const width = createMemo(() => {
    if (!layout.sidebar.opened()) return 0
    return Math.min(sidebarMaxWidth(), Math.max(SIDEBAR_MIN_WIDTH, layout.sidebar.width()))
  })
  const visible = createMemo(() => layout.sidebar.opened() || drag.active)

  let previousUserSelect = ""
  let previousCursor = ""

  const stopDrag = () => {
    if (!drag.active) return
    setDrag("active", false)
    document.body.style.userSelect = previousUserSelect
    document.body.style.cursor = previousCursor
    window.removeEventListener("pointermove", moveDrag)
    window.removeEventListener("pointerup", stopDrag)
    window.removeEventListener("pointercancel", stopDrag)
  }

  const moveDrag = (event: PointerEvent) => {
    const raw = drag.startWidth + event.clientX - drag.startX
    if (raw <= SIDEBAR_HIDE_THRESHOLD) {
      layout.sidebar.close()
      return
    }
    if (!layout.sidebar.opened() && raw < SIDEBAR_RESTORE_THRESHOLD) return
    if (!layout.sidebar.opened()) layout.sidebar.open()
    layout.sidebar.resize(Math.min(sidebarMaxWidth(), Math.max(SIDEBAR_MIN_WIDTH, raw)))
  }

  const startDrag = (event: PointerEvent) => {
    event.preventDefault()
    previousUserSelect = document.body.style.userSelect
    previousCursor = document.body.style.cursor
    document.body.style.userSelect = "none"
    document.body.style.cursor = "col-resize"
    setDrag({
      active: true,
      startX: event.clientX,
      startWidth: layout.sidebar.opened() ? width() : 0,
    })
    window.addEventListener("pointermove", moveDrag)
    window.addEventListener("pointerup", stopDrag)
    window.addEventListener("pointercancel", stopDrag)
  }

  onCleanup(stopDrag)

  const openNewSession = async () => {
    const dir = await cmccCreateConversationWorkspace(home(), (directory) =>
      serverSDK().client.file.createDirectory({ path: directory }, { throwOnError: true }),
    ).catch((error) => {
      showToast({
        title: "无法创建对话目录",
        description: error instanceof Error ? error.message : String(error),
        variant: "error",
      })
      return undefined
    })
    if (!dir || !tabs.ready()) return
    server.projects.touch(dir)
    void sync().project.loadSessions(dir, { limit: 64 })
    tabs.newDraft({ server: server.key, directory: dir })
  }

  const openPendingProduct = (name: string) => {
    showToast({
      title: `${name} 待接入`,
      description: "当前版本还没有配置对应的应用地址。",
    })
  }

  const openProject = (directory: string) => {
    server.projects.open(directory)
    layout.projects.open(directory)
    layout.projects.expand(directory)
    server.projects.touch(directory)
    void sync().project.loadSessions(directory, { limit: 8 })
  }

  const openProjectNewSession = (directory: string) => {
    openProject(directory)
    if (!tabs.ready()) return
    tabs.newDraft({ server: server.key, directory })
  }

  const closeProject = (directory: string) => {
    layout.projects.close(directory)
    server.projects.close(directory)
  }

  const addProject = () => {
    const conn = server.current
    if (!conn) return
    pickDirectory({
      server: conn,
      title: "打开项目",
      multiple: true,
      onSelect: (result) => {
        const directories = Array.isArray(result) ? result : result ? [result] : []
        for (const directory of directories) openProject(directory)
      },
    })
  }

  const openConversationDirectory = async (directory: string) => {
    if (platform.platform !== "desktop" || !platform.openPath) return
    await Promise.resolve(platform.createDirectory?.(directory)).catch(() => undefined)
    await platform.openPath(directory).catch(() => undefined)
  }

  const openSession = (session: Session) => {
    const notebook = cmccKnowledgeNotebookForSession(knowledgeNotebooks(), session)
    if (notebook) {
      navigate(`/knowledge/${notebook.id}/session/${session.id}`)
      return
    }
    const tab = tabs.addSessionTab({ server: server.key, sessionId: session.id })
    tabs.select(tab)
  }

  const activeSession = (session: Session) => {
    const notebook = cmccKnowledgeNotebookForSession(knowledgeNotebooks(), session)
    if (notebook) return location.pathname === `/knowledge/${notebook.id}/session/${session.id}`
    return location.pathname === sessionHref(server.key, session.id) || location.pathname.endsWith(`/session/${session.id}`)
  }

  const removeSession = (session: Session) => {
    const [, setStore] = sync().child(session.directory, { bootstrap: false })
    setStore("session", (list) => list.filter((item) => item.id !== session.id))
    setStore("sessionTotal", (value) => Math.max(0, value - 1))
    sync().session.evict(session.id)
    notifySessionTabsRemoved({ server: server.key, directory: session.directory, sessionIDs: [session.id] })
    if (activeSession(session) && tabs.ready()) tabs.newDraft({ server: server.key, directory: session.directory })
  }

  const archiveSession = async (session: Session) => {
    await serverSDK()
      .client.session.update({ directory: session.directory, sessionID: session.id, time: { archived: Date.now() } })
      .then(() => removeSession(session))
      .catch((error) => {
        showToast({
          title: "归档失败",
          description: error instanceof Error ? error.message : String(error),
          variant: "error",
        })
      })
  }

  const deleteSession = async (session: Session) => {
    const name = sessionTitle(session.title) ?? "未命名对话"
    if (!window.confirm(`删除「${name}」？此操作不可恢复。`)) return

    await serverSDK()
      .client.session.delete({ sessionID: session.id })
      .then((result) => {
        if (!result.data) throw new Error("删除请求未成功")
        removeSession(session)
      })
      .catch((error) => {
        showToast({
          title: "删除失败",
          description: error instanceof Error ? error.message : String(error),
          variant: "error",
        })
      })
  }

  const timeLabel = (session: Session) => {
    const at = session.time.updated ?? session.time.created
    const minutes = Math.max(1, Math.floor((Date.now() - at) / 60_000))
    if (minutes < 60) return `${minutes} 分`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours} 时`
    return `${Math.floor(hours / 24)} 天`
  }

  return (
    <>
      <aside
        aria-label="CMCC conversations"
        aria-hidden={!visible()}
        inert={!visible()}
        class="h-full shrink-0 overflow-hidden border-r border-v2-border-border-base bg-[linear-gradient(180deg,#d9e9ff_0%,#eae6ff_100%)]"
        classList={{
          "transition-[width] duration-[220ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none":
            !drag.active,
          "pointer-events-none": !visible(),
        }}
        style={{ width: `${width()}px` }}
      >
        <div class="flex h-full min-w-0 flex-col overflow-hidden">
          <div class="shrink-0 px-4 pb-6 pt-5">
            <DeepInsightBrand />
          </div>
          <nav class="flex shrink-0 flex-col gap-1 px-3 pb-4">
            <CmccSidebarAction icon="new-session" label="新对话" onClick={() => void openNewSession()} />
            <CmccSidebarAction
              icon="glasses"
              label="深度研究"
              active={location.pathname === "/expert/chat"}
              onClick={() => navigate("/expert/chat")}
            />
            <CmccSidebarAction
              icon="mcp"
              label="产业洞察"
              active={
                location.pathname === "/expert" ||
                (location.pathname.startsWith("/expert/") &&
                  location.pathname !== "/expert/chat" &&
                  location.pathname !== "/expert/workspace")
              }
              onClick={() => navigate("/expert")}
            />
            <CmccSidebarAction
              icon="brain"
              label="AI Wiki"
              active={location.pathname === "/knowledge" || location.pathname.startsWith("/knowledge/")}
              onClick={() => navigate("/knowledge")}
            />
            <CmccSidebarAction
              icon="branch"
              label="DeepTrack 行业追踪"
              active={location.pathname === "/expert/workspace"}
              onClick={() => navigate("/expert/workspace")}
            />
            <CmccSidebarAction icon="review" label="DeepXiv 前沿论文" onClick={() => openPendingProduct("DeepXiv 前沿论文")} />
            <CmccSidebarAction icon="photo" label="DeepLens 拍照即懂" onClick={() => openPendingProduct("DeepLens 拍照即懂")} />
          </nav>
          <div class="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
            <CmccSidebarSection label="项目" actionLabel="添加项目" action={addProject} actionIcon="folder-add-left" />
            <For
              each={projects()}
              fallback={<div class="px-1 py-3 text-14-regular text-v2-text-text-faint">暂无项目</div>}
            >
              {(project) => {
                const expanded = createMemo(() => project.expanded)
                const sessions = createMemo(() =>
                  sortedRootSessions(sync().child(project.worktree, { bootstrap: false })[0], Date.now()).slice(0, 5),
                )

                return (
                  <div class="mb-1">
                    <div
                      class="group flex h-8 w-full min-w-0 items-center rounded-[6px] text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base data-[selected]:bg-v2-background-bg-layer-03 data-[selected]:text-v2-text-text-base"
                      data-selected={expanded() ? "" : undefined}
                    >
                      <button
                        type="button"
                        class="flex h-full min-w-0 flex-1 items-center gap-2 px-2 text-left text-14-medium"
                        aria-expanded={expanded()}
                        onClick={() => {
                          if (expanded()) {
                            layout.projects.collapse(project.worktree)
                            return
                          }
                          layout.projects.expand(project.worktree)
                        }}
                      >
                        <Icon
                          name="chevron-down"
                          class="size-3.5 shrink-0 transition-transform duration-150 ease-in-out"
                          style={{ transform: `rotate(${expanded() ? 0 : -90}deg)` }}
                        />
                        <Icon name="folder" class="size-4 shrink-0" />
                        <span class="min-w-0 flex-1 truncate">{displayName(project)}</span>
                      </button>
                      <div class="mr-1 flex shrink-0 items-center gap-0.5">
                        <DropdownMenu>
                          <DropdownMenu.Trigger
                            as="button"
                            type="button"
                            class="flex size-6 shrink-0 items-center justify-center rounded-[5px] text-v2-icon-icon-muted hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-icon-icon-base data-[expanded]:bg-v2-overlay-simple-overlay-hover data-[expanded]:text-v2-icon-icon-base"
                            title="更多"
                            aria-label="更多"
                          >
                            <Icon name="dot-grid" class="size-3.5" />
                          </DropdownMenu.Trigger>
                          <DropdownMenu.Portal>
                            <DropdownMenu.Content class="mt-1">
                              <DropdownMenu.Item onSelect={() => closeProject(project.worktree)}>
                                <DropdownMenu.ItemLabel>关闭</DropdownMenu.ItemLabel>
                              </DropdownMenu.Item>
                            </DropdownMenu.Content>
                          </DropdownMenu.Portal>
                        </DropdownMenu>
                        <button
                          type="button"
                          class="flex size-6 shrink-0 items-center justify-center rounded-[5px] text-v2-icon-icon-muted hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-icon-icon-base"
                          title="新建任务"
                          aria-label="新建任务"
                          onClick={() => openProjectNewSession(project.worktree)}
                        >
                          <Icon name="edit" class="size-3.5" />
                        </button>
                      </div>
                    </div>
                    <Show when={expanded()}>
                      <div class="ml-6 mt-1 flex min-w-0 flex-col gap-1">
                        <For
                          each={sessions()}
                          fallback={
                            <button
                              type="button"
                              class="flex h-8 w-full min-w-0 items-center gap-2 rounded-[6px] px-2 text-left text-14-regular text-v2-text-text-faint hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base"
                              onClick={() => openProjectNewSession(project.worktree)}
                            >
                              <Icon name="new-session" class="size-4 shrink-0" />
                              <span class="min-w-0 truncate">新建任务</span>
                            </button>
                          }
                        >
                          {(session) => (
                            <CmccSessionRow
                              session={session}
                              active={activeSession(session)}
                              timeLabel={timeLabel(session)}
                              openSession={openSession}
                              archiveSession={archiveSession}
                              deleteSession={deleteSession}
                            />
                          )}
                        </For>
                      </div>
                    </Show>
                  </div>
                )
              }}
            </For>
            <CmccSidebarSection
              label="对话"
              actionLabel="新对话"
              action={() => void openNewSession()}
              actionIcon="new-session"
            />
            <For
              each={conversations()}
              fallback={<div class="px-1 py-3 text-14-regular text-v2-text-text-faint">暂无对话</div>}
            >
              {(record) => (
                <CmccSessionRow
                  session={record.session}
                  active={activeSession(record.session)}
                  timeLabel={timeLabel(record.session)}
                  openSession={openSession}
                  archiveSession={archiveSession}
                  deleteSession={deleteSession}
                  openDirectory={
                    platform.platform === "desktop" && platform.openPath
                      ? () => void openConversationDirectory(record.directory)
                      : undefined
                  }
                />
              )}
            </For>
          </div>
          <div class="shrink-0 border-t border-v2-border-border-base p-3">
            <button
              type="button"
              class="flex h-8 w-full min-w-0 items-center gap-2 rounded-[6px] px-2 text-left text-14-medium text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base"
              onClick={openSettings}
            >
              <Icon name="settings-gear" class="size-4 shrink-0" />
              <span class="min-w-0 truncate">设置</span>
            </button>
            <button
              type="button"
              class="mt-1 flex h-8 w-full min-w-0 items-center gap-2 rounded-[6px] px-2 text-left text-14-medium text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base"
              onClick={() => platform.openLink("https://opencode.ai/desktop-feedback")}
            >
              <Icon name="help" class="size-4 shrink-0" />
              <span class="min-w-0 truncate">帮助</span>
            </button>
          </div>
        </div>
      </aside>
      <div
        role="separator"
        aria-orientation="vertical"
        class="relative z-20 h-full w-1 shrink-0 cursor-col-resize bg-transparent before:absolute before:inset-y-0 before:left-1/2 before:w-px before:-translate-x-1/2 before:bg-v2-border-border-base hover:before:bg-v2-border-border-strong"
        onPointerDown={startDrag}
      />
    </>
  )
}

function CmccTopControlButton(props: {
  icon: Parameters<typeof Icon>[0]["name"]
  label: string
  pressed?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      class="flex size-8 shrink-0 items-center justify-center rounded-[6px] text-v2-icon-icon-muted transition-[background-color,color] duration-150 hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-icon-icon-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v2-border-border-active disabled:pointer-events-none disabled:opacity-35 data-[pressed]:bg-v2-overlay-simple-overlay-hover data-[pressed]:text-v2-icon-icon-base"
      data-pressed={props.pressed ? "" : undefined}
      title={props.label}
      aria-label={props.label}
      aria-pressed={props.pressed}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      <Icon name={props.icon} class="size-4" />
    </button>
  )
}

function CmccSidebarAction(props: {
  icon: Parameters<typeof Icon>[0]["name"]
  label: string
  active?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      class="flex h-8 w-full min-w-0 items-center gap-2 rounded-[6px] px-2 text-left text-14-medium text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base disabled:opacity-50 data-[selected]:bg-v2-background-bg-layer-03 data-[selected]:text-v2-text-text-base"
      onClick={props.onClick}
      disabled={!props.onClick}
      data-selected={props.active ? "" : undefined}
    >
      <Icon name={props.icon} class="size-4 shrink-0" />
      <span class="min-w-0 truncate">{props.label}</span>
    </button>
  )
}

function CmccSidebarSection(props: {
  label: string
  actionLabel?: string
  actionIcon?: Parameters<typeof Icon>[0]["name"]
  action?: () => void
}) {
  return (
    <div class="mb-2 mt-4 flex h-6 items-center gap-2 px-1 text-14-medium text-v2-text-text-faint first:mt-0">
      <span class="min-w-0 flex-1 truncate">{props.label}</span>
      <Show when={props.action && props.actionIcon && props.actionLabel}>
        <button
          type="button"
          class="flex size-6 shrink-0 items-center justify-center rounded-[5px] text-v2-icon-icon-muted hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-icon-icon-base"
          title={props.actionLabel}
          aria-label={props.actionLabel}
          onClick={() => props.action?.()}
        >
          <Icon name={props.actionIcon!} class="size-3.5" />
        </button>
      </Show>
    </div>
  )
}

function CmccSessionRow(props: {
  session: Session
  active: boolean
  timeLabel: string
  openSession: (session: Session) => void
  archiveSession: (session: Session) => void
  deleteSession: (session: Session) => void
  openDirectory?: () => void
}) {
  const menuItems = () => (
    <>
      <Show when={props.openDirectory}>
        {(openDirectory) => (
          <DropdownMenu.Item onSelect={openDirectory()}>
            <DropdownMenu.ItemLabel>打开对话目录</DropdownMenu.ItemLabel>
          </DropdownMenu.Item>
        )}
      </Show>
      <DropdownMenu.Item onSelect={() => props.archiveSession(props.session)}>
        <DropdownMenu.ItemLabel>归档</DropdownMenu.ItemLabel>
      </DropdownMenu.Item>
      <DropdownMenu.Item onSelect={() => props.deleteSession(props.session)}>
        <DropdownMenu.ItemLabel>删除</DropdownMenu.ItemLabel>
      </DropdownMenu.Item>
    </>
  )

  const contextMenuItems = () => (
    <>
      <Show when={props.openDirectory}>
        {(openDirectory) => (
          <ContextMenu.Item onSelect={openDirectory()}>
            <ContextMenu.ItemLabel>打开对话目录</ContextMenu.ItemLabel>
          </ContextMenu.Item>
        )}
      </Show>
      <ContextMenu.Item onSelect={() => props.archiveSession(props.session)}>
        <ContextMenu.ItemLabel>归档</ContextMenu.ItemLabel>
      </ContextMenu.Item>
      <ContextMenu.Item onSelect={() => props.deleteSession(props.session)}>
        <ContextMenu.ItemLabel>删除</ContextMenu.ItemLabel>
      </ContextMenu.Item>
    </>
  )

  const row = (
    <div
      class="group/session relative flex h-9 w-full min-w-0 items-center rounded-[6px] text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base data-[selected]:bg-v2-background-bg-layer-03 data-[selected]:text-v2-text-text-base"
      data-selected={props.active ? "" : undefined}
    >
      <button
        type="button"
        class="flex h-full w-full min-w-0 items-center gap-2 rounded-[6px] px-2 pr-9 text-left text-14-medium"
        onClick={() => props.openSession(props.session)}
      >
        <span class="min-w-0 flex-1 truncate">{sessionTitle(props.session.title) ?? "未命名对话"}</span>
        <span class="shrink-0 text-v2-text-text-faint">{props.timeLabel}</span>
      </button>
      <div class="absolute right-1 top-1/2 flex -translate-y-1/2 items-center opacity-0 transition-opacity group-hover/session:opacity-100 group-focus-within/session:opacity-100">
        <DropdownMenu>
          <DropdownMenu.Trigger
            as="button"
            type="button"
            class="flex size-6 shrink-0 items-center justify-center rounded-[5px] text-v2-icon-icon-muted hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-icon-icon-base data-[expanded]:bg-v2-overlay-simple-overlay-hover data-[expanded]:text-v2-icon-icon-base"
            title="更多"
            aria-label="更多"
          >
            <Icon name="dot-grid" class="size-3.5" />
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content class="mt-1">{menuItems()}</DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu>
      </div>
    </div>
  )

  return (
    <ContextMenu>
      <ContextMenu.Trigger as="div">{row}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content>{contextMenuItems()}</ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu>
  )
}
