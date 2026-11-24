import { For, Show } from "solid-js"
import {
  AdminDates,
  AdminQueryStatus,
  AdminReportTable,
  engineLabel,
  productLabel,
  recentDates,
  shanghaiTime,
  useAdminReport,
} from "./observability"

type Report = {
  timezone: string
  newUsers: number
  activeUsers: number
  newTasks: number
  trend: { day: string; newUsers: number; activeUsers: number; newTasks: number; tokens: number | null }[]
  products: { engine: string; product: string; count: number }[]
  usage: {
    tableAvailable: boolean
    collectionEnabled: boolean
    firstRecordedMs: number | null
    total: number | null
    incompleteRecords: number
    accounts: { userId: number; tokens: number }[]
    models: { source: string; provider: string | null; model: string | null; tokens: number }[]
  }
}

const number = (value: number | null) => (value == null ? "未记录" : value.toLocaleString("zh-CN"))

export default function AdminStatistics() {
  const dates = recentDates(7)
  const query = useAdminReport<Report>("/api/admin/statistics", { ...dates, tokenUserId: "" })
  return (
    <section class="admin-content admin-ops-page" data-page="admin-statistics">
      <header class="admin-page-title">
        <h1>统计报表</h1>
        <span class="admin-ops-muted">北京时间</span>
      </header>
      <form class="admin-toolbar admin-ops-toolbar" onSubmit={query.submit}>
        <AdminDates {...dates} />
        <label class="admin-ops-filter">
          用量账号 ID
          <input type="number" min="1" name="tokenUserId" placeholder="全部账号" />
        </label>
        <button class="primary" disabled={query.pending()}>
          查询
        </button>
      </form>
      <AdminQueryStatus pending={query.pending()} error={query.error()} onRetry={query.refresh} />
      <div class="admin-ops-scroll" aria-busy={query.pending()}>
        <Show when={query.data()}>
          {(data) => (
            <>
              <dl class="admin-ops-metrics">
                <div>
                  <dt>新增用户</dt>
                  <dd>{number(data().newUsers)}</dd>
                </div>
                <div>
                  <dt>任务活跃用户</dt>
                  <dd>{number(data().activeUsers)}</dd>
                </div>
                <div>
                  <dt>新增任务</dt>
                  <dd>{number(data().newTasks)}</dd>
                </div>
                <div>
                  <dt>已记录 Token</dt>
                  <dd>{number(data().usage.total)}</dd>
                </div>
              </dl>
              <p class="admin-ops-note">
                按期内创建的主会话计任务，包含之后删除的历史任务；活跃用户按发起人去重。 用量账号筛选只影响 Token 指标。
              </p>
              <p class="admin-ops-note">
                <Show when={data().usage.firstRecordedMs != null} fallback="没有可用的用量采集历史。">
                  最早用量记录：{shanghaiTime(data().usage.firstRecordedMs)}。
                </Show>{" "}
                <Show when={!data().usage.collectionEnabled}>当前额度用量采集未开启。 </Show>
                <Show when={data().usage.incompleteRecords > 0}>
                  筛选范围内有 {data().usage.incompleteRecords.toLocaleString("zh-CN")} 条用量记录尚未结算或不完整。
                </Show>
              </p>
              <section class="admin-ops-section">
                <h2>每日趋势</h2>
                <div class="admin-table-wrap">
                  <AdminReportTable
                    caption="每日趋势"
                    count={data().trend.length}
                    columns={["日期", "新增用户", "任务活跃用户", "新增任务", "已记录 Token"]}
                  >
                    <For each={data().trend}>
                      {(row) => (
                        <tr>
                          <td>{row.day}</td>
                          <td>{number(row.newUsers)}</td>
                          <td>{number(row.activeUsers)}</td>
                          <td>{number(row.newTasks)}</td>
                          <td>{number(row.tokens)}</td>
                        </tr>
                      )}
                    </For>
                  </AdminReportTable>
                </div>
              </section>
              <section class="admin-ops-section">
                <h2>任务分布</h2>
                <div class="admin-table-wrap">
                  <AdminReportTable
                    caption="任务分布"
                    count={data().products.length}
                    columns={["执行引擎", "任务类型", "新增任务"]}
                  >
                    <For each={data().products}>
                      {(row) => (
                        <tr>
                          <td>{engineLabel(row.engine)}</td>
                          <td>{productLabel(row.product, row.engine)}</td>
                          <td>{number(row.count)}</td>
                        </tr>
                      )}
                    </For>
                  </AdminReportTable>
                </div>
              </section>
              <section class="admin-ops-section">
                <h2>Token 用量分布</h2>
                <div class="admin-ops-breakdown">
                  <div class="admin-table-wrap">
                    <AdminReportTable
                      caption="按引擎和模型"
                      count={data().usage.models.length}
                      empty="没有可用的用量记录"
                      columns={["执行引擎", "供应商 / 模型", "已记录 Token"]}
                    >
                      <For each={data().usage.models}>
                        {(row) => (
                          <tr>
                            <td>{engineLabel(row.source)}</td>
                            <td>{[row.provider, row.model].filter(Boolean).join(" / ") || "未记录模型"}</td>
                            <td>{number(row.tokens)}</td>
                          </tr>
                        )}
                      </For>
                    </AdminReportTable>
                  </div>
                  <div class="admin-table-wrap">
                    <AdminReportTable
                      caption="账号用量前 20"
                      count={data().usage.accounts.length}
                      empty="没有可查看的账号用量"
                      columns={["账号用量前 20", "已记录 Token"]}
                    >
                      <For each={data().usage.accounts}>
                        {(row) => (
                          <tr>
                            <td>#{row.userId}</td>
                            <td>{number(row.tokens)}</td>
                          </tr>
                        )}
                      </For>
                    </AdminReportTable>
                  </div>
                </div>
              </section>
            </>
          )}
        </Show>
      </div>
    </section>
  )
}
