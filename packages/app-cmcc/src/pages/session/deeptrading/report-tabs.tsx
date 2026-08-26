import { Markdown } from "@opencode-ai/session-ui/markdown"
import { Icon } from "@opencode-ai/ui/icon"
import { For, Match, Show, Switch, createEffect, createMemo, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import echartsRuntimeUrl from "../../../../node_modules/echarts/dist/echarts.min.js?url"
import { ArtifactPreview } from "@/components/artifact-preview"
import { useFile } from "@/context/file"
import { useSDK } from "@/context/sdk"
import { useServerSDK } from "@/context/server-sdk"
import { artifactText } from "@/pages/session/artifact-preview"
import { authTokenFromCredentials } from "@/utils/server"
import { showToast } from "@/utils/toast"
import type { SessionArtifact } from "../agent-workbench/model"
import { DEEPTRADING_LEAD_AGENT, deepTradingAvatar } from "./config"
import { deepTradingHtmlReportPreviewUrl } from "./html-report"
import { useDeepTradingWorkbench, type DeepTradingArtifactSource } from "./workbench-context"

export function DeepTradingFilesTab() {
  const context = useDeepTradingWorkbench()
  return (
    <Show when={context.artifactSource} keyed fallback={<LiveDeepTradingFilesTab />}>
      {(source) => <SnapshotDeepTradingFilesTab source={source} />}
    </Show>
  )
}

function LiveDeepTradingFilesTab() {
  const context = useDeepTradingWorkbench()
  const file = useFile()
  const sdk = useSDK()
  const ownerLabel = (agentId: string) => {
    if (agentId === DEEPTRADING_LEAD_AGENT) return "总览"
    const agent = context.workbench().agents.find((item) => item.id === agentId)
    return agent ? `${agent.profession} · ${agent.name}` : agentId || "未知来源"
  }
  const [state, setState] = createStore({
    selectedPath: undefined as string | undefined,
    downloading: undefined as string | undefined,
  })
  const selected = createMemo(() =>
    context.workbench().artifacts.find((artifact) => artifact.path === state.selectedPath),
  )
  const content = createMemo(() => {
    const artifact = selected()
    return artifact ? file.get(artifact.path) : undefined
  })

  createEffect(() => {
    const artifact = selected()
    if (!artifact) return
    void file.load(artifact.path)
  })

  const download = (artifact: SessionArtifact) => {
    setState("downloading", artifact.path)
    void sdk()
      .client.file.download({ path: artifact.path })
      .then((response) => {
        if (!(response.data instanceof Blob)) throw new Error("服务器未返回文件内容")
        downloadBlob(response.data, artifact.filename)
      })
      .catch((error: unknown) => {
        showToast({
          variant: "error",
          title: "文件下载失败",
          description: error instanceof Error ? error.message : String(error),
        })
      })
      .finally(() => setState("downloading", undefined))
  }

  return (
    <div class="h-full min-h-0 overflow-hidden px-4 py-4">
      <Show
        when={context.workbench().artifacts.length > 0}
        fallback={<ReportEmpty title="暂无文件产出" description="当前会话确认写入的文件会在这里逐步出现。" />}
      >
        <Show
          when={selected()}
          fallback={
            <div class="deeptrading-scrollbar h-full min-h-0 space-y-2 overflow-y-auto">
              <For each={context.workbench().artifacts}>
                {(artifact) => (
                  <article class="flex min-w-0 items-center gap-3 rounded-[8px] border border-[#e0e4eb] bg-white p-3">
                    <span class="flex size-9 shrink-0 items-center justify-center rounded-[7px] bg-[#eef2fa] text-[#5970aa]">
                      <Icon name="file-tree" class="size-4" />
                    </span>
                    <button
                      type="button"
                      class="min-w-0 flex-1 text-left"
                      onClick={() => setState("selectedPath", artifact.path)}
                    >
                      <strong class="block truncate text-[12px] font-medium leading-5 text-[#333a49]">
                        {artifact.label ?? artifact.filename}
                      </strong>
                      <span class="block truncate text-[10px] leading-4 text-[#89909f]">
                        {ownerLabel(artifact.ownerAgentId)} · {formatTimestamp(artifact.createdAt)} ·{" "}
                        {formatFileSize(artifact.sizeBytes)}
                      </span>
                    </button>
                    <div class="flex shrink-0 gap-1.5">
                      <button
                        type="button"
                        class="h-7 rounded-[6px] border border-[#d5dae5] bg-white px-2 text-[11px] text-[#5c6474] hover:bg-[#f5f7fa]"
                        onClick={() => setState("selectedPath", artifact.path)}
                      >
                        预览
                      </button>
                      <button
                        type="button"
                        disabled={state.downloading !== undefined}
                        class="flex h-7 items-center gap-1 rounded-[6px] border border-[#cbd7ef] bg-[#eef3fc] px-2 text-[11px] text-[#4e68a4] hover:bg-[#e5ecf9] disabled:opacity-50"
                        onClick={() => download(artifact)}
                      >
                        <Icon name="download" class="size-3" />
                        {state.downloading === artifact.path ? "下载中" : "下载"}
                      </button>
                    </div>
                  </article>
                )}
              </For>
            </div>
          }
        >
          {(artifact) => (
            <div class="flex size-full min-h-0 flex-col">
              <header class="mb-3 flex min-w-0 items-center gap-2">
                <button
                  type="button"
                  class="h-8 shrink-0 rounded-[6px] border border-[#d5dae5] bg-white px-2.5 text-[12px] text-[#5c6474] hover:bg-[#f5f7fa]"
                  onClick={() => setState("selectedPath", undefined)}
                >
                  返回
                </button>
                <span class="min-w-0 flex-1">
                  <strong class="block truncate text-[12px] font-medium leading-5 text-[#333a49]">
                    {artifact().label ?? artifact().filename}
                  </strong>
                  <small class="block truncate text-[10px] leading-4 text-[#89909f]">{artifact().path}</small>
                </span>
                <button
                  type="button"
                  disabled={state.downloading !== undefined}
                  class="flex h-8 shrink-0 items-center gap-1 rounded-[6px] border border-[#cbd7ef] bg-[#eef3fc] px-2.5 text-[12px] text-[#4e68a4] hover:bg-[#e5ecf9] disabled:opacity-50"
                  onClick={() => download(artifact())}
                >
                  <Icon name="download" class="size-3.5" />
                  下载
                </button>
              </header>
              <div class="min-h-0 flex-1 overflow-hidden rounded-[8px] border border-[#e0e4eb] bg-white">
                <Switch>
                  <Match when={content()?.loaded && content()?.content}>
                    <ArtifactPreview path={artifact().path} content={content()!.content!} />
                  </Match>
                  <Match when={content()?.error}>
                    {(error) => <ReportEmpty title="文件读取失败" description={error()} />}
                  </Match>
                  <Match when={true}>
                    <ReportEmpty title="正在读取文件" description="请稍候。" />
                  </Match>
                </Switch>
              </div>
            </div>
          )}
        </Show>
      </Show>
    </div>
  )
}

export function DeepTradingTextReportTab() {
  const context = useDeepTradingWorkbench()
  return (
    <Show when={context.artifactSource} keyed fallback={<LiveDeepTradingTextReportTab />}>
      {(source) => <SnapshotDeepTradingTextReportTab source={source} />}
    </Show>
  )
}

function LiveDeepTradingTextReportTab() {
  const context = useDeepTradingWorkbench()
  const file = useFile()
  const path = createMemo(() => context.workbench().textReportPath)
  const state = createMemo(() => (path() ? file.get(path()!) : undefined))

  createEffect(() => {
    const value = path()
    if (value) void file.load(value)
  })

  return (
    <ReportFileShell
      path={path()}
      state={state()}
      emptyTitle="文字报告尚未生成"
      emptyDescription="等待 30-final-report.md 写入完成。"
    >
      {(content) => (
        <div class="mx-auto w-full max-w-[860px] rounded-[8px] border border-[#e0e4eb] bg-white px-5 py-5 sm:px-7">
          <Markdown
            text={
              context.replay.isReplaying()
                ? context.replay.textReportMarkdown()
                : artifactText(content.content, content.encoding)
            }
            cacheKey={`${context.workbench().rootSessionId}:30-final-report${context.replay.isReplaying() ? ":replay" : ""}`}
            streaming={context.replay.isReplaying()}
            class="select-text text-[13px] leading-7 text-[#313847]"
          />
        </div>
      )}
    </ReportFileShell>
  )
}

export function DeepTradingVisualReportTab() {
  const context = useDeepTradingWorkbench()
  return (
    <Show when={context.artifactSource} keyed fallback={<LiveDeepTradingVisualReportTab />}>
      {(source) => <SnapshotDeepTradingVisualReportTab source={source} />}
    </Show>
  )
}

function LiveDeepTradingVisualReportTab() {
  const context = useDeepTradingWorkbench()
  const sdk = useSDK()
  const serverSDK = useServerSDK()
  const path = createMemo(() => context.workbench().visualReportPath)
  const previewUrl = createMemo(() => {
    const value = path()
    if (!value) return
    const sdkContext = sdk()
    const connection = serverSDK().server.http
    return deepTradingHtmlReportPreviewUrl({
      serverUrl: sdkContext.url,
      directory: sdkContext.directory,
      path: value,
      runtimeUrl: echartsRuntimeUrl,
      pageOrigin: window.location.origin,
      authToken: connection.password
        ? authTokenFromCredentials({ username: connection.username, password: connection.password })
        : undefined,
    })
  })

  return (
    <div class="h-full min-h-0 overflow-hidden bg-[#f7f8fb]">
      <Show
        when={previewUrl()}
        fallback={<ReportEmpty title="可视化报告尚未生成" description="等待 40-report.html 写入完成。" />}
        keyed
      >
        {(url) => (
          <iframe
            title="DeepTrading 可视化报告"
            class="block size-full min-h-[400px] border-0 bg-white"
            src={url}
            sandbox="allow-scripts"
            referrerpolicy="origin"
          />
        )}
      </Show>
    </div>
  )
}

function SnapshotDeepTradingFilesTab(props: { source: DeepTradingArtifactSource }) {
  const context = useDeepTradingWorkbench()
  const [state, setState] = createStore({
    selectedPath: undefined as string | undefined,
    downloading: undefined as string | undefined,
  })
  const selected = createMemo(() =>
    context.workbench().artifacts.find((artifact) => artifact.path === state.selectedPath),
  )
  createEffect(() => {
    const artifact = selected()
    if (artifact && isTextArtifact(artifact.path)) void props.source.load(artifact.path)
  })
  const download = (artifact: SessionArtifact) => {
    setState("downloading", artifact.path)
    void props.source
      .download(artifact.path)
      .then((blob) => downloadBlob(blob, artifact.filename))
      .catch((error: unknown) => {
        showToast({
          variant: "error",
          title: "文件下载失败",
          description: error instanceof Error ? error.message : String(error),
        })
      })
      .finally(() => setState("downloading", undefined))
  }
  return (
    <div class="h-full min-h-0 overflow-hidden px-4 py-4">
      <Show
        when={context.workbench().artifacts.length}
        fallback={<ReportEmpty title="暂无文件产出" description="该案例快照没有保存产物文件。" />}
      >
        <Show
          when={selected()}
          fallback={
            <div class="deeptrading-scrollbar h-full min-h-0 space-y-2 overflow-y-auto">
              <For each={context.workbench().artifacts}>
                {(artifact) => (
                  <article class="flex min-w-0 items-center gap-3 rounded-[8px] border border-[#e0e4eb] bg-white p-3">
                    <span class="flex size-9 shrink-0 items-center justify-center rounded-[7px] bg-[#eef2fa] text-[#5970aa]">
                      <Icon name="file-tree" class="size-4" />
                    </span>
                    <button type="button" class="min-w-0 flex-1 text-left" onClick={() => setState("selectedPath", artifact.path)}>
                      <strong class="block truncate text-[12px] font-medium leading-5 text-[#333a49]">{artifact.label ?? artifact.filename}</strong>
                      <span class="block truncate text-[10px] leading-4 text-[#89909f]">{formatFileSize(artifact.sizeBytes)}</span>
                    </button>
                    <button type="button" class="h-7 rounded-[6px] border border-[#d5dae5] px-2 text-[11px] text-[#5c6474]" onClick={() => setState("selectedPath", artifact.path)}>预览</button>
                    <button type="button" disabled={!!state.downloading} class="h-7 rounded-[6px] bg-[#eef3fc] px-2 text-[11px] text-[#4e68a4] disabled:opacity-50" onClick={() => download(artifact)}>
                      {state.downloading === artifact.path ? "下载中" : "下载"}
                    </button>
                  </article>
                )}
              </For>
            </div>
          }
        >
          {(artifact) => (
            <div class="flex size-full min-h-0 flex-col">
              <header class="mb-3 flex min-w-0 items-center gap-2">
                <button type="button" class="h-8 rounded-[6px] border border-[#d5dae5] px-2.5 text-[12px] text-[#5c6474]" onClick={() => setState("selectedPath", undefined)}>返回</button>
                <strong class="min-w-0 flex-1 truncate text-[12px] font-medium text-[#333a49]">{artifact().label ?? artifact().filename}</strong>
                <button type="button" class="h-8 rounded-[6px] bg-[#eef3fc] px-2.5 text-[12px] text-[#4e68a4]" onClick={() => download(artifact())}>下载</button>
              </header>
              <div class="deeptrading-scrollbar min-h-0 flex-1 overflow-auto rounded-[8px] border border-[#e0e4eb] bg-white">
                <SnapshotArtifactPreview path={artifact().path} source={props.source} />
              </div>
            </div>
          )}
        </Show>
      </Show>
    </div>
  )
}

function SnapshotDeepTradingTextReportTab(props: { source: DeepTradingArtifactSource }) {
  const context = useDeepTradingWorkbench()
  const path = createMemo(() => context.workbench().textReportPath)
  createEffect(() => {
    const value = path()
    if (value) void props.source.load(value)
  })
  const content = createMemo(() => {
    const value = path()
    return value ? props.source.get(value) : undefined
  })
  return (
    <div class="deeptrading-scrollbar h-full min-h-0 overflow-y-auto bg-[#f7f8fb] px-4 py-4">
      <Show when={path()} fallback={<ReportEmpty title="文字报告尚未生成" description="案例快照中没有 30-final-report.md。" />}>
        <Show when={context.replay.isReplaying() || content()?.loaded} fallback={<ReportEmpty title="正在读取报告" description="请稍候。" />}>
          <div class="mx-auto w-full max-w-[860px] rounded-[8px] border border-[#e0e4eb] bg-white px-5 py-5 sm:px-7">
            <Markdown
              text={context.replay.isReplaying() ? context.replay.textReportMarkdown() : content()?.text ?? ""}
              cacheKey={`${context.workbench().rootSessionId}:case-report${context.replay.isReplaying() ? ":replay" : ""}`}
              streaming={context.replay.isReplaying()}
              class="select-text text-[13px] leading-7 text-[#313847]"
            />
          </div>
        </Show>
      </Show>
    </div>
  )
}

function SnapshotDeepTradingVisualReportTab(props: { source: DeepTradingArtifactSource }) {
  const context = useDeepTradingWorkbench()
  const url = createMemo(() => {
    const path = context.workbench().visualReportPath
    return path ? props.source.previewUrl(path) : undefined
  })
  return (
    <div class="h-full min-h-0 overflow-hidden bg-[#f7f8fb]">
      <Show when={url()} keyed fallback={<ReportEmpty title="可视化报告尚未生成" description="案例快照中没有 40-report.html。" />}>
        {(value) => <iframe title="DeepTrading 案例可视化报告" class="block size-full min-h-[400px] border-0 bg-white" src={value} sandbox="allow-scripts" referrerpolicy="origin" />}
      </Show>
    </div>
  )
}

function SnapshotArtifactPreview(props: { path: string; source: DeepTradingArtifactSource }) {
  const extension = () => props.path.split(".").at(-1)?.toLowerCase()
  const content = () => props.source.get(props.path)
  if (isTextArtifact(props.path)) {
    return (
      <Switch>
        <Match when={content()?.loaded && extension() === "md"}>
          <div class="p-5"><Markdown text={content()?.text ?? ""} cacheKey={`case-artifact:${props.path}`} class="select-text text-[13px] leading-7 text-[#313847]" /></div>
        </Match>
        <Match when={content()?.loaded}>
          <pre class="m-0 whitespace-pre-wrap break-words p-5 text-[12px] leading-6 text-[#313847]">{content()?.text}</pre>
        </Match>
        <Match when={content()?.error}><ReportEmpty title="文件读取失败" description={content()?.error ?? ""} /></Match>
        <Match when={true}><ReportEmpty title="正在读取文件" description="请稍候。" /></Match>
      </Switch>
    )
  }
  const url = () => props.source.previewUrl(props.path)
  if (["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(extension() ?? "")) {
    return <div class="flex min-h-full items-center justify-center p-4"><img src={url()} alt="" class="max-h-full max-w-full object-contain" /></div>
  }
  if (["html", "htm", "pdf"].includes(extension() ?? "")) {
    return <iframe title={props.path} class="block size-full min-h-[480px] border-0" src={url()} sandbox={extension() === "pdf" ? undefined : "allow-scripts"} />
  }
  return <ReportEmpty title="该文件暂不支持在线预览" description="请下载后查看。" />
}

function isTextArtifact(path: string) {
  return ["md", "txt", "json", "csv", "html", "htm", "xml", "yaml", "yml"].includes(path.split(".").at(-1)?.toLowerCase() ?? "") && !/[.]html?$/i.test(path)
}

function ReportFileShell(props: {
  path?: string
  state?: ReturnType<ReturnType<typeof useFile>["get"]>
  emptyTitle: string
  emptyDescription: string
  children: (content: NonNullable<ReturnType<ReturnType<typeof useFile>["get"]>["content"]>) => JSX.Element
}) {
  return (
    <div class="deeptrading-scrollbar h-full min-h-0 overflow-y-auto bg-[#f7f8fb] px-4 py-4">
      <Show when={props.path} fallback={<ReportEmpty title={props.emptyTitle} description={props.emptyDescription} />}>
        <Switch>
          <Match when={props.state?.loaded && props.state.content}>{props.children(props.state!.content!)}</Match>
          <Match when={props.state?.error}>
            {(error) => <ReportEmpty title="报告读取失败" description={error()} />}
          </Match>
          <Match when={true}>
            <ReportEmpty title="正在读取报告" description="请稍候。" />
          </Match>
        </Switch>
      </Show>
    </div>
  )
}

export function ReportEmpty(props: { title: string; description: string }) {
  return (
    <div class="flex h-full min-h-52 flex-col items-center justify-center px-6 text-center">
      <strong class="text-[13px] font-medium leading-5 text-[#4c5464]">{props.title}</strong>
      <span class="mt-1 max-w-sm text-[11px] leading-5 text-[#8a91a0]">{props.description}</span>
    </div>
  )
}

function formatTimestamp(value?: number) {
  if (!value) return "生成时间未返回"
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value)
}

function formatFileSize(value?: number) {
  if (value === undefined) return "大小未返回"
  if (value < 1024) return `${value}B`
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)}KB`
  return `${(value / 1024 / 1024).toFixed(1)}MB`
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
