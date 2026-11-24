import { For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useDockApi } from "@/context/dockapi"
import { managementPageSize, type ManagedPage } from "./api"
import { Pagination } from "./shared"
import {
  AdminDates,
  AdminQueryStatus,
  AdminReportTable,
  FilterSelect,
  recentDates,
  shanghaiTime,
  useAdminReport,
} from "./observability"

type RecordRow = {
  id: number
  result: string
  createdAt: string
} & (
  | { actorId: number; action: string; target: string; changes: string[] }
  | { userId: number | null; account: string }
)

const actionLabels: Record<string, string> = {
  "user.update": "修改用户配置",
  "user.reset-password": "重置密码",
  "user.revoke-sessions": "退出全部会话",
  "case.update": "修改案例信息",
  "case.status": "案例上下架",
  "case.delete": "删除案例",
}
const resultLabels: Record<string, string> = {
  success: "成功",
  failure: "失败",
  limited: "暂时受限",
  unavailable: "登录服务异常",
}

export default function AdminSecurity() {
  const dockapi = useDockApi()
  const [state, setState] = createStore({ login: false })
  const superAdmin = () => dockapi.user?.userType === "super_admin"
  return (
    <section class="admin-content admin-ops-page" data-page="admin-security">
      <header class="admin-page-title">
        <h1>安全管理</h1>
      </header>
      <div class="admin-ops-tabs" aria-label="安全记录类型">
        <button
          type="button"
          classList={{ active: !state.login || !superAdmin() }}
          aria-pressed={!state.login || !superAdmin()}
          onClick={() => setState("login", false)}
        >
          操作审计
        </button>
        <Show when={superAdmin()}>
          <button
            type="button"
            classList={{ active: state.login }}
            aria-pressed={state.login}
            onClick={() => setState("login", true)}
          >
            登录记录
          </button>
        </Show>
      </div>
      <Show when={state.login && superAdmin()} fallback={<Records login={false} all={superAdmin()} />}>
        <Records login={true} all={true} />
      </Show>
    </section>
  )
}

function Records(props: { login: boolean; all: boolean }) {
  const dates = recentDates(30)
  const query = useAdminReport<ManagedPage<RecordRow>>(
    props.login ? "/api/admin/security/logins" : "/api/admin/security/operations",
    { ...dates, result: "", ...(props.login ? {} : { target: "", ...(props.all ? { actorId: "" } : {}) }) },
  )
  return (
    <>
      <form class="admin-toolbar admin-ops-toolbar" onSubmit={query.submit}>
        <AdminDates {...dates} />
        <Show when={!props.login}>
          <Show when={props.all}>
            <label class="admin-ops-filter">
              操作人 ID
              <input name="actorId" type="number" min="1" />
            </label>
          </Show>
          <label class="admin-ops-filter">
            对象编号
            <input name="target" placeholder="如 user:123" maxlength={160} />
          </label>
        </Show>
        <FilterSelect
          name="result"
          label="结果"
          options={[
            ["", "全部"],
            ["success", "成功"],
            ["failure", "失败"],
            ...(props.login
              ? ([
                  ["limited", "暂时受限"],
                  ["unavailable", "登录服务异常"],
                ] as [string, string][])
              : []),
          ]}
        />
        <button class="primary" disabled={query.pending()}>
          查询
        </button>
      </form>
      <AdminQueryStatus pending={query.pending()} error={query.error()} onRetry={query.refresh} />
      <div class="admin-table-wrap" aria-busy={query.pending()}>
        <Show when={query.data()}>
          {(data) => (
            <AdminReportTable
              caption={props.login ? "登录记录" : "操作审计"}
              count={data().items.length}
              empty={props.login ? "没有匹配记录，登录历史从功能启用后开始记录" : undefined}
              columns={
                props.login ? ["时间", "脱敏账号", "用户 ID", "结果"] : ["时间", "操作人 ID", "操作", "对象", "结果"]
              }
            >
              <For each={data().items}>
                {(row) => (
                  <tr>
                    <td>{shanghaiTime(row.createdAt)}</td>
                    {"actorId" in row ? (
                      <>
                        <td>#{row.actorId}</td>
                        <td>
                          {actionLabels[row.action] ?? row.action}
                          <Show when={row.changes.length > 0}>
                            <small class="admin-ops-muted admin-ops-changes">{row.changes.join("、")}</small>
                          </Show>
                        </td>
                        <td>{row.target}</td>
                      </>
                    ) : (
                      <>
                        <td>{row.account}</td>
                        <td>{row.userId == null ? "—" : `#${row.userId}`}</td>
                      </>
                    )}
                    <td>{resultLabels[row.result] ?? row.result}</td>
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
    </>
  )
}
