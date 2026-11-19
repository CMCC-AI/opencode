import type { Session } from "@opencode-ai/sdk/v2/client"
import { ContextMenu } from "@opencode-ai/ui/context-menu"
import { DropdownMenu } from "@opencode-ai/ui/dropdown-menu"
import { Icon } from "@opencode-ai/ui/icon"
import { createMediaQuery } from "@solid-primitives/media"
import { createEffect, createMemo, onCleanup, Show, Suspense, type ParentProps } from "solid-js"
import { createStore } from "solid-js/store"
import { useLocation, useNavigate } from "@solidjs/router"
import { DebugBar } from "@/components/debug-bar"
import sidebarIconsUrl from "@/assets/sidebar/menu-icons.svg?url"
import { useSettingsDialog } from "@/components/settings-dialog"
import { notifySessionTabsRemoved } from "@/components/titlebar-session-events"
import { CasePublishDialog } from "@/components/case-publish-dialog"
import { dockApiHistorySessions, useDockApi, type DockApiSession } from "@/context/dockapi"
import { useLayout } from "@/context/layout"
import { useServer } from "@/context/server"
import { useServerSDK } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"
import { useTabs, type DraftTab } from "@/context/tabs"
import { setNavigate } from "@/utils/notification-click"
import { sessionHref } from "@/utils/session-route"
import { sessionTitle } from "@/utils/session-title"
import { showToast, setV2Toast, ToastRegion } from "@/utils/toast"
import {
  cmccArtifactWorkspace,
  cmccEnsureWorkspace,
  cmccRememberConversationWorkspace,
} from "@/utils/cmcc-workspace"
import {
  cmccKnowledgeNotebookForSession,
  cmccKnowledgeNotebooks,
  cmccMainKnowledgeSession,
  cmccKnowledgeSessionReference,
} from "@/utils/cmcc-knowledge"
import {
  CMCC_CASES_UPDATED_EVENT,
  cmccCaseCategoryByAgentType,
  cmccCasePublishingAllowed,
} from "@/utils/cmcc-cases"
import { cmccHistoryProduct, type CmccHistoryProduct } from "@/utils/cmcc-history-product"
import { cmccHistoryTime } from "@/utils/cmcc-history-time"
import { CmccHistoryRow } from "@/components/cmcc-history-row"
import { mstockMention } from "@/pages/session/mstock/page-selection"
import { ResearchHistory } from "@/pages/general-deepinsight/history"
import { CmccDeepLensFrame, isDeepLensPath } from "./cmcc-deeplens"
import { CMCC_DEFAULT_RESEARCH_EXPERT, CMCC_TEAM_EXPERTS } from "@/utils/cmcc-experts"
import { NewSessionLoading } from "@/components/session/session-new-design-view"
import { createPageMotion } from "@/components/cmcc-motion"
import "@/components/cmcc-overlays.css"
import "./layout-new.css"

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
  const tabs = useTabs()
  const loadingDraft = () => tabs.store.find((tab): tab is DraftTab => tab.type === "draft" && tab.draftID === location.query.draftId)
  const loadingTeam = () => {
    if (location.pathname === "/app") return CMCC_DEFAULT_RESEARCH_EXPERT
    return CMCC_TEAM_EXPERTS.find((team) => team.id === loadingDraft()?.expertID)
  }
  let pageContent: HTMLDivElement | undefined
  createPageMotion(
    () => `${location.pathname}:${location.query.draftId ?? ""}`,
    () => pageContent,
    () => location.pathname !== "/app" && location.pathname !== "/new-session",
  )
  const [persistentViews, setPersistentViews] = createStore({
    deepLensMounted: isDeepLensPath(location.pathname),
  })
  setNavigate(navigate)

  createEffect(() => setV2Toast(true))
  // Preserve the embedded app's in-memory state across APP-CMCC menu changes;
  // the same-site proxy restores its Cookie independently after a real reload.
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
      class="cmcc-shell relative flex-1 min-h-0 min-w-0 flex flex-col select-none [&_input]:select-text [&_textarea]:select-text [&_[contenteditable]]:select-text"
      style={{
        "padding-top": "env(safe-area-inset-top, 0px)",
        "padding-bottom": "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <main class="flex-1 min-h-0 min-w-0 overflow-hidden flex items-stretch contain-strict">
        <CmccSidebar />
        <section class="relative min-h-0 min-w-0 flex flex-1 flex-col overflow-hidden bg-white">
          <div ref={pageContent} class="cmcc-page-content relative flex min-h-0 min-w-0 flex-1 flex-col">
            <Suspense
              fallback={
                <Show when={location.pathname === "/app" || location.pathname === "/new-session"}>
                  <NewSessionLoading team={loadingTeam()} teamPicker={loadingDraft()?.homeTeamPicker} />
                </Show>
              }
            >
              {props.children}
            </Suspense>
            <Show when={persistentViews.deepLensMounted}>
              <CmccDeepLensFrame active={isDeepLensPath(location.pathname)} />
            </Show>
          </div>
        </section>
      </main>
      {import.meta.env.DEV && <DebugBar inline />}
      <ToastRegion v2 />
    </div>
  )
}

