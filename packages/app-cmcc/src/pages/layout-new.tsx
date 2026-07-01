import type { Session } from "@opencode-ai/sdk/v2/client"
import { Icon } from "@opencode-ai/ui/icon"
import { createEffect, createMemo, For, onCleanup, Show, Suspense, untrack, type ParentProps } from "solid-js"
import { createStore } from "solid-js/store"
import { useLocation, useNavigate } from "@solidjs/router"
import { DebugBar } from "@/components/debug-bar"
import { HelpButton } from "@/components/help-button"
import { useSettingsCommand } from "@/components/settings-dialog"
import { useCommand } from "@/context/command"
import { useLayout } from "@/context/layout"
import { usePlatform } from "@/context/platform"
import { useServer } from "@/context/server"
import { useServerSync } from "@/context/server-sync"
import { useTabs } from "@/context/tabs"
import { setNavigate } from "@/utils/notification-click"
import { sessionHref } from "@/utils/session-route"
import { sessionTitle } from "@/utils/session-title"
import { setV2Toast, ToastRegion } from "@/utils/toast"
import { cmccDefaultWorkspace, cmccWorkspaceLabel } from "@/utils/cmcc-workspace"
import { sortedRootSessions } from "./layout/helpers"

const SIDEBAR_MIN_WIDTH = 220
const SIDEBAR_HIDE_THRESHOLD = 88
const SIDEBAR_RESTORE_THRESHOLD = 140
const CMCC_SIDEBAR_INITIALIZED_KEY = "opencode.cmcc.sidebar.initialized"

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
        <section class="min-w-0 min-h-0 flex-1 flex flex-col">
          <Suspense>{props.children}</Suspense>
        </section>
      </main>
      {import.meta.env.DEV && <DebugBar inline />}
      <HelpButton />
      <ToastRegion v2 />
    </div>
  )
}

