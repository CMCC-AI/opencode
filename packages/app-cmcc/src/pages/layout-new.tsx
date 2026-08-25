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
import { useSettingsCommand } from "@/components/settings-dialog"
import { dockApiHistorySessions, useDockApi } from "@/context/dockapi"
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
import {
  cmccArtifactWorkspace,
  cmccEnsureWorkspace,
  cmccRememberConversationWorkspace,
} from "@/utils/cmcc-workspace"
import { cmccKnowledgeNotebookForSession, cmccKnowledgeNotebooks } from "@/utils/cmcc-knowledge"
import { CmccDeepXivFrame, isDeepXivPath } from "./cmcc-deepxiv"
import { CmccDeepLensFrame, isDeepLensPath } from "./cmcc-deeplens"
import jiutianSidebarLogo from "@/assets/home-v6/jiutian-sidebar-logo.png"

const SIDEBAR_MIN_WIDTH = 280
const SIDEBAR_MAX_WIDTH = 420
const SIDEBAR_MAIN_MIN_WIDTH = 560
const SIDEBAR_HIDE_THRESHOLD = 88
const SIDEBAR_RESTORE_THRESHOLD = 140
const SIDEBAR_SESSION_LIMIT = 64
const CMCC_SIDEBAR_INITIALIZED_KEY = "opencode.cmcc.sidebar.initialized"

function sessionUpdatedAt(session: Session) {
  return session.time.updated ?? session.time.created
}

