import { Show, createEffect } from "solid-js"
import { createStore } from "solid-js/store"
import { A, Navigate, Route, Router } from "@solidjs/router"
import { Icon } from "@opencode-ai/ui/icon"
import { useDockApi } from "@/context/dockapi"
import { AdminError } from "./shared"
import { AdminUsers } from "./users"
import { CaseManagementPanel } from "./cases"
import "./admin.css"

export default function AdminApp() {
  const dockapi = useDockApi()
  const [form, setForm] = createStore({ phone: "", password: "", pending: false, error: "" })
  const submit = async (event: SubmitEvent) => {
    event.preventDefault()
    if (form.pending) return
    setForm({ pending: true, error: "" })
    try {
      await dockapi.auth.login({ phone: form.phone.trim(), password: form.password })
      setForm("password", "")
    } catch (error) {
      setForm("error", error instanceof Error ? error.message : "登录失败")
    } finally {
      setForm("pending", false)
    }
  }
  createEffect(() => {
    if (dockapi.status === "unauthenticated") setForm("password", "")
  })
  return (
    <div class="admin-ui admin-root" data-page="admin">
      <Show
        when={dockapi.status !== "loading"}
        fallback={
          <main class="admin-gate" role="status">
            正在验证登录...
          </main>
        }
      >
        <Show
          when={dockapi.status === "authenticated"}
          fallback={
            <main class="admin-gate">
              <section class="admin-login">
                <Icon name="shield" class="admin-login-mark" />
                <h1>DeepInsight 管理平台</h1>
                <form onSubmit={submit}>
                  <label>
                    手机号
                    <input
                      autocomplete="username"
                      required
                      maxlength={32}
                      value={form.phone}
                      onInput={(event) => setForm("phone", event.currentTarget.value)}
                    />
                  </label>
                  <label>
                    密码
                    <input
                      type="password"
                      autocomplete="current-password"
                      required
                      maxlength={32}
                      value={form.password}
                      onInput={(event) => setForm("password", event.currentTarget.value)}
                    />
                  </label>
                  <AdminError error={form.error} />
                  <button class="primary" disabled={form.pending}>
                    {form.pending ? "登录中..." : "登录"}
                  </button>
                </form>
                <a href="/app">返回业务端</a>
              </section>
            </main>
          }
        >
          <Show
            when={dockapi.user?.userType === "admin"}
            fallback={
              <main class="admin-gate">
                <h1>当前账号无管理权限</h1>
                <div class="admin-actions">
                  <a href="/app">返回业务端</a>
                  <button onClick={() => void dockapi.auth.logout()}>退出登录</button>
                </div>
              </main>
            }
          >
            <Router
              root={(props) => (
                <div class="admin-shell">
                  <aside class="admin-sidebar">
                    <a class="admin-brand" href="/admin/users">
                      <Icon name="shield" />
                      <strong>DeepInsight</strong>
                      <span>管理平台</span>
                    </a>
                    <nav aria-label="管理导航">
                      <A href="/admin/users" activeClass="selected">
                        <Icon name="sliders" />
                        用户管理
                      </A>
                      <A href="/admin/cases" activeClass="selected">
                        <Icon name="archive" />
                        案例管理
                      </A>
                    </nav>
                    <div class="admin-account">
                      <span>{dockapi.user?.name}</span>
                      <a href="/app">
                        <Icon name="arrow-left" />
                        返回业务端
                      </a>
                      <button onClick={() => void dockapi.auth.logout()}>
                        <Icon name="enter" />
                        退出登录
                      </button>
                    </div>
                  </aside>
                  <main class="admin-main">{props.children}</main>
                </div>
              )}
            >
              <Route path="/admin" component={() => <Navigate href="/admin/users" />} />
              <Route path="/admin/users" component={AdminUsers} />
              <Route path="/admin/cases" component={() => <CaseManagementPanel />} />
              <Route path="/admin/*" component={() => <Navigate href="/admin/users" />} />
            </Router>
          </Show>
        </Show>
      </Show>
    </div>
  )
}