function CmccTopControls() {
  const layout = useLayout()
  const location = useLocation()
  const server = useServer()
  const sync = useServerSync()
  const tabs = useTabs()
  const directory = createMemo(() => cmccDefaultWorkspace(sync().data.path.home))
  const activeSessionID = createMemo(() => location.pathname.match(/\/session\/([^/?#]+)/)?.[1])
  const [history, setHistory] = createStore({
    stack: [] as string[],
    index: -1,
  })
  const canBack = createMemo(() => history.index > 0)
  const canForward = createMemo(() => history.index >= 0 && history.index < history.stack.length - 1)

  createEffect(() => {
    const id = activeSessionID()
    if (!id) return

    const snapshot = untrack(() => ({
      index: history.index,
      stack: history.stack.slice(),
    }))
    if (snapshot.stack[snapshot.index] === id) return

    const base = snapshot.index >= 0 ? snapshot.stack.slice(0, snapshot.index + 1) : []
    setHistory({
      stack: [...base, id],
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
    const dir = directory()
    if (!dir || !tabs.ready()) return
    server.projects.open(dir)
    server.projects.touch(dir)
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
    const tab = tabs.addSessionTab({ server: server.key, sessionId: next })
    tabs.select(tab)
  }

  return (
    <div class="pointer-events-auto absolute left-3 top-2 z-50 flex h-8 items-center gap-1">
      <CmccTopControlButton
        icon={layout.sidebar.opened() ? "layout-left-full" : "layout-left"}
        label={layout.sidebar.opened() ? "隐藏左栏" : "展开左栏"}
        pressed={layout.sidebar.opened()}
        onClick={toggleSidebar}
      />
      <CmccTopControlButton icon="arrow-left" label="后退" disabled={!canBack()} onClick={() => switchSession("back")} />
      <CmccTopControlButton
        icon="arrow-right"
        label="前进"
        disabled={!canForward()}
        onClick={() => switchSession("forward")}
      />
      <Show when={!layout.sidebar.opened()}>
        <CmccTopControlButton icon="new-session" label="新建会话" onClick={openNewSession} />
      </Show>
    </div>
  )
}

function CmccSidebar() {
  const command = useCommand()
  const layout = useLayout()
  const location = useLocation()
  const navigate = useNavigate()
  const platform = usePlatform()
  const server = useServer()
  const sync = useServerSync()
  const tabs = useTabs()
  const openSettings = useSettingsCommand()
  const directory = createMemo(() => cmccDefaultWorkspace(sync().data.path.home))
  const [drag, setDrag] = createStore({
    active: false,
    startX: 0,
    startWidth: 0,
  })

  createEffect(() => {
    const dir = directory()
    if (!dir) return
    server.projects.open(dir)
    server.projects.touch(dir)
    void sync().project.loadSessions(dir)
  })

  const child = createMemo(() => {
    const dir = directory()
    if (!dir) return
    return sync().child(dir, { bootstrap: false })[0]
  })
  const sessions = createMemo(() => {
    const store = child()
    if (!store) return []
    return sortedRootSessions(store, Date.now()).slice(0, 64)
  })
  const width = createMemo(() => {
    if (!layout.sidebar.opened()) return 0
    return Math.max(SIDEBAR_MIN_WIDTH, layout.sidebar.width())
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
    layout.sidebar.resize(Math.max(SIDEBAR_MIN_WIDTH, raw))
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
    const dir = directory()
    if (!dir || !tabs.ready()) return
    tabs.newDraft({ server: server.key, directory: dir })
  }

  const openSession = (session: Session) => {
    const tab = tabs.addSessionTab({ server: server.key, sessionId: session.id })
    tabs.select(tab)
  }

  const activeSession = (session: Session) =>
    location.pathname === sessionHref(server.key, session.id) || location.pathname.endsWith(`/session/${session.id}`)

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
        class="h-full shrink-0 overflow-hidden border-r border-v2-border-border-base bg-v2-background-bg-layer-01"
        classList={{
          "transition-[width] duration-[220ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none":
            !drag.active,
          "pointer-events-none": !visible(),
        }}
        style={{ width: `${width()}px` }}
      >
        <div class="flex h-full min-w-0 flex-col overflow-hidden">
          <nav class="flex shrink-0 flex-col gap-1 px-3 pb-4 pt-12">
            <CmccSidebarAction icon="new-session" label="新对话" onClick={openNewSession} />
            <CmccSidebarAction icon="magnifying-glass" label="搜索" onClick={() => command.show()} />
            <CmccSidebarAction icon="task" label="已安排" />
            <CmccSidebarAction icon="mcp" label="插件" />
          </nav>
          <div class="px-3 pb-2 text-[12px] leading-4 text-v2-text-text-faint">通用任务</div>
          <div class="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
            <button
              type="button"
              class="mb-3 flex h-8 w-full min-w-0 items-center gap-2 rounded-[6px] px-2 text-left text-[13px] leading-4 text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base"
              onClick={() => {
                const dir = directory()
                if (dir) navigate("/")
              }}
            >
              <Icon name="folder" class="size-4 shrink-0" />
              <span class="min-w-0 truncate">{cmccWorkspaceLabel(directory(), sync().data.path.home)}</span>
            </button>
            <div class="mb-2 px-1 text-[12px] leading-4 text-v2-text-text-faint">对话</div>
            <For
              each={sessions()}
              fallback={
                <div class="px-1 py-3 text-[13px] leading-5 text-v2-text-text-faint">
                  还没有对话，点“新对话”开始。
                </div>
              }
            >
              {(session) => (
                <button
                  type="button"
                  class="group flex h-9 w-full min-w-0 items-center gap-2 rounded-[6px] px-2 text-left text-[13px] leading-4 text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base data-[selected]:bg-v2-background-bg-layer-03 data-[selected]:text-v2-text-text-base"
                  data-selected={activeSession(session) ? "" : undefined}
                  onClick={() => openSession(session)}
                >
                  <span class="min-w-0 flex-1 truncate">{sessionTitle(session.title) ?? "未命名对话"}</span>
                  <span class="shrink-0 text-v2-text-text-faint">{timeLabel(session)}</span>
                </button>
              )}
            </For>
          </div>
          <div class="shrink-0 border-t border-v2-border-border-base p-3">
            <button
              type="button"
              class="flex h-8 w-full min-w-0 items-center gap-2 rounded-[6px] px-2 text-left text-[13px] leading-4 text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base"
              onClick={openSettings}
            >
              <Icon name="settings-gear" class="size-4 shrink-0" />
              <span class="min-w-0 truncate">设置</span>
            </button>
            <button
              type="button"
              class="mt-1 flex h-8 w-full min-w-0 items-center gap-2 rounded-[6px] px-2 text-left text-[13px] leading-4 text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base"
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

function CmccSidebarAction(props: { icon: Parameters<typeof Icon>[0]["name"]; label: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      class="flex h-8 w-full min-w-0 items-center gap-2 rounded-[6px] px-2 text-left text-[14px] leading-4 text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base disabled:opacity-50"
      onClick={props.onClick}
      disabled={!props.onClick}
    >
      <Icon name={props.icon} class="size-4 shrink-0" />
      <span class="min-w-0 truncate">{props.label}</span>
    </button>
  )
}
