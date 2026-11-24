import { useNavigate, useParams, useSearchParams } from "@solidjs/router"
import { createEffect, createMemo, createResource, createSignal, For, lazy, on, onCleanup, onMount, Show, Suspense } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"
import { type Session } from "@opencode-ai/sdk/v2/client"
import menu from "@/assets/mobile/menu.svg"
import sidebarIcons from "@/assets/sidebar/menu-icons.svg?url"
import { DeleteConfirmation } from "@/components/delete-confirmation"
import { asOpenCodeSession, useDockApi, type DockApiSession } from "@/context/dockapi"
import { useSDK } from "@/context/sdk"
import { useServer } from "@/context/server"
import { useServerSync } from "@/context/server-sync"
import { useTabs, type DraftTab } from "@/context/tabs"
import { cmccHistoryTime } from "@/utils/cmcc-history-time"
import { cmccArtifactWorkspace } from "@/utils/cmcc-workspace"
import { pathKey } from "@/utils/path-key"
import { setV2Toast, ToastRegion } from "@/utils/toast"
import { langGraphHistory, RESEARCH_API } from "../general-deepinsight/model"
import { MobileConversation } from "./conversation"
import { mobileAgents, mobileAssistants } from "./assistants"
import { mobileHistoryHref, mobileOpenCodeMode, type MobileOpenCodeMode, type MobileSource } from "./history"
import "./mobile.css"

const ResearchHistory = lazy(() => import("./research"))

type Row = {
  id: string
  source: MobileSource
  title: string
  updated: number
  label: string
  open: boolean
  delete: boolean
  mode?: MobileOpenCodeMode
  session?: Session
}

