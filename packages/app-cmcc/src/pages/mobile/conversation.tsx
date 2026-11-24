import type { Message, Session } from "@opencode-ai/sdk/v2/client"
import { createEffect, createMemo, createResource, createSignal, For, on, onCleanup, Show } from "solid-js"
import { DropdownMenu } from "@opencode-ai/ui/dropdown-menu"
import { Icon } from "@opencode-ai/ui/icon"
import { Markdown } from "@opencode-ai/session-ui/markdown"
import lingxi from "@/assets/chat/draft-lingxi.png"
import deepinsight from "@/assets/chat/team-avatars/deepinsight.png"
import finance from "@/assets/chat/team-avatars/deeptrading.png"
import shopping from "@/assets/chat/team-avatars/shoppers-pro.png"
import sidebarIcons from "@/assets/sidebar/menu-icons.svg?url"
import { PromptInput } from "@/components/prompt-input"
import { useLocal } from "@/context/local"
import { usePrompt } from "@/context/prompt"
import { useSDK } from "@/context/sdk"
import { useServerSync } from "@/context/server-sync"
import { useSync } from "@/context/sync"
import { useTabs } from "@/context/tabs"
import { createPromptInputController } from "@/pages/session/composer"
import { SessionQuestionDock as QuestionDock } from "@/pages/session/composer/session-question-dock"
import { SessionPermissionDock as PermissionDock } from "@/pages/session/composer/session-permission-dock"
import { useSessionKey } from "@/pages/session/session-layout"
import { createTimelineModel } from "@/pages/session/timeline/model"
import { artifactReportFiles } from "@/pages/session/artifact-preview"
import { scanSessionArtifactFiles, sessionArtifactRoot } from "@/pages/session/agent-workbench/artifact-files"
import { QUICK_PRESETS_BY_TEAM } from "@/utils/quick-presets"
import { showToast } from "@/utils/toast"
import type { MobileAssistant } from "./history"
import { financeAnalysisAgent, mobileAssistants, mobileSkills } from "./assistants"

const avatars: Partial<Record<MobileAssistant, string>> = { lingxi, deepinsight, finance, shopping }
const assistants = Object.keys(mobileAssistants) as MobileAssistant[]
const presets = QUICK_PRESETS_BY_TEAM.deeptrading
const researchReports = new Set(["50-report.md", "65-quick-report.html", "66-quick-report.pdf"])

function AssistantAvatar(props: { assistant: MobileAssistant }) {
  return <Show when={avatars[props.assistant]} fallback={
    <span class="di-mobile-lens-avatar" aria-hidden="true">
      <svg><use href={`${sidebarIcons}#lens`} /></svg>
    </span>
  }>
    {(url) => <img src={url()} alt="" />}
  </Show>
}