export default function NewLayout(props: ParentProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const layout = useLayout()
  const [persistentViews, setPersistentViews] = createStore({
    deepXivMounted: isDeepXivPath(location.pathname),
    deepLensMounted: isDeepLensPath(location.pathname),
  })
  setNavigate(navigate)

  createEffect(() => setV2Toast(true))
  // Preserve the embedded app's in-memory state across APP-CMCC menu changes;
  // the same-site proxy restores its Cookie independently after a real reload.
  createEffect(() => {
    if (isDeepXivPath(location.pathname)) setPersistentViews("deepXivMounted", true)
  })
  createEffect(() => {
    if (isDeepLensPath(location.pathname)) setPersistentViews("deepLensMounted", true)
  })
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
              <filter
                id="cmcc-content-yellow-glow"
                x="502"
                y="-306"
                width="961"
                height="960"
                filterUnits="userSpaceOnUse"
              >
                <feGaussianBlur stdDeviation="150" />
              </filter>
              <filter
                id="cmcc-content-blue-glow"
                x="504.43"
                y="247.367"
                width="995.675"
                height="995.676"
                filterUnits="userSpaceOnUse"
              >
                <feGaussianBlur stdDeviation="150" />
              </filter>
              <filter
                id="cmcc-content-pink-glow"
                x="-411.856"
                y="-373.914"
                width="1156.09"
                height="1156.09"
                filterUnits="userSpaceOnUse"
              >
                <feGaussianBlur stdDeviation="190" />
              </filter>
            </defs>
          </svg>
          <div class="relative flex min-h-0 min-w-0 flex-1 flex-col">
            <Suspense>{props.children}</Suspense>
            <Show when={persistentViews.deepXivMounted}>
              <CmccDeepXivFrame active={isDeepXivPath(location.pathname)} />
            </Show>
            <Show when={persistentViews.deepLensMounted}>
              <CmccDeepLensFrame active={isDeepLensPath(location.pathname)} />
            </Show>
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
  const dockapi = useDockApi()
  const tabs = useTabs()
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

  const openNewSession = () => {
    const directory = dockapi.workspace?.directoryPath
    const artifactDirectory = cmccArtifactWorkspace(directory)
    if (!directory || !artifactDirectory || !tabs.ready()) return

    tabs.newDraft({ server: server.key, directory, artifactDirectory })
    cmccRememberConversationWorkspace(directory)
    server.projects.touch(directory)
    void cmccEnsureWorkspace(
      artifactDirectory,
      (path) => serverSDK().client.file.createDirectory({ path }, { throwOnError: true }),
      serverSDK().scope,
    ).catch((error) => {
      showToast({
        title: "无法准备会话产物目录",
        description: error instanceof Error ? error.message : String(error),
        variant: "error",
      })
    })
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
  const dockapi = useDockApi()
  const tabs = useTabs()
  const openSettings = useSettingsCommand()
  const knowledgeNotebooks = createMemo(() => {
    location.pathname
    return cmccKnowledgeNotebooks()
  })
  const [drag, setDrag] = createStore({
    active: false,
    startX: 0,
    startWidth: 0,
  })
  const directory = createMemo(() => dockapi.workspace?.directoryPath)
  const conversations = createMemo(() => {
    const current = directory()
    if (!current) return [] as Session[]
    return dockApiHistorySessions(current, dockapi.state.sessions)
      .map((session) => {
        const loaded = sync().session.data.info[session.id]
        return loaded ? { ...loaded, title: session.title, directory: current } : session
      })
      .sort((a, b) => sessionUpdatedAt(b) - sessionUpdatedAt(a))
  })

  createEffect(() => {
    const current = directory()
    if (!sync().data.ready) return
    if (!current) return
    server.projects.touch(current)
    void sync().project.loadSessions(current, { limit: SIDEBAR_SESSION_LIMIT })
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

  const openNewSession = () => {
    const current = directory()
    const artifactDirectory = cmccArtifactWorkspace(current)
    if (!current || !artifactDirectory || !tabs.ready()) return

    tabs.newDraft({ server: server.key, directory: current, artifactDirectory })
    cmccRememberConversationWorkspace(current)
    server.projects.touch(current)
    void cmccEnsureWorkspace(
      artifactDirectory,
      (path) => serverSDK().client.file.createDirectory({ path }, { throwOnError: true }),
      serverSDK().scope,
    ).catch((error) => {
      showToast({
        title: "无法准备会话产物目录",
        description: error instanceof Error ? error.message : String(error),
        variant: "error",
      })
    })
  }

  const openSession = (session: Session) => {
    sync().session.remember(session)
    server.projects.touch(session.directory)
    const tab = tabs.addSessionTab({ server: server.key, sessionId: session.id })
    tabs.select(tab)
  }

  const activeSession = (session: Session) => {
    const notebook = cmccKnowledgeNotebookForSession(knowledgeNotebooks(), session)
    if (notebook) return location.pathname === `/knowledge/${notebook.id}/session/${session.id}`
    return (
      location.pathname === sessionHref(server.key, session.id) || location.pathname.endsWith(`/session/${session.id}`)
    )
  }

  const removeSession = (session: Session) => {
    sync().session.set("info", session.id, undefined)
    sync().session.evict(session.id)
    notifySessionTabsRemoved({ server: server.key, directory: session.directory, sessionIDs: [session.id] })
    if (activeSession(session)) openNewSession()
  }

  const deleteSession = async (session: Session) => {
    const name = sessionTitle(session.title) ?? "未命名对话"
    if (!window.confirm(`删除「${name}」？删除后将从历史列表移除。`)) return

    await dockapi.sessions
      .remove(session.id)
      .then(() => {
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
        class="h-full shrink-0 overflow-hidden border-r border-[#c7d2fe] bg-[linear-gradient(180deg,#e0e7ff_0%,#ede9fe_50%,#f5f3ff_100%)] shadow-[4px_0_16px_rgba(49,46,129,0.08)]"
        classList={{
          "transition-[width] duration-[220ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none":
            !drag.active,
          "pointer-events-none": !visible(),
        }}
        style={{ width: `${width()}px` }}
      >
        <div class="flex h-full min-w-0 flex-col overflow-hidden">
          <div class="flex items-center gap-2.5 px-4 pb-4 pt-12">
            <img src={jiutianSidebarLogo} alt="深度洞察" class="h-10 w-auto max-w-[92px] shrink-0 object-contain" />
            <span class="text-[16px] font-semibold text-[#1a1a2e]">深度洞察</span>
          </div>
          <nav class="flex shrink-0 flex-col gap-1 px-3 pb-3">
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
            <CmccSidebarAction
              icon="review"
              label="DeepXiv 前沿论文"
              active={isDeepXivPath(location.pathname)}
              onClick={() => navigate("/deepxiv")}
            />
            <CmccSidebarAction
              icon="photo"
              label="DeepLens 拍照即懂"
              active={isDeepLensPath(location.pathname)}
              onClick={() => navigate("/deeplens")}
            />
          </nav>
          <div class="min-h-0 flex-1 overflow-y-auto px-3 pb-4 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#c7d2fe] [&::-webkit-scrollbar]:w-1">
            <CmccSidebarSection
              label="历史任务"
              actionLabel="新对话"
              action={() => void openNewSession()}
              actionIcon="new-session"
            />
            <For
              each={conversations()}
              fallback={<div class="px-2 py-5 text-center text-[13px] text-[#9294ad]">暂无历史任务</div>}
            >
              {(session) => (
                <CmccSessionRow
                  session={session}
                  active={activeSession(session)}
                  agentType={dockapi.sessions.findByOpenCodeId(session.id)?.agentType}
                  timeLabel={timeLabel(session)}
                  openSession={openSession}
                  deleteSession={deleteSession}
                />
              )}
            </For>
          </div>
          <div class="shrink-0 border-t border-[rgba(99,102,241,0.10)] px-3 py-3.5">
            <div class="mb-2 flex h-9 min-w-0 items-center gap-2 rounded-[8px] px-2 text-14-medium text-[#4a4a6a] hover:bg-[rgba(99,102,241,0.06)]">
              <span class="flex size-7 shrink-0 items-center justify-center rounded-full bg-blue-100 text-12-medium text-blue-700">
                {dockapi.user?.name.slice(0, 1) || "用"}
              </span>
              <span class="min-w-0 flex-1 truncate">{dockapi.user?.name}</span>
              <button
                type="button"
                class="shrink-0 text-12-regular text-[#7c7fbd] hover:text-[#4f46e5]"
                onClick={() => void dockapi.auth.logout()}
              >
                退出
              </button>
            </div>
            <button
              type="button"
              class="flex h-9 w-full min-w-0 items-center gap-2.5 rounded-[8px] px-3 text-left text-14-medium text-[#4a4a6a] hover:bg-[rgba(99,102,241,0.08)] hover:text-[#4f46e5]"
              onClick={openSettings}
            >
              <Icon name="settings-gear" class="size-4 shrink-0" />
              <span class="min-w-0 truncate">设置</span>
            </button>
            <button
              type="button"
              class="mt-1 flex h-9 w-full min-w-0 items-center gap-2.5 rounded-[8px] px-3 text-left text-14-medium text-[#4a4a6a] hover:bg-[rgba(99,102,241,0.08)] hover:text-[#4f46e5]"
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
        class="relative z-20 h-full w-1 shrink-0 cursor-col-resize bg-transparent before:absolute before:inset-y-0 before:left-1/2 before:w-px before:-translate-x-1/2 before:bg-transparent hover:before:bg-[#a5b4fc]"
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
      class="flex h-9 w-full min-w-0 items-center gap-2.5 rounded-[8px] px-3 text-left text-14-medium text-[#4a4a6a] transition-colors duration-150 hover:bg-[rgba(99,102,241,0.08)] hover:text-[#4f46e5] disabled:opacity-50 data-[selected]:bg-[rgba(99,102,241,0.12)] data-[selected]:font-medium data-[selected]:text-[#4f46e5]"
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
    <div class="mb-1.5 mt-4 flex h-7 items-center gap-2 px-1 text-[12px] font-medium text-[#7c7fbd] first:mt-0">
      <span class="min-w-0 flex-1 truncate">{props.label}</span>
      <Show when={props.action && props.actionIcon && props.actionLabel}>
        <button
          type="button"
          class="flex size-6 shrink-0 items-center justify-center rounded-[6px] text-[#8b8ec4] hover:bg-[rgba(99,102,241,0.10)] hover:text-[#4f46e5]"
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
  agentType?: string
  timeLabel: string
  openSession: (session: Session) => void
  deleteSession: (session: Session) => void
}) {
  const menuItems = () => (
    <DropdownMenu.Item onSelect={() => props.deleteSession(props.session)}>
      <DropdownMenu.ItemLabel>删除</DropdownMenu.ItemLabel>
    </DropdownMenu.Item>
  )

  const contextMenuItems = () => (
    <ContextMenu.Item onSelect={() => props.deleteSession(props.session)}>
      <ContextMenu.ItemLabel>删除</ContextMenu.ItemLabel>
    </ContextMenu.Item>
  )

  const row = (
    <div
      class="group/session relative mb-0.5 flex min-h-12 w-full min-w-0 items-center rounded-[6px] text-[#4a4a6a] transition-colors duration-150 hover:bg-[rgba(99,102,241,0.06)] data-[selected]:bg-[rgba(99,102,241,0.10)] data-[selected]:text-[#4f46e5]"
      data-selected={props.active ? "" : undefined}
    >
      <button
        type="button"
        class="flex min-h-12 w-full min-w-0 items-center rounded-[6px] px-2.5 py-1.5 pr-9 text-left"
        onClick={() => props.openSession(props.session)}
      >
        <span class="min-w-0 flex-1">
          <span class="flex min-w-0 items-center gap-1.5">
            <span class="min-w-0 flex-1 truncate text-[13px] font-medium">
              {sessionTitle(props.session.title) ?? "未命名对话"}
            </span>
            <Show when={props.agentType?.trim()}>
              <span
                class="max-w-[104px] shrink-0 truncate rounded-full bg-[rgba(96,165,250,0.14)] px-1.5 py-0.5 text-[11px] font-normal leading-[1.4] text-[#2563eb]"
                title={props.agentType}
              >
                {props.agentType}
              </span>
            </Show>
          </span>
          <span class="mt-0.5 block text-[11px] font-normal leading-none text-[#8b8daf]">{props.timeLabel}</span>
        </span>
      </button>
      <div class="absolute right-1 top-1/2 flex -translate-y-1/2 items-center opacity-0 transition-opacity group-hover/session:opacity-100 group-focus-within/session:opacity-100">
        <DropdownMenu>
          <DropdownMenu.Trigger
            as="button"
            type="button"
            class="flex size-6 shrink-0 items-center justify-center rounded-[5px] text-[#9294b5] hover:bg-[rgba(99,102,241,0.12)] hover:text-[#4f46e5] data-[expanded]:bg-[rgba(99,102,241,0.12)] data-[expanded]:text-[#4f46e5]"
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