export default function MobilePage() {
  const dock = useDockApi()
  const server = useServer()
  const sdk = useSDK()
  const sync = useServerSync()
  const tabs = useTabs()
  const params = useParams<{ source?: string; id?: string }>()
  const [search] = useSearchParams<{ draftId?: string }>()
  const navigate = useNavigate()
  const [removal, setRemoval] = createSignal<Row>()
  const [deleting, setDeleting] = createSignal(false)
  const [removeFailed, setRemoveFailed] = createSignal(false)
  let main!: HTMLElement
  let drawer!: HTMLDialogElement
  onMount(() => {
    setV2Toast(true)
    const viewport = window.visualViewport
    if (!viewport) return
    const resize = () => {
      if (viewport.scale !== 1) return
      main.style.setProperty("--mobile-height", `${viewport.height}px`)
      main.style.setProperty("--mobile-top", `${viewport.offsetTop}px`)
    }
    resize()
    viewport.addEventListener("resize", resize)
    viewport.addEventListener("scroll", resize)
    onCleanup(() => {
      viewport.removeEventListener("resize", resize)
      viewport.removeEventListener("scroll", resize)
    })
  })
  const workspace = () => dock.workspace?.directoryPath
  const draft = () => tabs.store.find((tab): tab is DraftTab => tab.type === "draft" && tab.draftID === search.draftId &&
    tab.mobileOwner === dock.user?.id && tab.directory === workspace() && tab.server === server.key)
  const newChat = () => {
    const directory = workspace()
    const owner = dock.user?.id
    const artifacts = cmccArtifactWorkspace(directory)
    if (!directory || owner === undefined || !artifacts || !tabs.ready()) return
    drawer?.close()
    tabs.newDraft({ server: server.key, directory, artifactDirectory: artifacts, mobileOwner: owner, agent: mobileAssistants.lingxi.agent })
  }
  createEffect(on(() => [params.source, params.id, search.draftId, tabs.ready(), workspace(), dock.user?.id], () => {
    if (!params.source && !params.id && !draft()) newChat()
  }))

  const [openCode, reloadOpenCode] = createResource(
    () => workspace(),
    async (directory) => {
      const response = await sdk().client.session.list({
        directory,
        roots: true,
        limit: Math.max(64, dock.state.sessions.length),
      }, { throwOnError: true })
      return Object.fromEntries((response.data ?? []).map((session) => [session.id, session]))
    },
  )
  const [langGraph, reloadLangGraph] = createResource(
    () => dock.user?.id,
    async () => langGraphHistory(await dock.research.request<unknown>("/api/dockapi/history?source=langgraph")),
  )
  const metadata = (binding: DockApiSession) =>
    sync().session.data.info[binding.openCodeSessionId] ??
    (openCode.error ? undefined : openCode.latest?.[binding.openCodeSessionId]) ??
    asOpenCodeSession(binding.openCodeSession)

  const belongsHere = (binding: DockApiSession) => {
    const directory = workspace()
    return !!directory && pathKey(directory) === pathKey(binding.directoryPath)
  }
  const rowForSession = (binding: DockApiSession, session: Session): Row | undefined => {
    const mode = mobileOpenCodeMode(session, binding.agentType, dock.agentType, mobileAgents)
    if (!mode) return
    return {
      source: "opencode",
      id: binding.openCodeSessionId,
      title: binding.title || session.title || "新对话",
      updated: session.time.updated || Date.parse(binding.updatedAt),
      open: true,
      delete: true,
      label: "research" in mode ? "深度研究" : mobileAssistants[mode.assistant].name,
      session,
      mode,
    }
  }
  const graphRows = createMemo<Row[]>(() => (langGraph.error ? [] : langGraph.latest ?? []).map((item) => ({
    id: item.sourceId, source: "langgraph", title: item.title || "深度研究", updated: Date.parse(item.updatedAt), label: "深度研究",
    open: item.capabilities.open === true, delete: item.capabilities.delete === true,
  })))
  const rows = createMemo<Row[]>(() => [
    ...dock.state.sessions.filter(belongsHere).flatMap((binding) => {
      const session = metadata(binding)
      const row = session && rowForSession(binding, session)
      return row ? [row] : []
    }),
    ...graphRows(),
  ].sort((a, b) => b.updated - a.updated))

  const detailBinding = createMemo(() => {
    if (params.source !== "opencode" || !params.id) return
    return dock.state.sessions.find((binding) => binding.openCodeSessionId === params.id && belongsHere(binding))
  })
  // A direct link only requests OpenCode data after locating an owned DockAPI binding.
  const [direct] = createResource(
    () => {
      const binding = detailBinding()
      return binding && !metadata(binding)?.agent ? binding.openCodeSessionId : undefined
    },
    async (sessionID) => (await sdk().client.session.get({ sessionID }, { throwOnError: true })).data,
  )
  const current = createMemo(() => {
    if (params.source === "langgraph") return graphRows().find((row) => row.id === params.id && row.open)
    const binding = detailBinding()
    if (!binding) return
    const known = metadata(binding)
    const resolved = direct.error ? undefined : direct.latest
    const session = known?.agent ? known : resolved?.id === binding.openCodeSessionId ? resolved : undefined
    return session ? rowForSession(binding, session) : undefined
  })
  const busy = () => (params.source === "langgraph" && langGraph.loading) || (params.source === "opencode" && direct.loading)
  const openDrawer = () => {
    drawer.showModal()
    void dock.sessions.list().then(() => reloadOpenCode.refetch()).catch(() => {})
    void reloadLangGraph.refetch()
  }
  const remove = async () => {
    const row = removal()
    if (!row?.delete || deleting()) return
    setRemoveFailed(false)
    setDeleting(true)
    try {
      if (row.source === "opencode") {
        await dock.sessions.remove(row.id)
      } else {
        await dock.research.request(`${RESEARCH_API}/sessions/${encodeURIComponent(row.id)}`, { method: "DELETE" })
        reloadLangGraph.mutate((items) => items?.filter((item) => item.sourceId !== row.id))
      }
      setRemoval(undefined)
      if (params.id === row.id && params.source === row.source) newChat()
    } catch {
      setRemoveFailed(true)
    } finally {
      setDeleting(false)
    }
  }
  return (
    <main ref={main} class="di-mobile">
      <header class="di-mobile-header">
        <button type="button" aria-label="打开导航" onClick={openDrawer}><img src={menu} alt="" /></button>
        <h1>{current()?.title ?? "DeepInsight深度洞察"}</h1>
      </header>
      <Show when={params.source} fallback={
        <Show when={draft()?.draftID} keyed fallback={<p class="di-mobile-state" role="status">正在准备新对话…</p>}>
          {(draftID) => <MobileConversation draftID={draftID} />}
        </Show>
      }>
        <Show when={current() ? `${current()!.source}:${current()!.id}` : undefined} keyed fallback={
          <Show when={!busy()} fallback={<p class="di-mobile-state" role="status">正在加载历史记录…</p>}>
            <div class="di-mobile-state"><p>该历史记录不可用</p><button type="button" onClick={newChat}>返回新对话</button></div>
          </Show>
        }>
          <Show when={current()?.mode && !("research" in current()!.mode!) ? current()!.mode : undefined}
            fallback={<Suspense fallback={<p class="di-mobile-state" role="status">正在读取研究内容…</p>}>
              <ResearchHistory source={current()!.source} id={current()!.id} />
            </Suspense>}>
            {(mode) => <MobileConversation session={current()!.session} existing={mode() as Exclude<MobileOpenCodeMode, { research: true }>} />}
          </Show>
        </Show>
      </Show>
      <dialog ref={drawer} class="di-mobile-nav" aria-label="导航" onClick={(event) => { if (event.target === drawer) drawer.close() }}>
        <div class="di-mobile-nav-content">
          <div class="di-mobile-nav-brand">
            <img src="/brand/mobileai-horizontal.svg" alt="移动智能" />
            <strong>深度洞察</strong>
            <button type="button" aria-label="关闭导航" onClick={() => drawer.close()}><Icon name="close" /></button>
          </div>
          <button type="button" class="di-mobile-nav-new" onClick={newChat}>
            <svg aria-hidden="true"><use href={`${sidebarIcons}#new-chat`} /></svg>新对话
          </button>
          <h2>报告历史</h2>
          <div class="di-mobile-history">
            <For each={rows()} fallback={<p class="di-mobile-history-status">{openCode.loading || langGraph.loading ? "正在加载…" : "暂无历史记录"}</p>}>
              {(row) => <div class="di-mobile-history-row" classList={{ active: params.source === row.source && params.id === row.id }}>
                <button type="button" class="di-mobile-history-open" disabled={!row.open} onClick={() => {
                  drawer.close()
                  navigate(mobileHistoryHref(row.source, row.id))
                }}>
                  <span class="di-mobile-history-mark" data-product={row.label}><Icon name="bullet-list" /></span>
                  <span class="di-mobile-history-title">{row.title}</span>
                  <time>{cmccHistoryTime(row.updated)}</time>
                </button>
                <Show when={row.delete}>
                  <button type="button" class="di-mobile-history-delete" aria-label={`删除 ${row.title}`} onClick={() => {
                    drawer.close()
                    setRemoveFailed(false)
                    setRemoval(row)
                  }}><Icon name="close" /></button>
                </Show>
              </div>}
            </For>
            <Show when={openCode.error || langGraph.error}>
              <button type="button" class="di-mobile-history-status" onClick={() => {
                void reloadOpenCode.refetch()
                void reloadLangGraph.refetch()
              }}>部分历史加载失败，重试</button>
            </Show>
          </div>
        </div>
      </dialog>
      <Show when={removal()} keyed>
        {(row) => <DeleteConfirmation
          title="删除历史任务"
          message={`确定删除“${row.title}”吗？`}
          description="删除后，该会话也会从 PC 版历史中移除。"
          pending={deleting()}
          onCancel={() => setRemoval(undefined)}
          onConfirm={() => void remove()}
        >
          <Show when={removeFailed()}><p class="mt-2 text-sm text-red-700" role="alert">历史记录没有删除，请重试。</p></Show>
        </DeleteConfirmation>}
      </Show>
      <ToastRegion v2 />
    </main>
  )
}
