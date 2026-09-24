import { Markdown } from "@opencode-ai/session-ui/markdown"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { Index, Show, createEffect, createMemo, on, onCleanup, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import { showToast } from "@/utils/toast"
import type { AgentNodeView, AgentWorkbench, WorkbenchMessage } from "./model"
import { completedExpertElapsed } from "./session-adapter"

export function WorkbenchQuery(props: { workbench: AgentWorkbench; overview: boolean }) {
  const message = createMemo(() => props.workbench.overviewMessages?.find((item) => item.role === "user"))
  return (
    <Show when={!props.overview || props.workbench.overviewMessages === undefined}>
      <Show when={props.workbench.query}>
        <div class="mb-5">
          <WorkbenchMessagePanel
            message={message() ?? { id: "query", role: "user", text: props.workbench.query }}
            cacheKey={`${props.workbench.rootSessionId}:query`}
          />
        </div>
      </Show>
    </Show>
  )
}

export function WorkbenchConversation(props: {
  messages?: WorkbenchMessage[]
  markdown: string
  cacheKey: string
  streaming: boolean
  empty: JSX.Element
}) {
  const messages = createMemo(
    () =>
      props.messages ?? (props.markdown ? [{ id: "legacy", role: "assistant" as const, text: props.markdown }] : []),
  )
  return (
    <Show when={messages().length} fallback={props.empty}>
      <div class="space-y-5" data-component="workbench-conversation">
        <Index each={messages()}>
          {(message) => (
            <WorkbenchMessagePanel
              message={message()}
              cacheKey={`${props.cacheKey}:${message().id}`}
              streaming={props.streaming && message().role === "assistant" && message().completedAt === undefined}
            />
          )}
        </Index>
      </div>
    </Show>
  )
}

function WorkbenchMessagePanel(props: { message: WorkbenchMessage; cacheKey: string; streaming?: boolean }) {
  const [state, setState] = createStore({ copied: false })
  let timer: ReturnType<typeof setTimeout> | undefined
  onCleanup(() => clearTimeout(timer))
  createEffect(
    on(
      () => props.cacheKey,
      () => {
        clearTimeout(timer)
        setState("copied", false)
      },
    ),
  )
  const time = createMemo(() => {
    const value = props.message.createdAt
    if (value === undefined || !Number.isFinite(value)) return undefined
    const date = new Date(value)
    return Number.isFinite(date.getTime()) ? date : undefined
  })
  const copy = async () => {
    if (!(await copyMessage(props.message.text))) {
      showToast({ variant: "error", title: "复制失败", description: "请选中正文手动复制。" })
      return
    }
    setState("copied", true)
    clearTimeout(timer)
    timer = setTimeout(() => setState("copied", false), 2000)
  }
  return (
    <article
      data-workbench-message={props.message.id}
      data-role={props.message.role}
      class="min-w-0"
      classList={{ "flex flex-col items-end": props.message.role === "user" }}
    >
      <Show
        when={props.message.role === "user"}
        fallback={
          <div class="w-full min-w-0 rounded-[8px] border border-[#e3e6ed] bg-white px-5 py-5 shadow-[0_2px_10px_rgba(36,42,60,0.04)] sm:px-7">
            <Markdown
              text={props.message.text}
              cacheKey={props.cacheKey}
              streaming={!!props.streaming}
              class="select-text text-[14px] leading-7 text-[#2f3543]"
            />
          </div>
        }
      >
        <div class="max-w-[85%] whitespace-pre-wrap break-words rounded-[8px] bg-[#e9ecf3] px-4 py-3 text-[14px] leading-6 text-[#323949]">
          {props.message.text}
        </div>
      </Show>
      <footer class="mt-1 flex max-w-full flex-wrap items-center gap-x-2 gap-y-1 text-[11px] leading-5 text-[#7a8292]">
        <Tooltip value={state.copied ? "已复制" : "复制消息"}>
          <IconButton
            type="button"
            icon={state.copied ? "check" : "copy"}
            aria-label={state.copied ? "已复制" : "复制消息"}
            onClick={() => void copy()}
          />
        </Tooltip>
        <Show when={time()} fallback={<span>时间未知</span>}>
          {(date) => <time dateTime={date().toISOString()}>{date().toLocaleString("zh-CN", { hour12: false })}</time>}
        </Show>
        <Show when={props.message.role === "assistant"}>
          <span class="break-all" title={props.message.providerID}>
            {props.message.modelID || "模型未知"}
          </span>
        </Show>
      </footer>
    </article>
  )
}

export function WorkbenchExpertDuration(props: { node: Pick<AgentNodeView, "status" | "startedAt" | "completedAt"> }) {
  const elapsed = createMemo(() => completedExpertElapsed(props.node))
  const label = createMemo(() => {
    const seconds = Math.floor((elapsed() ?? 0) / 1000)
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    return `${hours ? `${hours}时` : ""}${minutes ? `${minutes}分` : ""}${seconds % 60}秒`
  })
  return (
    <Show when={elapsed() !== undefined}>
      <div data-component="expert-duration" class="mt-3 text-right text-[12px] leading-5 text-[#7a8292]">
        用时 {label()}
      </div>
    </Show>
  )
}

async function copyMessage(text: string) {
  // The deployed HTTP origin cannot use the secure-context Clipboard API.
  const textarea = document.createElement("textarea")
  textarea.value = text
  textarea.setAttribute("readonly", "")
  textarea.style.cssText = "position:fixed;opacity:0;pointer-events:none"
  document.body.appendChild(textarea)
  const focused = document.activeElement
  try {
    textarea.select()
    if (document.execCommand("copy")) return true
  } catch {
    // Some browsers expose only the asynchronous clipboard API.
  } finally {
    textarea.remove()
    if (focused instanceof HTMLElement) focused.focus({ preventScroll: true })
  }
  if (!navigator.clipboard?.writeText) return false
  return navigator.clipboard.writeText(text).then(
    () => true,
    () => false,
  )
}
