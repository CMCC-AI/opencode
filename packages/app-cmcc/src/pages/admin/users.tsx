import { For, Show, createEffect, onCleanup, onMount } from "solid-js"
import { createStore } from "solid-js/store"
import { DockApiError, useDockApi } from "@/context/dockapi"
import type { TokenQuotaSnapshot } from "@/utils/token-quota"
import { canManageUser, managementApi, userTypeLabel, type ManagedUser, type UserConfiguration } from "./api"
import { AdminError, AdminModal, AdminSelect, Pagination, ToolButton, formatAdminTime } from "./shared"

export function AdminUsers() {
  const dockapi = useDockApi()
  const api = managementApi(dockapi)
  const [state, setState] = createStore({
    keyword: "",
    userType: "",
    vip: "",
    enabled: "",
    cases: "",
    page: 1,
    revision: 0,
    items: [] as ManagedUser[],
    total: 0,
    loading: false,
    error: "",
    selected: undefined as ManagedUser | undefined,
  })
  let generation = 0
  onCleanup(() => {
    generation += 1
  })
  createEffect(() => {
    const input = {
      keyword: state.keyword,
      userType: state.userType,
      vip: state.vip,
      enabled: state.enabled,
      caseManagementAllowed: state.cases,
      page: state.page,
      size: 20,
    }
    state.revision
    dockapi.user?.id
    const current = ++generation
    setState({ loading: true, error: "", items: [] })
    void api
      .users(input)
      .then((result) => {
        if (current !== generation) return
        const page = Math.max(1, Math.ceil(result.total / 20))
        if (input.page > page) {
          setState("page", page)
          return
        }
        setState({ items: result.items, total: result.total })
      })
      .catch((error) => {
        if (current === generation) setState("error", error instanceof Error ? error.message : "用户加载失败")
      })
      .finally(() => {
        if (current === generation) setState("loading", false)
      })
  })
  const reload = () => setState("revision", (value) => value + 1)
  return (
    <section class="admin-content" data-page="admin-users">
      <header class="admin-page-title">
        <h1>用户管理</h1>
      </header>
      <form class="admin-toolbar" onSubmit={(event) => event.preventDefault()}>
        <input
          type="search"
          aria-label="搜索用户"
          placeholder="姓名、账号或手机号"
          value={state.keyword}
          onInput={(event) => setState({ keyword: event.currentTarget.value, page: 1 })}
        />
        <AdminSelect
          label="用户类型筛选"
          value={state.userType}
          options={[
            { value: "", label: "全部类型" },
            { value: "user", label: "普通用户" },
            { value: "admin", label: "管理员" },
            { value: "super_admin", label: "超级管理员" },
          ]}
          onChange={(value) => setState({ userType: value, page: 1 })}
        />
        <AdminSelect
          label="VIP筛选"
          value={state.vip}
          options={[
            { value: "", label: "全部权益" },
            { value: "true", label: "VIP" },
            { value: "false", label: "非 VIP" },
          ]}
          onChange={(value) => setState({ vip: value, page: 1 })}
        />
        <AdminSelect
          label="账号状态筛选"
          value={state.enabled}
          options={[
            { value: "", label: "全部账号状态" },
            { value: "true", label: "已启用" },
            { value: "false", label: "已停用" },
          ]}
          onChange={(value) => setState({ enabled: value, page: 1 })}
        />
        <AdminSelect
          label="案例授权筛选"
          value={state.cases}
          options={[
            { value: "", label: "全部案例权限" },
            { value: "true", label: "有案例权限" },
            { value: "false", label: "无案例权限" },
          ]}
          onChange={(value) => setState({ cases: value, page: 1 })}
        />
      </form>
      <AdminError error={state.error} retry={reload} />
      <div class="admin-table-wrap" aria-busy={state.loading}>
        <table class="admin-users-table">
          <thead>
            <tr>
              <th>用户</th>
              <th>账号／手机号</th>
              <th>用户类型</th>
              <th>VIP</th>
              <th>案例权限</th>
              <th>状态</th>
              <th>注册时间</th>
              <th class="admin-action-col">操作</th>
            </tr>
          </thead>
          <tbody>
            <For each={state.items}>
              {(user) => (
                <tr>
                  <td>
                    <div class="admin-user-cell">
                      <span class="admin-table-avatar" aria-hidden="true">
                        {user.name.slice(0, 1) || "用"}
                      </span>
                      <div class="admin-cell-copy">
                        <strong title={user.name}>{user.name}</strong>
                        <small>#{user.id}</small>
                      </div>
                    </div>
                  </td>
                  <td>{user.phone}</td>
                  <td>{userTypeLabel(user.userType)}</td>
                  <td>{user.vip ? "VIP" : "--"}</td>
                  <td>{user.caseManagementAllowed ? "全局" : "无"}</td>
                  <td>{user.enabled ? "已启用" : "已停用"}</td>
                  <td class="admin-time-cell">{formatAdminTime(user.createdAt)}</td>
                  <td>
                    <ToolButton
                      label={`${canManageUser(dockapi.user?.userType, user.userType) ? "配置" : "查看"}${user.name}`}
                      icon={canManageUser(dockapi.user?.userType, user.userType) ? "edit-small-2" : "eye"}
                      onClick={() => setState("selected", user)}
                    />
                  </td>
                </tr>
              )}
            </For>
            <Show when={!state.items.length}>
              <tr>
                <td colspan={8} class="admin-empty">
                  {state.loading ? "正在加载用户..." : state.error ? "--" : "暂无符合条件的用户"}
                </td>
              </tr>
            </Show>
          </tbody>
        </table>
      </div>
      <Pagination
        page={state.page}
        size={20}
        total={state.total}
        pending={state.loading}
        onChange={(page) => setState("page", page)}
      />
      <Show when={state.selected} keyed>
        {(user) => (
          <UserEditor
            user={user}
            onClose={() => setState("selected", undefined)}
            onSaved={() => {
              setState("selected", undefined)
              reload()
            }}
          />
        )}
      </Show>
    </section>
  )
}