function CmccSidebar() {
  const layout = useLayout()
  const desktop = createMediaQuery("(min-width: 768px)")
  const expanded = layout.sidebar.opened
  const rail = () => desktop() && !expanded()
  let brandToggle!: HTMLButtonElement
  let mobileOpener: HTMLButtonElement | undefined
  const location = useLocation()
  const navigate = useNavigate()
  const server = useServer()
  const serverSDK = useServerSDK()
  const sync = useServerSync()
  const dockapi = useDockApi()
  const tabs = useTabs()
  const openQuota = useSettingsDialog()
  const knowledgeNotebooks = createMemo(() => {
    location.pathname
    return cmccKnowledgeNotebooks()
  })
  const [drag, setDrag] = createStore({
    active: false,
    startX: 0,
    startWidth: 0,
  })
  const [caseDialog, setCaseDialog] = createStore({ session: undefined as DockApiSession | undefined })
  const directory = createMemo(() => dockapi.workspace?.directoryPath)
  const conversations = createMemo(() => {
    const current = directory()
    if (!current) return [] as Session[]
    const history = dockApiHistorySessions(current, dockapi.state.sessions)
      .map((session) => {
        const loaded = sync().session.data.info[session.id]
        return loaded ? { ...loaded, title: session.title, directory: current } : session
      })
    const ids = new Set(history.map((session) => session.id))
    const knowledge = Object.values(sync().session.data.info)
      .filter((session): session is Session => !!session)
      .filter(cmccMainKnowledgeSession)
      .filter((session) => !session.parentID && !session.time.archived)
      .filter((session) => !ids.has(session.id))
    return [...history, ...knowledge]
      .sort((a, b) => sessionUpdatedAt(b) - sessionUpdatedAt(a))
      .slice(0, SIDEBAR_SESSION_LIMIT)
  })

  createEffect(() => {
    const current = directory()
    if (!sync().data.ready) return
    if (!current) return
    server.projects.touch(current)
    void sync().project.loadSessions(current, { limit: SIDEBAR_SESSION_LIMIT })
  })

  createEffect(() => {
    if (!sync().data.ready) return
    knowledgeNotebooks().forEach((notebook) => {
      void serverSDK()
        .client.session.list(
          { directory: notebook.directory, roots: true, limit: SIDEBAR_SESSION_LIMIT },
          { throwOnError: true },
        )
        .then((result) => result.data?.forEach((session) => sync().session.remember(session)))
        .catch(() => undefined)
    })
  })

  const sidebarMaxWidth = createMemo(() => {
    if (typeof window === "undefined") return SIDEBAR_MAX_WIDTH
    return Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, window.innerWidth - SIDEBAR_MAIN_MIN_WIDTH))
  })
  const expandedWidth = createMemo(() => Math.min(sidebarMaxWidth(), Math.max(SIDEBAR_MIN_WIDTH, layout.sidebar.width())))
  const width = () => expanded() ? expandedWidth() : rail() ? 64 : 0

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
      startWidth: width(),
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

    const expert = CMCC_DEFAULT_RESEARCH_EXPERT
    tabs.newDraft({
      server: server.key, directory: current, artifactDirectory, homeTeamPicker: true,
      expertID: expert.id, agent: expert.leadAgent, researchMode: "deep",
    })
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
    const notebook = cmccKnowledgeNotebookForSession(knowledgeNotebooks(), session)
    if (notebook && !cmccMainKnowledgeSession(session)) {
      navigate(`/knowledge/${notebook.id}/session/${session.id}`)
      return
    }
    const binding = dockapi.sessions.findByOpenCodeId(session.id)
    if (binding && !session.agent) {
      // DockAPI history placeholders omit agent metadata and must not satisfy session.resolve().
      sync().session.evict(session.id)
    } else {
      sync().session.remember(session)
    }
    server.projects.touch(session.directory)
    const tab = tabs.addSessionTab({ server: server.key, sessionId: session.id })
    tabs.select(tab)
  }

  const activeSession = (session: Session) => {
    const notebook = cmccKnowledgeNotebookForSession(knowledgeNotebooks(), session)
    if (notebook && !cmccMainKnowledgeSession(session))
      return location.pathname === `/knowledge/${notebook.id}/session/${session.id}`
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

  const publishCase = (session: Session) => {
    const binding = dockapi.sessions.findByOpenCodeId(session.id)
    if (!binding || !cmccCaseCategoryByAgentType(binding.agentType)) {
      showToast({ variant: "default", title: "当前会话暂不支持发布案例" })
      return
    }
    if (!cmccCasePublishingAllowed(dockapi.user?.casePublishAllowed, binding.agentType)) {
      showToast({ variant: "default", title: "当前账号无权添加案例库" })
      return
    }
    setCaseDialog("session", mstockMention(sync().session.data.message[session.id] ?? [], sync().session.data.part) ? { ...binding, agentType: "mstock" } : binding)
  }

  return (
    <>
      <Show when={!expanded() && !desktop()}>
        <button
          ref={mobileOpener}
          type="button"
          class="cmcc-sidebar-toggle absolute left-3 top-2 z-50"
          aria-label="展开左栏"
          title="展开左栏"
          aria-expanded={false}
          aria-controls="cmcc-business-sidebar"
          onClick={() => {
            layout.sidebar.open()
            brandToggle.focus()
          }}
        >
          <img src="/brand/logo.svg" alt="" class="size-6 object-contain" />
        </button>
      </Show>
      <aside
        id="cmcc-business-sidebar"
        aria-label="CMCC conversations"
        aria-hidden={!expanded() && !desktop()}
        inert={!expanded() && !desktop()}
        data-rail={rail() ? "" : undefined}
        class="cmcc-sidebar shrink-0 overflow-hidden"
        classList={{
          "transition-[width] duration-[220ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none":
            !drag.active,
        }}
        style={{ width: `${width()}px`, "--sidebar-expanded-width": `${expandedWidth()}px` }}
      >
        <div class="flex h-full min-w-0 flex-col overflow-hidden">
          <div class="cmcc-sidebar-brand flex shrink-0 items-center gap-2.5 px-4 py-4">
            <Show when={!rail()}>
              <img
                src="/brand/mobileai-horizontal.svg"
                alt="深度洞察"
                class="h-11 w-auto max-w-[101px] shrink-0 object-contain"
              />
              <span class="whitespace-nowrap text-[16px] font-semibold text-[#1a1a2e]">深度洞察</span>
            </Show>
            <button
              ref={brandToggle}
              type="button"
              class="cmcc-sidebar-toggle"
              aria-label={expanded() ? "隐藏左栏" : "展开左栏"}
              title={expanded() ? "隐藏左栏" : "展开左栏"}
              aria-expanded={expanded()}
              aria-controls="cmcc-business-sidebar"
              onClick={() => {
                layout.sidebar.toggle()
                if (!desktop() && !expanded()) mobileOpener?.focus()
              }}
            >
              <Show when={rail()} fallback={<Icon name="chevron-left" />}>
                <img src="/brand/logo.svg" alt="" class="size-7 object-contain" />
              </Show>
            </button>
          </div>
          <nav class="flex shrink-0 flex-col gap-1 px-3 pb-3">
            <CmccSidebarAction
              icon="new-chat"
              label="新对话"
              active={location.pathname === "/new-session" && !tabs.store.some((tab) => tab.type === "draft" && tab.researchMode && location.search.includes(tab.draftID))}
              onClick={() => void openNewSession()}
            />
            <CmccSidebarAction
              icon="research"
              label="深度研究"
              onClick={openNewSession}
              active={location.pathname.startsWith("/general-deepinsight") || tabs.store.some((tab) => tab.type === "draft" && tab.researchMode && location.search.includes(tab.draftID))}
            />
            <CmccSidebarAction
              icon="industry"
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
              icon="wiki"
              label="AI Wiki"
              active={location.pathname === "/knowledge" || location.pathname.startsWith("/knowledge/")}
              onClick={() => navigate("/knowledge")}
            />
            <CmccSidebarAction
              icon="track"
              label="DeepTrack 行业追踪"
              active={location.pathname === "/expert/workspace"}
              onClick={() => navigate("/expert/workspace")}
            />
            <CmccSidebarAction
              icon="lens"
              label="DeepLens 拍照即懂"
              active={isDeepLensPath(location.pathname)}
              onClick={() => navigate("/deeplens")}
            />
            <CmccSidebarAction
              icon="cases"
              label="案例库"
              active={location.pathname === "/cases" || location.pathname.startsWith("/cases/")}
              onClick={() => navigate("/cases")}
            />
          </nav>
          <div class="cmcc-sidebar-section mx-3 mt-2 flex shrink-0 items-center justify-between border-t px-1 pb-1 pt-2">
            <span class="text-[14px] font-semibold">历史任务</span>
            <button type="button" class="cmcc-sidebar-toggle" title="新对话" aria-label="新对话" onClick={openNewSession}>
              <span aria-hidden="true" class="text-[14px] font-normal leading-none">+</span>
            </button>
          </div>
          <div class="cmcc-sidebar-history min-h-0 flex-1 overflow-y-auto px-3 pb-4">
            <ResearchHistory sessions={conversations()} renderOpenCode={(session) => (
                <CmccSessionRow
                  session={session}
                  active={activeSession(session)}
                  running={sync().session.data.session_working(session.id)}
                  product={cmccHistoryProduct(dockapi.sessions.findByOpenCodeId(session.id)?.agentType, mstockMention(sync().session.data.message[session.id] ?? [], sync().session.data.part) ? "mstock/mstock" : session.agent,
                    sync().session.data.message[session.id]?.filter((message) => message.role === "user")
                      .sort((left, right) => left.time.created - right.time.created || left.id.localeCompare(right.id))[0]?.agent)}
                  timeLabel={cmccHistoryTime(sessionUpdatedAt(session))}
                  knowledgeName={
                    cmccKnowledgeNotebookForSession(knowledgeNotebooks(), session)?.name ??
                    cmccKnowledgeSessionReference(session)?.name
                  }
                  openSession={openSession}
                  deleteSession={deleteSession}
                  publishCase={
                    cmccCasePublishingAllowed(
                      dockapi.user?.casePublishAllowed,
                      dockapi.sessions.findByOpenCodeId(session.id)?.agentType,
                    )
                      ? publishCase
                      : undefined
                  }
                />
              )} />
          </div>
          <div class="cmcc-sidebar-footer mt-auto shrink-0 border-t px-3 py-2">
            <DropdownMenu gutter={8} placement="top-start">
              <DropdownMenu.Trigger aria-label={dockapi.user?.name || "账号菜单"} title={rail() ? dockapi.user?.name || "账号菜单" : undefined} class="cmcc-account-trigger flex h-9 w-full min-w-0 items-center gap-2 rounded-[8px] px-2 text-14-medium">
                <span class="cmcc-account-avatar flex size-7 shrink-0 items-center justify-center rounded-full text-12-medium">
                  {dockapi.user?.name.slice(0, 1) || "用"}
                </span>
                <Show when={!rail()}>
                  <span class="min-w-0 flex-1 truncate text-left">{dockapi.user?.name}</span>
                  <Icon name="chevron-down" class="size-4 shrink-0 text-[#8a909a]" />
                </Show>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content class="cmcc-account-menu w-[calc(var(--kb-popper-anchor-width)-8px)] min-w-[220px] rounded-[8px] border bg-white p-1.5 outline-none">
                  <DropdownMenu.Item
                    class="flex h-10 cursor-default items-center gap-2.5 rounded-[8px] px-3 text-14-medium outline-none data-[highlighted]:bg-[rgba(99,102,241,0.08)] data-[highlighted]:text-[#4f46e5]"
                    onSelect={() => window.location.assign("/landing/index.html")}
                  >
                    <Icon name="dot-grid" class="size-4 shrink-0" />
                    <DropdownMenu.ItemLabel>首页</DropdownMenu.ItemLabel>
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    class="flex h-10 cursor-default items-center gap-2.5 rounded-[8px] px-3 text-14-medium outline-none data-[highlighted]:bg-[rgba(99,102,241,0.08)] data-[highlighted]:text-[#4f46e5]"
                    onSelect={openQuota}
                  >
                    <Icon name="sliders" class="size-4 shrink-0" />
                    <DropdownMenu.ItemLabel>Token 额度</DropdownMenu.ItemLabel>
                  </DropdownMenu.Item>
                  <Show when={dockapi.user?.userType === "admin" || dockapi.user?.userType === "super_admin"}>
                    <DropdownMenu.Item class="flex h-10 cursor-default items-center gap-2.5 rounded-[8px] px-3 text-14-medium outline-none data-[highlighted]:bg-[rgba(99,102,241,0.08)]"
                      onSelect={() => window.location.assign("/admin")}>
                      <Icon name="sliders" class="size-4 shrink-0" />
                      <DropdownMenu.ItemLabel>管理平台</DropdownMenu.ItemLabel>
                    </DropdownMenu.Item>
                  </Show>
                  <DropdownMenu.Item
                    class="flex h-10 cursor-default items-center gap-2.5 rounded-[8px] px-3 text-14-medium outline-none data-[highlighted]:bg-[rgba(99,102,241,0.08)] data-[highlighted]:text-[#4f46e5]"
                    onSelect={() => void dockapi.auth.logout()}
                  >
                    <Icon name="enter" class="size-4 shrink-0 rotate-180" />
                    <DropdownMenu.ItemLabel>退出登录</DropdownMenu.ItemLabel>
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu>
          </div>
        </div>
      </aside>
      <div
        role="separator"
        aria-orientation="vertical"
        hidden={!desktop()}
        class="relative z-20 h-full w-1 shrink-0 cursor-col-resize bg-transparent before:absolute before:inset-y-6 before:left-1/2 before:w-px before:-translate-x-1/2 before:bg-transparent hover:before:bg-[#a5b4fc]"
        onPointerDown={startDrag}
      />
      <CasePublishDialog
        session={caseDialog.session}
        onClose={() => setCaseDialog("session", undefined)}
        onPublished={() => window.dispatchEvent(new Event(CMCC_CASES_UPDATED_EVENT))}
      />
    </>
  )
}

