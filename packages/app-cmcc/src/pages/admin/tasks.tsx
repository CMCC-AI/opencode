import { createResource, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useDockApi } from "@/context/dockapi"
import { managementPageSize, type ManagedPage } from "./api"
import { AdminModal, Pagination, ToolButton } from "./shared"
import {
  AdminDates,
  AdminQueryStatus,
  AdminReportTable,
  FilterSelect,
  engineLabel,
  errorText,
  productLabel,
  productOptions,
  recentDates,
  shanghaiTime,
  useAdminReport,
} from "./observability"

type Task = {
  id: string
  userId: number
  engine: string
  product: string
  createdAt: string
  updatedAt: string
  status: string
  retryAttempt: number | null
  checkedAt: string
}
type Recent = {
  result: string
  provider: string | null
  model: string | null
  startedMs: number | null
  endedMs: number | null
  elapsedSeconds: number | null
  reason: string | null
}
type Detail = { task: Task; recent: Recent }
const status: Record<string, string> = {
  pending: "尚未开始",
  running: "运行中",
  retrying: "重试中",
  idle: "当前未运行",
  waiting: "等待用户确认",
  completed: "已完成",
  failed: "失败",
  stopped: "已停止",
  interrupted: "已中断",
  unavailable: "状态暂不可用",
}
const recentStatus: Record<string, string> = {
  ...status,
  in_progress: "尚未结束",
  unrecorded: "结果未记录",
  unavailable: "结果暂不可用",
}

function statusText(task: Task) {
  if (task.status === "retrying" && task.retryAttempt != null) return `重试中（第 ${task.retryAttempt} 次）`
  return status[task.status] ?? status.unavailable
}

function duration(seconds: number | null) {
  if (seconds == null) return "—"
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return `${hours ? `${hours}小时 ` : ""}${minutes ? `${minutes}分 ` : ""}${seconds % 60}秒`
}

export default function AdminTasks() {
  const dates = recentDates(30)
  const query = useAdminReport<ManagedPage<Task>>("/api/admin/tasks", { ...dates, userId: "", engine: "", product: "" })
  const [state, setState] = createStore({ selected: undefined as Task | undefined })
  return (
    <section class="admin-content admin-ops-page" data-page="admin-tasks">
      <header class="admin-page-title">
        <h1>任务状态管理</h1>
        <ToolButton label="刷新状态" icon="arrow-undo-down" disabled={query.pending()} onClick={query.refresh} />
      </header>
      <form class="admin-toolbar admin-ops-toolbar" onSubmit={query.submit}>
        <AdminDates {...dates} />
        <label class="admin-ops-filter">
          用户 ID
          <input type="number" name="userId" min="1" placeholder="全部用户" />
        </label>
        <FilterSelect
          name="engine"
          label="执行引擎"
          options={[
            ["", "全部"],
            ["opencode", "OpenCode"],
            ["langgraph", "LangGraph"],
          ]}
        />
        <FilterSelect name="product" label="任务类型" options={productOptions} />
        <button class="primary" disabled={query.pending()}>
          查询
        </button>
      </form>
      <AdminQueryStatus pending={query.pending()} error={query.error()} onRetry={query.refresh} />
      <div class="admin-table-wrap" aria-busy={query.pending()}>
        <Show when={query.data()}>
          {(data) => (
            <AdminReportTable
              caption="任务状态"
              count={data().items.length}
              columns={["任务编号", "归属", "执行引擎", "任务类型", "创建时间", "当前状态", "查询时间", "详情"]}
            >
              <For each={data().items}>
                {(item) => (
                  <tr>
                    <td class="admin-ops-id" title={item.id}>
                      {item.id}
                    </td>
                    <td>#{item.userId}</td>
                    <td>{engineLabel(item.engine)}</td>
                    <td>{productLabel(item.product, item.engine)}</td>
                    <td>{shanghaiTime(item.createdAt)}</td>
                    <td>{statusText(item)}</td>
                    <td>{shanghaiTime(item.checkedAt)}</td>
                    <td>
                      <ToolButton label={`查看任务 ${item.id}`} icon="eye" onClick={() => setState("selected", item)} />
                    </td>
                  </tr>
                )}
              </For>
            </AdminReportTable>
          )}
        </Show>
      </div>
      <Pagination
        page={query.page()}
        size={managementPageSize}
        total={query.data()?.total ?? 0}
        pending={query.pending()}
        onChange={query.changePage}
      />
      <Show when={state.selected} keyed>
        {(item) => <TaskDetail task={item} close={() => setState("selected", undefined)} />}
      </Show>
    </section>
  )
}

function TaskDetail(props: { task: Task; close: () => void }) {
  const dockapi = useDockApi()
  const [detail, { refetch }] = createResource(
    () => dockapi.user?.id,
    () =>
      dockapi.research.request<Detail>(
        `/api/admin/tasks/${encodeURIComponent(props.task.engine)}/${encodeURIComponent(props.task.id)}`,
      ),
  )
  return (
    <AdminModal title="任务详情" onClose={props.close}>
      <AdminQueryStatus pending={detail.loading} error={errorText(detail.error)} onRetry={() => void refetch()} />
      <Show when={!detail.loading && !detail.error && detail()}>
        {(data) => (
          <div class="admin-ops-detail">
            <dl>
              <dt>任务编号</dt>
              <dd>{data().task.id}</dd>
              <dt>当前状态</dt>
              <dd>{statusText(data().task)}</dd>
              <dt>记录更新时间</dt>
              <dd>{shanghaiTime(data().task.updatedAt)}</dd>
              <dt>查询时间</dt>
              <dd>{shanghaiTime(data().task.checkedAt)}</dd>
              <dt>最近结果</dt>
              <dd>{recentStatus[data().recent.result] ?? recentStatus.unrecorded}</dd>
              <dt>供应商 / 模型</dt>
              <dd>{[data().recent.provider, data().recent.model].filter(Boolean).join(" / ") || "—"}</dd>
              <dt>发起时间</dt>
              <dd>{shanghaiTime(data().recent.startedMs)}</dd>
              <dt>结束时间</dt>
              <dd>{shanghaiTime(data().recent.endedMs)}</dd>
              <dt>{data().task.engine === "langgraph" ? "会话累计耗时" : "本轮耗时"}</dt>
              <dd>{duration(data().recent.elapsedSeconds)}</dd>
              <Show when={data().recent.reason}>
                <dt>原因</dt>
                <dd>{data().recent.reason}</dd>
              </Show>
            </dl>
          </div>
        )}
      </Show>
    </AdminModal>
  )
}