function UserEditor(props: { user: ManagedUser; onClose: () => void; onSaved: () => void }) {
  const dockapi = useDockApi()
  const api = managementApi(dockapi)
  const [state, setState] = createStore({
    userType: props.user.userType,
    persistedType: props.user.userType,
    vip: props.user.vip,
    enabled: props.user.enabled,
    caseManagementGranted: props.user.caseManagementGranted,
    loading: true,
    pending: false,
    error: "",
    notice: "",
    quota: undefined as TokenQuotaSnapshot | undefined,
    quotaError: "",
    password: "",
    action: "" as "" | "revoke" | "password",
  })
  let active = true
  const editable = () => canManageUser(dockapi.user?.userType, state.persistedType)
  const assignable = () => dockapi.user?.userType === "super_admin" && state.persistedType !== "super_admin"
  const protectedAccount = () => state.persistedType === "super_admin"
  createEffect(() => {
    if (!assignable()) setState("userType", state.persistedType)
    if (!editable()) setState({ action: "", password: "" })
  })
  onCleanup(() => {
    active = false
  })
  const quota = () => {
    setState("quotaError", "")
    void api
      .quota(props.user.id)
      .then((value) => {
        if (active) setState("quota", value)
      })
      .catch((error) => {
        if (active) setState("quotaError", error instanceof Error ? error.message : "额度读取失败")
      })
  }
  const loadUser = () => {
    setState("loading", true)
    return api
      .user(props.user.id)
      .then((value) => {
        if (active)
          setState({
            userType: value.userType,
            persistedType: value.userType,
            vip: value.vip,
            enabled: value.enabled,
            caseManagementGranted: value.caseManagementGranted,
          })
      })
      .catch((error) => {
        if (active) setState("error", String(error))
      })
      .finally(() => {
        if (active) setState("loading", false)
      })
  }
  onMount(() => {
    void loadUser()
    quota()
  })
  const save = async (event: SubmitEvent) => {
    event.preventDefault()
    if (state.pending || state.loading || !editable()) return
    setState({ pending: true, error: "", notice: "" })
    const input: UserConfiguration = {
      userType: state.userType,
      enabled: state.enabled,
      vip: state.vip,
      caseManagementGranted: state.caseManagementGranted,
    }
    try {
      await api.updateUser(props.user.id, input)
      if (props.user.id === dockapi.user?.id) await dockapi.auth.profile()
      if (active) props.onSaved()
    } catch (error) {
      if (active) setState("error", error instanceof Error ? error.message : "保存失败")
      if (active && error instanceof DockApiError && error.status === 403) void loadUser()
    } finally {
      if (active) setState("pending", false)
    }
  }
  const confirm = async () => {
    if (state.pending || !editable()) return
    setState({ pending: true, error: "", notice: "" })
    try {
      if (state.action === "password") await api.resetPassword(props.user.id, state.password)
      else await api.revokeSessions(props.user.id)
      if (props.user.id === dockapi.user?.id) {
        await dockapi.auth.profile()
        return
      }
      if (active) setState({ action: "", password: "", notice: "操作成功，原登录会话已失效" })
    } catch (error) {
      if (active) setState("error", error instanceof Error ? error.message : "操作失败")
      if (active && error instanceof DockApiError && error.status === 403) void loadUser()
    } finally {
      if (active) setState("pending", false)
    }
  }
  return (
    <AdminModal title={`用户配置 · ${props.user.name}`} pending={state.pending} onClose={props.onClose}>
      <form onSubmit={save}>
        <div class="admin-form-body">
          <p class="admin-secondary">
            {props.user.phone} · #{props.user.id}
          </p>
          <AdminError error={state.error} />
          <Show when={state.notice}>
            <p role="status" class="admin-success">
              {state.notice}
            </p>
          </Show>
          <fieldset disabled={state.pending || state.loading || !editable()}>
            <label>
              用户类型
              <AdminSelect
                label="用户类型"
                disabled={state.pending || state.loading || !editable() || !assignable()}
                value={state.userType}
                options={
                  protectedAccount()
                    ? [{ value: "super_admin", label: "超级管理员" }]
                    : [
                        { value: "user", label: "普通用户" },
                        { value: "admin", label: "管理员" },
                      ]
                }
                onChange={(value) => setState("userType", value as ManagedUser["userType"])}
              />
            </label>
            <label class="admin-check">
              <input
                type="checkbox"
                checked={state.vip}
                onChange={(event) => setState("vip", event.currentTarget.checked)}
              />
              VIP 用户
            </label>
            <label class="admin-check">
              <input
                type="checkbox"
                checked={state.enabled}
                disabled={protectedAccount()}
                onChange={(event) => setState("enabled", event.currentTarget.checked)}
              />
              账号启用
            </label>
            <Show when={state.userType === "user"}>
              <label class="admin-check">
                <input
                  type="checkbox"
                  checked={state.caseManagementGranted}
                  onChange={(event) => setState("caseManagementGranted", event.currentTarget.checked)}
                />
                案例全局授权
              </label>
            </Show>
          </fieldset>
          <section class="admin-form-section">
            <h3>本周 Token 额度</h3>
            <AdminError error={state.quotaError} retry={quota} />
            <Show
              when={state.quota}
              fallback={
                <Show when={!state.quotaError}>
                  <p>正在读取额度...</p>
                </Show>
              }
            >
              {(value) => (
                <dl class="admin-details">
                  <div>
                    <dt>周额度</dt>
                    <dd>
                      {value().vip ? "不限额" : value().enabled ? value().weeklyLimit?.toLocaleString() : "限额未启用"}
                    </dd>
                  </div>
                  <div>
                    <dt>已消耗</dt>
                    <dd>{value().used.toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt>执行中预占</dt>
                    <dd>{value().reserved.toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt>剩余</dt>
                    <dd>{value().remaining?.toLocaleString() ?? "--"}</dd>
                  </div>
                </dl>
              )}
            </Show>
          </section>
          <Show when={editable()}>
            <section class="admin-form-section">
              <h3>账号安全</h3>
              <div class="admin-actions">
                <button
                  type="button"
                  disabled={state.pending}
                  onClick={() => setState({ action: "password", password: "", error: "" })}
                >
                  重置密码
                </button>
                <button
                  type="button"
                  disabled={state.pending}
                  onClick={() => setState({ action: "revoke", error: "" })}
                >
                  退出全部会话
                </button>
              </div>
              <Show when={state.action}>
                <div class="admin-confirm">
                  <p>
                    {state.action === "password"
                      ? "重置密码将使该用户全部原登录失效。"
                      : "确定退出该用户全部登录会话吗？"}
                  </p>
                  <Show when={state.action === "password"}>
                    <label>
                      新密码
                      <input
                        type="password"
                        autocomplete="new-password"
                        minlength={6}
                        maxlength={32}
                        value={state.password}
                        onInput={(event) => setState("password", event.currentTarget.value)}
                      />
                    </label>
                  </Show>
                  <div class="admin-actions">
                    <button
                      type="button"
                      disabled={state.pending}
                      onClick={() => setState({ action: "", password: "" })}
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      class="danger"
                      disabled={
                        state.pending ||
                        (state.action === "password" && (state.password.length < 6 || state.password.length > 32))
                      }
                      onClick={() => void confirm()}
                    >
                      确认操作
                    </button>
                  </div>
                </div>
              </Show>
            </section>
          </Show>
        </div>
        <footer>
          <button type="button" disabled={state.pending} onClick={props.onClose}>
            取消
          </button>
          <Show when={editable()}>
            <button class="primary" disabled={state.pending || state.loading}>
              {state.pending ? "处理中..." : "保存配置"}
            </button>
          </Show>
        </footer>
      </form>
    </AdminModal>
  )
}