export function MobileConversation(props: {
  draftID?: string
  session?: Session
  existing?: { assistant: MobileAssistant; agent: string }
}) {
  const sdk = useSDK()
  const sync = useSync()
  const serverSync = useServerSync()
  const tabs = useTabs()
  const local = useLocal()
  const prompt = usePrompt()
  const route = useSessionKey()
  const id = () => props.session?.id
  const info = () => id() ? sync().session.get(id()!) ?? props.session : undefined
  const draftAgent = () => props.draftID ? tabs.draft(props.draftID).agent : undefined
  const [assistant, setAssistant] = createSignal<MobileAssistant>(
    props.existing?.assistant ?? assistants.find((key) => mobileAssistants[key].agent === draftAgent()) ??
    (draftAgent() === financeAnalysisAgent ? "finance" : "lingxi"),
  )
  const [group, setGroup] = createSignal(draftAgent() === financeAnalysisAgent ? presets.groups[0]?.id ?? "" : "")
  const [item, setItem] = createSignal("")
  const controls = createPromptInputController({ sessionKey: route.sessionKey, sessionID: id, queryOptions: serverSync().queryOptions })
  const available = (key: MobileAssistant) => {
    const agent = mobileAssistants[key].agent
    return !!agent && ((key !== "deepinsight" && key !== "deeplens") || controls().agents.available.some((entry) => entry.name === agent))
  }
  const agent = () => props.existing?.agent ?? (assistant() === "finance" && group() ? financeAnalysisAgent : mobileAssistants[assistant()].agent)
  const setDraftAgent = (key: MobileAssistant, next: string | undefined) => {
    if (props.draftID) tabs.updateDraft(props.draftID, { agent: next, expertID: mobileAssistants[key].expertID })
  }
  const select = (key: MobileAssistant) => {
    if (!available(key)) return
    setAssistant(key)
    setGroup("")
    setItem("")
    setDraftAgent(key, mobileAssistants[key].agent)
  }
  const setCategory = (next: string) => {
    setGroup(next)
    setItem("")
    setDraftAgent("finance", next ? financeAnalysisAgent : mobileAssistants.finance.agent)
  }
  const applyPreset = (text: string) => prompt.set([
    { type: "text", content: text, start: 0, end: text.length },
    ...prompt.current().filter((part) => part.type === "image"),
  ], text.length)
  const selectedGroup = createMemo(() => presets.groups.find((entry) => entry.id === group()))
  const timeline = createTimelineModel({ sessionID: id, revertMessageID: () => info()?.revert?.messageID })
  const visible = createMemo(() => {
    const limit = info()?.revert?.messageID
    return timeline.messages().filter((message) =>
      !limit || (message.role === "user" ? message.id < limit : message.parentID < limit))
  })
  createEffect(on(() => timeline.lastUserMessage()?.id, () => {
    const latest = timeline.lastUserMessage()
    if (latest) local.session.restore(latest)
  }))
  createEffect(() => {
    const sessionID = id()
    if (!sessionID) return
    serverSync().session.pin(sessionID)
    onCleanup(() => serverSync().session.unpin(sessionID))
  })
  const working = () => sync().data.session_working(id() ?? "")
  let scroll!: HTMLDivElement
  let follow = true
  const downloadFiles = () => id() && !working() && assistant() !== "deeplens"
    ? sessionArtifactRoot(sdk().directory, info()?.metadata)
    : undefined
  const [files, fileActions] = createResource(downloadFiles, async (root) => {
    const { paths } = await scanSessionArtifactFiles({
      directory: sdk().directory,
      root,
      list: async (path) => (await sdk().client.file.list({ path }, { throwOnError: true })).data ?? [],
    })
    const list = paths.filter((path) =>
      !/(?:^|\/)(?:inputs|attachments)\//.test(path) &&
      (assistant() !== "deepinsight" || researchReports.has(path.split("/").at(-1) ?? "")),
    ).map((path) => ({ path }))
    return [...artifactReportFiles(list, "text"), ...artifactReportFiles(list, "visual")]
  })
  const [downloading, setDownloading] = createSignal("")
  const download = async (path: string) => {
    if (downloading()) return
    setDownloading(path)
    try {
      const result = await sdk().client.file.download({ path }, { parseAs: "blob", throwOnError: true })
      if (result.data instanceof Blob) downloadMobileBlob(result.data, path.split("/").at(-1)!)
      else throw new Error("报告不可下载")
    } catch {
      showToast({ variant: "error", title: "报告下载失败" })
    } finally {
      setDownloading("")
    }
  }
  const [retrying, setRetrying] = createSignal(false)
  const retry = async () => {
    if (!id() || retrying()) return
    setRetrying(true)
    try {
      await sync().session.sync(id()!, { force: true })
    } catch {
      showToast({ variant: "error", title: "对话加载失败，请重试" })
    } finally {
      setRetrying(false)
    }
  }
  const question = () => id() ? sync().data.question[id()!]?.[0] : undefined
  const permission = () => id() ? sync().data.permission[id()!]?.[0] : undefined
  const [responding, setResponding] = createSignal(false)
  const decide = async (response: "once" | "always" | "reject") => {
    const request = permission()
    if (!request || responding()) return
    setResponding(true)
    try {
      await sdk().client.permission.reply({ requestID: request.id, reply: response }, { throwOnError: true })
    } catch {
      showToast({ variant: "error", title: "权限操作失败" })
    } finally {
      setResponding(false)
    }
  }
  return (
    <div class="di-mobile-conversation">
      <Show when={id()} fallback={
        <section class="di-mobile-greeting">
          <div class="di-mobile-assistant">
            <AssistantAvatar assistant={assistant()} />
            <span>您好，我是</span>
            <DropdownMenu placement="bottom-start">
              <DropdownMenu.Trigger class="di-mobile-assistant-trigger" aria-label="选择助手">
                {mobileAssistants[assistant()].name}<Icon name="chevron-down" />
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content class="di-mobile-assistant-menu">
                  <For each={assistants}>
                    {(key) => <DropdownMenu.Item disabled={!available(key)} onSelect={() => select(key)}>
                      <AssistantAvatar assistant={key} />
                      <DropdownMenu.ItemLabel>{mobileAssistants[key].name}</DropdownMenu.ItemLabel>
                      <Show when={available(key)} fallback={<small>暂未开放</small>}>
                        <Show when={key === assistant()}><Icon name="check" /></Show>
                      </Show>
                    </DropdownMenu.Item>}
                  </For>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu>
          </div>
          <h2>DeepInsight深度洞察</h2>
          <p>您的私人研究助理，一键生成博士级深度研究报告，AI赋能产业洞察</p>
        </section>
      }>
        <div ref={scroll} class="di-mobile-scroll" onScroll={() => {
          follow = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 80
        }}>
          <div class="di-mobile-messages" ref={(el) => {
            const observer = new ResizeObserver(() => { if (follow && scroll) scroll.scrollTop = scroll.scrollHeight })
            observer.observe(el)
            onCleanup(() => observer.disconnect())
          }}>
            <Show when={timeline.ready()} fallback={
              <Show when={timeline.resource.error} fallback={<p class="di-mobile-state" role="status">正在加载对话…</p>}>
                <button class="di-mobile-history-status" type="button" disabled={retrying()} onClick={() => void retry()}>加载失败，重试</button>
              </Show>
            }>
              <Show when={timeline.history.more()}>
                <button class="di-mobile-history-status" type="button" disabled={timeline.history.loading()} onClick={() => {
                  const before = scroll.scrollHeight
                  follow = false
                  void timeline.history.loadOlder({ after: (ok) => {
                    if (ok) requestAnimationFrame(() => { scroll.scrollTop += scroll.scrollHeight - before })
                  } }).catch(() => showToast({ variant: "error", title: "历史消息加载失败" }))
                }}>加载更早消息</button>
              </Show>
              <For each={visible()}>{(message) => <MobileMessage message={message} assistant={assistant()} />}</For>
              <Show when={working()}><p class="di-mobile-status" role="status">正在回复…</p></Show>
              <Show when={!files.error} fallback={<button class="di-mobile-history-status" type="button" onClick={() => void fileActions.refetch()}>报告列表加载失败，重试</button>}>
                <For each={downloadFiles() ? files.latest ?? [] : []}>
                  {(file) => <button class="di-mobile-download" type="button" disabled={!!downloading()} onClick={() => void download(file.path)}>
                    <Icon name="download" />
                    <span>{file.path.split("/").at(-1)}</span>
                  </button>}
                </For>
              </Show>
            </Show>
          </div>
        </div>
      </Show>
      <div class="di-mobile-compose">
        <Show when={!id() && assistant() === "finance"}>
          <div class="di-mobile-finance">
            <div class="di-mobile-finance-modes" role="group" aria-label="财经模式">
              <button type="button" aria-pressed={!group()} onClick={() => {
                setCategory("")
                if (presets.lite.prompt) applyPreset(presets.lite.prompt)
              }}>快速问答</button>
              <label classList={{ active: !!group() }}>
                <select aria-label="财经分析分类" value={group()} onChange={(e) => setCategory(e.currentTarget.value)}>
                  <option value="" disabled hidden>行业分析</option>
                  <For each={presets.groups}>{(entry) => <option value={entry.id}>{entry.label}</option>}</For>
                </select>
                <Icon name="chevron-down" />
              </label>
            </div>
            <Show when={selectedGroup()}>
              {(entry) => <div class="di-mobile-finance-items" role="group" aria-label="财经分析小类">
                <For each={entry().items}>{(preset) => <button type="button" aria-pressed={item() === preset.id} onClick={() => {
                  setItem(preset.id)
                  applyPreset(preset.prompt)
                }}>{preset.label}</button>}</For>
              </div>}
            </Show>
          </div>
        </Show>
        <Show when={question()} fallback={
          <Show when={permission()} keyed fallback={
            <PromptInput
              controls={controls()}
              variant="mobile"
              mobileImages={assistant() === "deeplens"}
              mobileUnavailable={!available(assistant())}
              artifactSkill={mobileSkills[assistant()]}
              selectedExpertAgent={agent()}
              onSubmit={() => { follow = true }}
            />
          }>
            {(request) => <PermissionDock request={request} responding={responding()} onDecide={(response) => void decide(response)} />}
          </Show>
        } keyed>
          {(request) => <QuestionDock request={request} onSubmit={() => { follow = true }} />}
        </Show>
      </div>
    </div>
  )
}