function CmccSidebarAction(props: {
  icon: "new-chat" | "research" | "industry" | "wiki" | "track" | "lens" | "cases"
  label: string
  active?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      class="cmcc-sidebar-action flex h-9 w-full min-w-0 items-center gap-2.5 rounded-[8px] px-3 text-left text-14-medium transition-colors duration-150 disabled:opacity-50"
      aria-label={props.label}
      title={props.label}
      onClick={props.onClick}
      disabled={!props.onClick}
      data-primary={props.icon === "new-chat" ? "" : undefined}
      data-selected={props.active ? "" : undefined}
    >
      <svg aria-hidden="true" class="size-5 shrink-0" viewBox="0 0 20 20">
        <use href={`${sidebarIconsUrl}#${props.icon}`} width="20" height="20" />
      </svg>
      <span class="min-w-0 truncate">{props.label}</span>
    </button>
  )
}

function CmccSessionRow(props: {
  session: Session
  active: boolean
  running: boolean
  product?: CmccHistoryProduct
  timeLabel: string
  openSession: (session: Session) => void
  deleteSession: (session: Session) => void
  publishCase?: (session: Session) => void
  knowledgeName?: string
}) {
  const menuItems = () => (
    <>
      <Show when={props.publishCase}>
        <DropdownMenu.Item onSelect={() => props.publishCase?.(props.session)}>
          <DropdownMenu.ItemLabel>添加至案例库</DropdownMenu.ItemLabel>
        </DropdownMenu.Item>
      </Show>
      <DropdownMenu.Item onSelect={() => props.deleteSession(props.session)}>
        <DropdownMenu.ItemLabel>删除</DropdownMenu.ItemLabel>
      </DropdownMenu.Item>
    </>
  )

  const contextMenuItems = () => (
    <>
      <Show when={props.publishCase}>
        <ContextMenu.Item onSelect={() => props.publishCase?.(props.session)}>
          <ContextMenu.ItemLabel>添加至案例库</ContextMenu.ItemLabel>
        </ContextMenu.Item>
      </Show>
      <ContextMenu.Item onSelect={() => props.deleteSession(props.session)}>
        <ContextMenu.ItemLabel>删除</ContextMenu.ItemLabel>
      </ContextMenu.Item>
    </>
  )

  const row = (
    <CmccHistoryRow
      source="opencode"
      title={sessionTitle(props.session.title) ?? "未命名对话"}
      active={props.active}
      running={props.running}
      product={props.product}
      timeLabel={props.timeLabel}
      knowledgeName={props.knowledgeName}
      onOpen={() => props.openSession(props.session)}
      menu={menuItems()}
    />
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
