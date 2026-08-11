import { DeepInsightMark } from "@cmcc/components/brand"
import { DockApiError, useDockApi } from "@cmcc/dockapi"
import { Show, type ParentProps } from "solid-js"
import { createStore } from "solid-js/store"

export function DockApiAuthGate(props: ParentProps) {
  const dockapi = useDockApi()
  const [form, setForm] = createStore({
    mode: "login" as "login" | "register",
    name: "",
    phone: "",
    password: "",
    pending: false,
    error: "",
    notice: "",
  })

  const submit = async (event: SubmitEvent) => {
    event.preventDefault()
    if (form.pending) return
    setForm({ pending: true, error: "", notice: "" })
    try {
      if (form.mode === "register") {
        await dockapi.auth.register({ name: form.name.trim(), phone: form.phone.trim(), password: form.password })
        setForm({ mode: "login", password: "", notice: "注册成功，请登录" })
        return
      }
      await dockapi.auth.login({ phone: form.phone.trim(), password: form.password })
    } catch (error) {
      setForm("error", error instanceof DockApiError ? error.message : "请求失败，请稍后重试")
    } finally {
      setForm("pending", false)
    }
  }

  return (
    <Show
      when={dockapi.status !== "loading"}
      fallback={
        <div class="flex h-dvh w-screen items-center justify-center bg-white">
          <DeepInsightMark class="h-16 w-12 animate-pulse opacity-50" />
        </div>
      }
    >
      <Show
        when={dockapi.status === "authenticated" && dockapi.workspace}
        fallback={
          <main class="relative flex h-dvh w-screen items-center justify-center overflow-hidden bg-white px-5">
            <div class="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(230,137,221,0.16),transparent_34%),radial-gradient(circle_at_82%_78%,rgba(102,174,255,0.2),transparent_38%)]" />
            <section class="relative w-full max-w-[400px] rounded-[8px] border border-v2-border-border-base bg-white p-8 shadow-[0_18px_60px_rgba(70,90,140,0.14)]">
              <div class="mb-7 flex items-center gap-3">
                <DeepInsightMark class="h-11 w-9" />
                <div>
                  <h1 class="text-20-medium text-v2-text-text-strong">DockAPI</h1>
                  <p class="mt-1 text-13-regular text-v2-text-text-muted">登录后进入智能分析工作台</p>
                </div>
              </div>
              <div class="mb-6 grid grid-cols-2 border-b border-v2-border-border-base">
                <button
                  type="button"
                  class="h-10 border-b-2 text-14-medium"
                  classList={{
                    "border-v2-border-border-active text-v2-text-text-strong": form.mode === "login",
                    "border-transparent text-v2-text-text-muted": form.mode !== "login",
                  }}
                  onClick={() => setForm({ mode: "login", error: "", notice: "" })}
                >
                  登录
                </button>
                <button
                  type="button"
                  class="h-10 border-b-2 text-14-medium"
                  classList={{
                    "border-v2-border-border-active text-v2-text-text-strong": form.mode === "register",
                    "border-transparent text-v2-text-text-muted": form.mode !== "register",
                  }}
                  onClick={() => setForm({ mode: "register", error: "", notice: "" })}
                >
                  注册
                </button>
              </div>
              <form class="flex flex-col gap-4" onSubmit={submit}>
                <Show when={form.mode === "register"}>
                  <label class="flex flex-col gap-2 text-13-medium text-v2-text-text-base">
                    姓名
                    <input
                      class="h-10 rounded-[6px] border border-v2-border-border-base bg-white px-3 text-14-regular outline-none transition-colors focus:border-v2-border-border-active"
                      autocomplete="name"
                      maxlength={64}
                      required
                      value={form.name}
                      onInput={(event) => setForm("name", event.currentTarget.value)}
                    />
                  </label>
                </Show>
                <label class="flex flex-col gap-2 text-13-medium text-v2-text-text-base">
                  手机号
                  <input
                    class="h-10 rounded-[6px] border border-v2-border-border-base bg-white px-3 text-14-regular outline-none transition-colors focus:border-v2-border-border-active"
                    autocomplete="tel"
                    maxlength={32}
                    required
                    value={form.phone}
                    onInput={(event) => setForm("phone", event.currentTarget.value)}
                  />
                </label>
                <label class="flex flex-col gap-2 text-13-medium text-v2-text-text-base">
                  密码
                  <input
                    class="h-10 rounded-[6px] border border-v2-border-border-base bg-white px-3 text-14-regular outline-none transition-colors focus:border-v2-border-border-active"
                    type="password"
                    autocomplete={form.mode === "login" ? "current-password" : "new-password"}
                    minlength={form.mode === "register" ? 6 : undefined}
                    maxlength={32}
                    required
                    value={form.password}
                    onInput={(event) => setForm("password", event.currentTarget.value)}
                  />
                </label>
                <Show when={form.error}>
                  <p class="text-13-regular text-red-600">{form.error}</p>
                </Show>
                <Show when={form.notice}>
                  <p class="text-13-regular text-blue-600">{form.notice}</p>
                </Show>
                <button
                  type="submit"
                  class="mt-2 h-10 rounded-[6px] bg-[#3478f6] text-14-medium text-white transition-colors hover:bg-[#2868dd] disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={form.pending}
                >
                  {form.pending ? "请稍候..." : form.mode === "login" ? "登录" : "注册"}
                </button>
              </form>
            </section>
          </main>
        }
      >
        {props.children}
      </Show>
    </Show>
  )
}