function MobileMessage(props: { message: Message; assistant: MobileAssistant }) {
  const sync = useSync()
  const user = () => props.message.role === "user"
  const parts = () => sync().data.part[props.message.id] ?? []
  const text = () => parts().filter((part) => part.type === "text" && !part.synthetic && !part.ignored)
  const process = () => parts().filter((part) => part.type === "reasoning" || part.type === "tool")
  const error = () => props.message.role === "assistant" ? props.message.error : undefined
  return (
    <Show when={user() || text().length || process().length || error()}>
      <article class="di-mobile-turn" data-speaker={user() ? "user" : "assistant"}>
        <Show when={!user()}>
          <header><AssistantAvatar assistant={props.assistant} />{mobileAssistants[props.assistant].name}</header>
        </Show>
        <Show when={process().length}>
          <details class="di-mobile-process">
            <summary>过程消息</summary>
            <For each={process()}>{(part) => <p>{part.type === "tool" ? part.tool : part.type === "reasoning" ? part.text : ""}</p>}</For>
          </details>
        </Show>
        <For each={text()}>{(part) => <Show when={part.type === "text" ? part : undefined}>
          {(value) => user() ? <p>{value().text}</p> : <Markdown text={value().text} cacheKey={value().id} />}
        </Show>}</For>
        <For each={parts()}>{(part) => <Show when={user() && part.type === "file" ? part : undefined}>
          {(value) => <span class="di-mobile-attachment"><Icon name="file-tree" />{value().filename ?? "附件"}</span>}
        </Show>}</For>
        <Show when={error()}><p class="di-mobile-status" role="status">回复未完成，请重新发送。</p></Show>
      </article>
    </Show>
  )
}

export function downloadMobileBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}
