import loginBackground from "@/assets/auth/login-bg.png"
import { DeepInsightMark } from "@/components/brand"
import { DockApiError, useDockApi } from "@/context/dockapi"
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
          <main class="fixed inset-0 flex items-center justify-end overflow-hidden max-lg:justify-center">
            <img class="absolute inset-0 size-full object-cover" src={loginBackground} alt="" />
            <section class="relative z-10 mr-[8%] w-[420px] rounded-[16px] bg-[rgba(255,255,255,0.92)] px-10 py-9 shadow-[0_8px_40px_rgba(0,0,0,0.08)] backdrop-blur-[20px] max-lg:mx-5 max-lg:w-full max-lg:max-w-[420px] max-sm:px-6">
              <div class="mb-6">
                <h1 class="m-0 text-[24px] font-bold leading-[1.4] text-[#1a1a2e]">欢迎登录</h1>
                <p class="mt-1 text-[13px] leading-5 text-[#999]">DeepInsight AI Assistant</p>
              </div>
              <div class="mb-7 flex gap-6 border-b-2 border-[#f0f0f0]">
                <button
                  type="button"
                  class="mb-[-2px] border-b-2 pb-[10px] text-[15px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#5b3cc4]/20"
                  classList={{
                    "border-[#3b3dbf] font-semibold text-[#1a1a2e]": form.mode === "login",
                    "border-transparent text-[#999] hover:text-[#666]": form.mode !== "login",
                  }}
                  onClick={() => setForm({ mode: "login", error: "", notice: "" })}
                >
                  登入
                </button>
                <button
                  type="button"
                  class="mb-[-2px] border-b-2 pb-[10px] text-[15px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#5b3cc4]/20"
                  classList={{
                    "border-[#3b3dbf] font-semibold text-[#1a1a2e]": form.mode === "register",
                    "border-transparent text-[#999] hover:text-[#666]": form.mode !== "register",
                  }}
                  onClick={() => setForm({ mode: "register", error: "", notice: "" })}
                >
                  注册
                </button>
              </div>
              <form class="flex flex-col gap-4" onSubmit={submit}>
                <Show when={form.mode === "register"}>
                  <input
                    class="h-[46px] w-full rounded-[8px] border border-[#e0e0e0] bg-white px-4 text-[14px] text-[#333] outline-none transition-[border-color,box-shadow] placeholder:text-[#bbb] focus:border-[#5b3cc4] focus:shadow-[0_0_0_3px_rgba(91,60,196,0.08)]"
                    aria-label="姓名"
                    autocomplete="name"
                    maxlength={64}
                    placeholder="请输入您的姓名"
                    required
                    value={form.name}
                    onInput={(event) => setForm("name", event.currentTarget.value)}
                  />
                </Show>
                <input
                  class="h-[46px] w-full rounded-[8px] border border-[#e0e0e0] bg-white px-4 text-[14px] text-[#333] outline-none transition-[border-color,box-shadow] placeholder:text-[#bbb] focus:border-[#5b3cc4] focus:shadow-[0_0_0_3px_rgba(91,60,196,0.08)]"
                  aria-label="手机号"
                  autocomplete="tel"
                  maxlength={32}
                  placeholder="请输入您的手机号"
                  required
                  value={form.phone}
                  onInput={(event) => setForm("phone", event.currentTarget.value)}
                />
                <input
                  class="h-[46px] w-full rounded-[8px] border border-[#e0e0e0] bg-white px-4 text-[14px] text-[#333] outline-none transition-[border-color,box-shadow] placeholder:text-[#bbb] focus:border-[#5b3cc4] focus:shadow-[0_0_0_3px_rgba(91,60,196,0.08)]"
                  aria-label="密码"
                  type="password"
                  autocomplete={form.mode === "login" ? "current-password" : "new-password"}
                  minlength={form.mode === "register" ? 6 : undefined}
                  maxlength={32}
                  placeholder="请输入您的密码"
                  required
                  value={form.password}
                  onInput={(event) => setForm("password", event.currentTarget.value)}
                />
                <Show when={form.error}>
                  <p class="text-[13px] leading-5 text-red-600">{form.error}</p>
                </Show>
                <Show when={form.notice}>
                  <p class="text-[13px] leading-5 text-[#5b3cc4]">{form.notice}</p>
                </Show>
                <button
                  type="submit"
                  class="mt-1 h-12 w-full rounded-[8px] bg-[linear-gradient(135deg,#4338ca_0%,#5b3cc4_50%,#6d28d9_100%)] text-[16px] font-semibold tracking-[2px] text-white transition-[transform,box-shadow,opacity] hover:-translate-y-px hover:shadow-[0_4px_16px_rgba(91,60,196,0.35)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-none"
                  style={{ color: "#fff" }}
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
