import { createEffect, createMemo, For, onCleanup, Show, untrack, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import { useLocation, useNavigate } from "@solidjs/router"
import { DropdownMenu } from "@opencode-ai/ui/dropdown-menu"
import { Icon } from "@opencode-ai/ui/icon"
import type { Session } from "@opencode-ai/sdk/v2/client"
import { useDockApi } from "@/context/dockapi"
import { showToast } from "@/utils/toast"
import { langGraphHistory, RESEARCH_API, RESEARCH_UPDATED, type HistoryItem, type LangGraphHistoryItem } from "./model"

export function ResearchHistory(props: { sessions: Session[]; renderOpenCode: (session: Session) => JSX.Element }) {
  const dockapi = useDockApi()
  const navigate = useNavigate()
  const location = useLocation()
  const [state, setState] = createStore({ items: [] as LangGraphHistoryItem[] })
  let generation = 0
  let disposed = false
  let refreshTimer: ReturnType<typeof setTimeout> | undefined
  const load = async () => {
    const own = ++generation
    if (refreshTimer) clearTimeout(refreshTimer)
    if (dockapi.status !== "authenticated") {
      setState("items", [])
      return
    }
    try {
      const rows = langGraphHistory(await dockapi.research.request<unknown>("/api/dockapi/history?source=langgraph"))
      if (disposed || own !== generation) return
      setState("items", rows)
      if (rows.some((row) => row.status === "running")) refreshTimer = setTimeout(() => void load(), 10000)
    } catch {
      // Older deployments may not have the independent research tables yet. OpenCode history remains usable.
      if (!disposed && own === generation) setState("items", [])
    }
  }
  createEffect(() => {
    dockapi.user?.id
    dockapi.status
    setState("items", [])
    untrack(() => void load())
  })
  const onUpdate = () => void load()
  window.addEventListener(RESEARCH_UPDATED, onUpdate)
  onCleanup(() => {
    disposed = true
    generation++
    if (refreshTimer) clearTimeout(refreshTimer)
    window.removeEventListener(RESEARCH_UPDATED, onUpdate)
  })
  const history = createMemo((): HistoryItem<Session>[] =>
    [
      ...props.sessions.map((session) => ({ source: "opencode" as const, session })),
      ...state.items.map((session) => ({ source: "langgraph" as const, session })),
    ].sort(
      (a, b) =>
        (b.source === "langgraph" ? Date.parse(b.session.updatedAt) : b.session.time.updated) -
        (a.source === "langgraph" ? Date.parse(a.session.updatedAt) : a.session.time.updated),
    ),
  )
  const mutate = async (item: LangGraphHistoryItem, action: "rename" | "delete") => {
    const title = action === "rename" ? window.prompt("任务名称", item.title) : undefined
    if (action === "rename" && !title?.trim()) return
    if (action === "delete" && !window.confirm(`删除「${item.title}」？`)) return
    try {
      await dockapi.research.request(`${RESEARCH_API}/sessions/${encodeURIComponent(item.sourceId)}`, {
        method: action === "rename" ? "PATCH" : "DELETE",
        ...(title ? { body: JSON.stringify({ title }) } : {}),
      })
      await load()
      if (action === "delete" && location.pathname.endsWith(`/session/${item.sourceId}`))
        navigate("/general-deepinsight")
      window.dispatchEvent(new CustomEvent(RESEARCH_UPDATED, { detail: "mutation" }))
    } catch (error) {
      showToast({ variant: "error", title: "操作失败", description: String(error) })
    }
  }
  return (
    <For each={history()} fallback={<div class="px-2 py-5 text-center text-[13px] text-[#9294ad]">暂无历史任务</div>}>
      {(item) =>
        item.source === "opencode" ? (
          props.renderOpenCode(item.session)
        ) : (
          <div
            class="group/research relative mb-0.5 flex min-h-12 items-center rounded-[6px] text-[#4a4a6a] hover:bg-indigo-100/60"
            classList={{
              "bg-indigo-100 text-indigo-600": location.pathname.endsWith(`/session/${item.session.sourceId}`),
            }}
            data-source="langgraph"
          >
            <button
              type="button"
              class="min-w-0 flex-1 px-2.5 py-1.5 text-left"
              disabled={!item.session.capabilities.open}
              onClick={() => navigate(`/general-deepinsight/session/${item.session.sourceId}`)}
            >
              <span class="flex min-w-0 items-center gap-1.5">
                <span class="min-w-0 flex-1 truncate text-[13px] font-medium">{item.session.title}</span>
                <span
                  class="shrink-0 rounded-full border px-1.5 py-0.5 text-[11px]"
                  style={{ color: "#2876aa", background: "#e7f2ff", "border-color": "#b8d5ed" }}
                >
                  通用深度洞察
                </span>
              </span>
              <span class="mt-0.5 block text-[11px] text-[#8b8daf]">
                {new Date(item.session.updatedAt).toLocaleDateString()}
              </span>
            </button>
            <Show when={item.session.status === "running"}>
              <span
                aria-label="任务进行中"
                role="status"
                class="mr-2 size-3.5 shrink-0 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600"
              />
            </Show>
            <DropdownMenu>
              <DropdownMenu.Trigger
                class="mr-1 flex size-6 items-center justify-center rounded hover:bg-indigo-100"
                aria-label="研究任务操作"
              >
                <Icon name="dot-grid" class="size-3.5" />
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content>
                  <Show when={dockapi.user?.casePublishAllowed && item.session.status === "completed"}>
                    <DropdownMenu.Item
                      onSelect={() => navigate(`/general-deepinsight/session/${item.session.sourceId}?publish=1`)}
                    >
                      <DropdownMenu.ItemLabel>添加至案例库</DropdownMenu.ItemLabel>
                    </DropdownMenu.Item>
                  </Show>
                  <Show when={item.session.capabilities.rename}>
                    <DropdownMenu.Item onSelect={() => void mutate(item.session, "rename")}>
                      <DropdownMenu.ItemLabel>重命名</DropdownMenu.ItemLabel>
                    </DropdownMenu.Item>
                  </Show>
                  <Show when={item.session.capabilities.delete}>
                    <DropdownMenu.Item onSelect={() => void mutate(item.session, "delete")}>
                      <DropdownMenu.ItemLabel>删除</DropdownMenu.ItemLabel>
                    </DropdownMenu.Item>
                  </Show>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu>
          </div>
        )
      }
    </For>
  )
}
