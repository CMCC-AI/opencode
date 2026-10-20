import { Markdown } from "@opencode-ai/session-ui/markdown"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Icon } from "@opencode-ai/ui/icon"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { For, Index, Show, createEffect, createMemo, on, onCleanup, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import { showToast } from "@/utils/toast"
import type { AgentNodeView, AgentWorkbench, WorkbenchMessage } from "./model"
import { completedExpertElapsed } from "./session-adapter"
import { groupWorkbenchMessages } from "./conversation-turns"

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
  header: () => JSX.Element
}) {
  const messages = createMemo(
    () =>
      props.messages ?? (props.markdown ? [{ id: "legacy", role: "assistant" as const, text: props.markdown }] : []),
  )
  const turns = createMemo(() => groupWorkbenchMessages(messages()))
  return (
    <Show
      when={turns().length}
      fallback={
        <>
          {props.header()}
          {props.empty}
        </>
      }
    >
      <div class="space-y-5" data-component="workbench-conversation">
        <Index each={turns()}>
          {(turn) => (
            <div class="min-w-0 space-y-5" data-workbench-turn={turn().id}>
              <Show when={turn().user}>
                {(user) => <WorkbenchMessagePanel message={user()} cacheKey={`${props.cacheKey}:${user().id}`} />}
              </Show>
              <section class="min-w-0" data-component="workbench-response">
                <div data-component="workbench-expert-header">{props.header()}</div>
                <Show when={turn().replies.length} fallback={props.empty}>
                  <div
                    data-component="workbench-response-card"
                    class="w-full min-w-0 space-y-5 rounded-[8px] border border-[#e3e6ed] bg-white px-5 py-5 shadow-[0_2px_10px_rgba(36,42,60,0.04)] sm:px-7"
                  >
                    <Index each={turn().replies}>
                      {(message) => (
                        <WorkbenchMessagePanel
                          message={message()}
                          cacheKey={`${props.cacheKey}:${message().id}`}
                          streaming={props.streaming && message().completedAt === undefined}
                        />
                      )}
                    </Index>
                  </div>
                  <WorkbenchMessageFooter messages={turn().replies} cacheKey={`${props.cacheKey}:${turn().id}`} />
                </Show>
              </section>
            </div>
          )}
        </Index>
      </div>
    </Show>
  )
}

function WorkbenchMessagePanel(props: { message: WorkbenchMessage; cacheKey: string; streaming?: boolean }) {
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
          <Markdown
            text={props.message.text}
            cacheKey={props.cacheKey}
            streaming={!!props.streaming}
            class="cmcc-markdown select-text"
          />
        }
      >
        <div class="max-w-[85%] whitespace-pre-wrap break-words rounded-[8px] bg-[#e9ecf3] px-4 py-3 text-[14px] leading-6 text-[#323949]">
          {props.message.text}
        </div>
      </Show>
      <Show when={props.message.attachments?.length}>
        <div class="mt-2 flex max-w-[85%] flex-wrap justify-end gap-2" data-component="workbench-attachments">
          <For each={props.message.attachments}>
            {(file) => (
              <div
                class="flex min-w-0 max-w-full items-center gap-2 rounded-[6px] border border-[#dce3f1] bg-white px-3 py-2 text-[12px] text-[#536078]"
                title={file.filename}
              >
                <Icon name="folder" class="size-4 shrink-0" />
                <span class="truncate">{file.filename}</span>
              </div>
            )}
          </For>
        </div>
      </Show>
      <Show when={props.message.role === "user"}>
        <WorkbenchMessageFooter messages={[props.message]} cacheKey={props.cacheKey} />
      </Show>
    </article>
  )
}

function WorkbenchMessageFooter(props: { messages: WorkbenchMessage[]; cacheKey: string }) {
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
    const value = props.messages[0]?.createdAt
    if (value === undefined || !Number.isFinite(value)) return undefined
    const date = new Date(value)
    return Number.isFinite(date.getTime()) ? date : undefined
  })
  const models = createMemo(() => [...new Set(props.messages.map((message) => message.modelID || "模型未知"))])
  const label = () => (props.messages[0]?.role === "user" ? "复制消息" : "复制全部回复")
  const copy = async () => {
    const text = props.messages
      .map((message) => message.text)
      .filter((value) => value.trim())
      .join("\n\n")
    if (!(await copyMessage(text))) {
      showToast({ variant: "error", title: "复制失败", description: "请选中正文手动复制。" })
      return
    }
    setState("copied", true)
    clearTimeout(timer)
    timer = setTimeout(() => setState("copied", false), 2000)
  }
  return (
    <footer
      data-component="workbench-message-footer"
      class="mt-1 flex max-w-full flex-wrap items-center gap-x-2 gap-y-1 text-[11px] leading-5 text-[#7a8292]"
    >
      <Tooltip value={state.copied ? "已复制" : label()}>
        <IconButton
          type="button"
          icon={state.copied ? "check" : "copy"}
          aria-label={state.copied ? "已复制" : label()}
          onClick={() => void copy()}
        />
      </Tooltip>
      <Show when={time()} fallback={<span>时间未知</span>}>
        {(date) => <time dateTime={date().toISOString()}>{date().toLocaleString("zh-CN", { hour12: false })}</time>}
      </Show>
      <Show when={props.messages[0]?.role === "assistant"}>
        <For each={models()}>
          {(model) => (
            <span
              class="break-all"
              title={[
                ...new Set(
                  props.messages
                    .filter((message) => (message.modelID || "模型未知") === model)
                    .map((message) => message.providerID)
                    .filter(Boolean),
                ),
              ].join("、")}
            >
              {model}
            </span>
          )}
        </For>
      </Show>
    </footer>
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
