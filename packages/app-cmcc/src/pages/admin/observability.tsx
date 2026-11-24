import { createResource, For, Show, type ParentProps } from "solid-js"
import { createStore } from "solid-js/store"
import { useDockApi } from "@/context/dockapi"
import { CMCC_DEEP_RESEARCH_PRODUCT, cmccHistoryProduct } from "@/utils/cmcc-history-product"
import { managementPageSize, queryPath } from "./api"
import { AdminError } from "./shared"

type Parameters = Record<string, string | number>

export function useAdminReport<T>(endpoint: string, initial: Parameters) {
  const dockapi = useDockApi()
  const [parameters, setParameters] = createStore({ filters: initial, page: 1 })
  const [response, { refetch }] = createResource(
    () =>
      dockapi.user?.id === undefined
        ? false
        : { account: `${dockapi.user.id}:${dockapi.user.userType}`, ...parameters.filters, page: parameters.page },
    ({ account: _account, ...filters }) =>
      dockapi.research.request<T>(queryPath(endpoint, { ...filters, size: managementPageSize })),
  )
  return {
    data: () => (response.loading || response.error ? undefined : response()),
    pending: () => response.loading,
    error: () => errorText(response.error),
    page: () => parameters.page,
    changePage: (page: number) => setParameters("page", page),
    refresh: () => void refetch(),
    submit: (event: SubmitEvent) => {
      event.preventDefault()
      if (response.loading || !(event.currentTarget instanceof HTMLFormElement)) return
      const values = Object.fromEntries(
        Array.from(new FormData(event.currentTarget), ([field, value]) => [field, String(value).trim()]),
      )
      if (
        parameters.page === 1 &&
        Object.entries(values).every(([field, value]) => parameters.filters[field] === value)
      ) {
        void refetch()
        return
      }
      setParameters({ filters: values, page: 1 })
    },
  }
}

export function errorText(error: unknown) {
  if (!error) return ""
  return error instanceof Error ? error.message : "查询失败，请重试"
}

export function recentDates(days: number) {
  const now = Date.now()
  const format = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai" })
  return { from: format.format(now - (days - 1) * 86_400_000), to: format.format(now) }
}

export function AdminDates(props: { from: string; to: string }) {
  return (
    <>
      <label class="admin-ops-filter">
        开始日期
        <input name="from" type="date" required value={props.from} />
      </label>
      <label class="admin-ops-filter">
        结束日期
        <input name="to" type="date" required value={props.to} />
      </label>
    </>
  )
}

export function FilterSelect(props: { name: string; label: string; options: [string, string][] }) {
  return (
    <label class="admin-ops-filter">
      {props.label}
      <select name={props.name}>
        <For each={props.options}>{([value, text]) => <option value={value}>{text}</option>}</For>
      </select>
    </label>
  )
}

export function AdminReportTable(
  props: ParentProps<{ columns: string[]; caption: string; count: number; empty?: string }>,
) {
  return (
    <table class="admin-ops-table" aria-label={props.caption}>
      <thead>
        <tr>
          <For each={props.columns}>{(label) => <th scope="col">{label}</th>}</For>
        </tr>
      </thead>
      <tbody>
        <Show
          when={props.count > 0}
          fallback={
            <tr>
              <td class="admin-ops-empty" colspan={props.columns.length}>
                {props.empty ?? "没有匹配记录"}
              </td>
            </tr>
          }
        >
          {props.children}
        </Show>
      </tbody>
    </table>
  )
}

export function AdminQueryStatus(props: { pending: boolean; error: string; onRetry: () => void }) {
  return (
    <>
      <AdminError error={props.error} retry={props.onRetry} />
      <Show when={props.pending}>
        <p class="admin-ops-status" role="status">
          正在查询…
        </p>
      </Show>
    </>
  )
}

export function engineLabel(value: string) {
  return value === "opencode" ? "OpenCode" : value === "langgraph" ? "LangGraph" : value
}

export function productLabel(value: string, engine: string) {
  if (engine === "langgraph" && value === "general-deepinsight") return "通用深度研究"
  if (value === "deepinsight") return "通用对话 / 深度研究"
  return cmccHistoryProduct(value)?.label ?? value
}

export const productOptions: [string, string][] = [
  ["", "全部类型"],
  ["deepinsight", `通用对话 / ${CMCC_DEEP_RESEARCH_PRODUCT.label}`],
  ["general-deepinsight", "通用深度研究（LangGraph）"],
  ...[
    "deeptrading",
    "zhengqi-visit-intel",
    "deepinspect",
    "shoppers-pro",
    "deepgeo",
    "ai-for-science-team",
    "mstock",
  ].map((value): [string, string] => [value, productLabel(value, "opencode")]),
  ["ai-scientist", "AI+科研（旧记录）"],
]

export function shanghaiTime(value: string | number | null | undefined) {
  if (value == null) return "—"
  const input = typeof value === "string" && !/(?:Z|[+-]\d{2}:\d{2})$/i.test(value) ? value + "+08:00" : value
  const date = new Date(input)
  return Number.isFinite(date.getTime())
    ? date.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })
    : "—"
}
