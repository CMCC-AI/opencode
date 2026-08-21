import { Markdown } from "@opencode-ai/session-ui/markdown"
import { Icon } from "@opencode-ai/ui/icon"
import { For, Match, Show, Switch, createEffect, createMemo, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import echartsRuntimeUrl from "../../../../node_modules/echarts/dist/echarts.min.js?url"
import { ArtifactPreview } from "@/components/artifact-preview"
import { useFile } from "@/context/file"
import { useSDK } from "@/context/sdk"
import { artifactText } from "@/pages/session/artifact-preview"
import { showToast } from "@/utils/toast"
import type { SessionArtifact } from "../agent-workbench/model"
import { DEEPTRADING_LEAD_AGENT, deepTradingAvatar } from "./config"
import { prepareDeepTradingHtmlReport } from "./html-report"
import { useDeepTradingWorkbench } from "./workbench-context"

export function DeepTradingFilesTab() {
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
            <div class="h-full min-h-0 overflow-y-auto space-y-2">
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
            text={artifactText(content.content, content.encoding)}
            cacheKey={`${context.workbench().rootSessionId}:30-final-report`}
            class="select-text text-[13px] leading-7 text-[#313847]"
          />
        </div>
      )}
    </ReportFileShell>
  )
}

export function DeepTradingVisualReportTab() {
  const context = useDeepTradingWorkbench()
  const file = useFile()
  const path = createMemo(() => context.workbench().visualReportPath)
  const state = createMemo(() => (path() ? file.get(path()!) : undefined))

  createEffect(() => {
    const value = path()
    if (value) void file.load(value)
  })

  return (
    <ReportFileShell
      path={path()}
      state={state()}
      emptyTitle="可视化报告尚未生成"
      emptyDescription="等待 40-report.html 写入完成。"
    >
      {(content) => {
        const prepared = createMemo(() =>
          prepareDeepTradingHtmlReport(artifactText(content.content, content.encoding), echartsRuntimeUrl),
        )
        return (
          <Show
            when={prepared().document}
            fallback={<ReportEmpty title="可视化报告加载失败" description={prepared().error ?? "HTML 报告无效"} />}
            keyed
          >
            {(document) => (
              <iframe
                title={prepared().title}
                class="block size-full min-h-[400px] border-0 bg-white"
                srcdoc={document}
                sandbox="allow-popups allow-scripts"
                referrerpolicy="no-referrer"
              />
            )}
          </Show>
        )
      }}
    </ReportFileShell>
  )
}

function ReportFileShell(props: {
  path?: string
  state?: ReturnType<ReturnType<typeof useFile>["get"]>
  emptyTitle: string
  emptyDescription: string
  children: (content: NonNullable<ReturnType<ReturnType<typeof useFile>["get"]>["content"]>) => JSX.Element
}) {
  return (
    <div class="h-full min-h-0 overflow-y-auto bg-[#f7f8fb] px-4 py-4">
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
