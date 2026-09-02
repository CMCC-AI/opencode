import { Markdown } from "@opencode-ai/session-ui/markdown"
import { Icon } from "@opencode-ai/ui/icon"
import { For, Match, Show, Switch, createEffect, createMemo } from "solid-js"
import { createStore } from "solid-js/store"
import { ArtifactPreview } from "@/components/artifact-preview"
import { useFile } from "@/context/file"
import { useSDK } from "@/context/sdk"
import { artifactText } from "@/pages/session/artifact-preview"
import { showToast } from "@/utils/toast"
import type { SessionArtifact } from "../agent-workbench/model"
import { DEEPINSPECT_LEAD_AGENT } from "./config"
import { DeepInspectVisualReportView } from "./visual-report-view"
import { parseDeepInspectVisualReport } from "./visual-report"
import { useDeepInspectWorkbench } from "./workbench-context"

export function DeepInspectFilesTab() {
  const context = useDeepInspectWorkbench()
  const file = useFile()
  const sdk = useSDK()
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
  const ownerLabel = (agentId: string) => {
    if (agentId === DEEPINSPECT_LEAD_AGENT) return "总览"
    const agent = context.workbench().agents.find((item) => item.id === agentId)
    return agent ? `${agent.profession} · ${agent.name}` : agentId || "未知来源"
  }

  createEffect(() => {
    const artifact = selected()
    if (artifact) void file.load(artifact.path)
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
        fallback={<ReportEmpty title="暂无文件产出" description="当前巡查会话确认写入的文件会在这里逐步出现。" />}
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

export function DeepInspectTextReportTab() {
  const context = useDeepInspectWorkbench()
  const file = useFile()
  const path = createMemo(() => context.workbench().textReportPath)
  const state = createMemo(() => (path() ? file.get(path()!) : undefined))

  createEffect(() => {
    const value = path()
    if (value) void file.load(value)
  })

  return (
    <div class="deeptrading-scrollbar h-full min-h-0 overflow-y-auto bg-[#f7f8fb] px-4 py-4">
      <Show
        when={path()}
        fallback={<ReportEmpty title="文字报告尚未生成" description="等待 20-report.md 写入完成。" />}
      >
        <Switch>
          <Match when={context.replay.isReplaying() || (state()?.loaded && state()?.content)}>
            <div class="mx-auto w-full max-w-[860px] rounded-[8px] border border-[#e0e4eb] bg-white px-5 py-5 sm:px-7">
              <Markdown
                text={
                  context.replay.isReplaying()
                    ? context.replay.textReportMarkdown()
                    : state()?.content
                      ? artifactText(state()!.content!.content, state()!.content!.encoding)
                      : ""
                }
                cacheKey={`${context.workbench().rootSessionId}:deepinspect-report${context.replay.isReplaying() ? ":replay" : ""}`}
                streaming={context.replay.isReplaying()}
                class="select-text text-[13px] leading-7 text-[#313847]"
              />
            </div>
          </Match>
          <Match when={state()?.error}>
            {(error) => <ReportEmpty title="文字报告读取失败" description={error()} />}
          </Match>
          <Match when={state()?.loaded}>
            <ReportEmpty title="文字报告内容为空" description="20-report.md 没有可展示内容。" />
          </Match>
          <Match when={true}>
            <ReportEmpty title="正在读取文字报告" description="请稍候。" />
          </Match>
        </Switch>
      </Show>
    </div>
  )
}

export function DeepInspectVisualReportTab() {
  const context = useDeepInspectWorkbench()
  const file = useFile()
  const path = createMemo(() => context.workbench().visualReportPath)
  const textPath = createMemo(() => context.workbench().textReportPath)
  const visualState = createMemo(() => (path() ? file.get(path()!) : undefined))
  const textState = createMemo(() => (textPath() ? file.get(textPath()!) : undefined))

  createEffect(() => {
    const value = path()
    if (value) void file.load(value)
  })
  createEffect(() => {
    const value = textPath()
    if (value) void file.load(value)
  })

  const parsed = createMemo(() => {
    const content = visualState()?.content
    return content ? parseDeepInspectVisualReport(artifactText(content.content, content.encoding)) : undefined
  })
  const markdown = createMemo(() => {
    const content = textState()?.content
    return content ? artifactText(content.content, content.encoding) : ""
  })

  return (
    <div class="deeptrading-scrollbar h-full min-h-0 overflow-y-auto bg-[#f7f8fb] px-4 py-4">
      <Show
        when={path()}
        fallback={<ReportEmpty title="可视化报告尚未生成" description="等待 25-visual-report.json 写入完成。" />}
      >
        <Switch>
          <Match when={parsed()?.report}>
            {(report) => (
              <DeepInspectVisualReportView
                report={report()}
                markdown={markdown()}
                cacheKey={`${context.workbench().rootSessionId}:deepinspect-visual`}
              />
            )}
          </Match>
          <Match when={parsed()?.error}>
            {(error) => <ReportEmpty title="可视化报告格式暂不支持" description={error()} />}
          </Match>
          <Match when={visualState()?.error}>
            {(error) => <ReportEmpty title="可视化报告读取失败" description={error()} />}
          </Match>
          <Match when={true}>
            <ReportEmpty title="正在读取可视化报告" description="请稍候。" />
          </Match>
        </Switch>
      </Show>
    </div>
  )
}

function ReportEmpty(props: { title: string; description: string }) {
  return (
    <div class="flex size-full min-h-52 flex-col items-center justify-center px-6 text-center">
      <strong class="text-[14px] font-medium text-[#424a5b]">{props.title}</strong>
      <span class="mt-1 text-[12px] leading-5 text-[#8a91a0]">{props.description}</span>
    </div>
  )
}

function formatTimestamp(value?: number) {
  if (!value) return "时间未知"
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(value)
}

function formatFileSize(value?: number) {
  if (value === undefined) return "大小未知"
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
