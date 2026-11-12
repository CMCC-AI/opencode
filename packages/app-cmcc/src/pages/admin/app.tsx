import { Show, createEffect } from "solid-js"
import { createStore } from "solid-js/store"
import { A, Navigate, Route, Router } from "@solidjs/router"
import { Icon } from "@opencode-ai/ui/icon"
import { DropdownMenu } from "@opencode-ai/ui/dropdown-menu"
import loginBackground from "@/assets/auth/login-bg.optimized.webp"
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
            <img class="admin-gate-logo" src="/brand/logo.svg" alt="" width="48" height="48" />
            <span>正在验证登录...</span>
          </main>
        }
      >
        <Show
          when={dockapi.status === "authenticated"}
          fallback={
            <main class="admin-gate admin-login-gate">
              <img class="admin-login-background" src={loginBackground} alt="" fetchpriority="high" />
              <a class="admin-login-brand" href="/app" aria-label="DeepInsight 业务端">
                <img src="/brand/mobileai-horizontal.svg" alt="移动智能 MobileAI" width="140" height="52" />
              </a>
              <section class="admin-login" aria-labelledby="admin-login-title">
                <header class="admin-login-heading">
                  <img src="/brand/logo.svg" alt="" width="36" height="36" />
                  <h1 id="admin-login-title">
                    <span>DeepInsight</span> <span>管理平台</span>
                  </h1>
                </header>
                <form onSubmit={submit}>
                  <input
                    class="admin-login-input"
                    aria-label="账号或手机号"
                    placeholder="请输入您的账号或手机号"
                    autocomplete="username"
                    required
                    maxlength={32}
                    value={form.phone}
                    onInput={(event) => setForm("phone", event.currentTarget.value)}
                  />
                  <input
                    class="admin-login-input"
                    aria-label="密码"
                    placeholder="请输入您的密码"
                    type="password"
                    autocomplete="current-password"
                    required
                    maxlength={32}
                    value={form.password}
                    onInput={(event) => setForm("password", event.currentTarget.value)}
                  />
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
            when={dockapi.user?.userType === "admin" || dockapi.user?.userType === "super_admin"}
            fallback={
              <main class="admin-gate">
                <img class="admin-gate-logo" src="/brand/logo.svg" alt="" width="48" height="48" />
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
                      <img src="/brand/mobileai-horizontal.svg" alt="移动智能 MobileAI" width="108" height="40" />
                      <span class="admin-brand-copy">
                        <strong>深度洞察</strong>
                        <span>管理平台</span>
                      </span>
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
                      <DropdownMenu gutter={8} placement="top-start" modal={false}>
                        <DropdownMenu.Trigger class="admin-user-trigger" aria-label={dockapi.user?.name ?? "用户菜单"}>
                          <span class="admin-user-avatar" aria-hidden="true">
                            {dockapi.user?.name.slice(0, 1) || "用"}
                          </span>
                          <span class="admin-user-name">{dockapi.user?.name}</span>
                          <Icon name="chevron-down" class="admin-user-chevron" />
                        </DropdownMenu.Trigger>
                        <DropdownMenu.Portal>
                          <DropdownMenu.Content class="admin-account-menu">
                            <DropdownMenu.Item onSelect={() => window.location.assign("/app")}>
                              <Icon name="dot-grid" />
                              <DropdownMenu.ItemLabel>返回业务端</DropdownMenu.ItemLabel>
                            </DropdownMenu.Item>
                            <DropdownMenu.Item onSelect={() => void dockapi.auth.logout()}>
                              <Icon name="enter" class="admin-exit-icon" />
                              <DropdownMenu.ItemLabel>退出登录</DropdownMenu.ItemLabel>
                            </DropdownMenu.Item>
                          </DropdownMenu.Content>
                        </DropdownMenu.Portal>
                      </DropdownMenu>
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
