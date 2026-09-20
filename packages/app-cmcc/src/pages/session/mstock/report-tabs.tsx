import { Markdown } from "@opencode-ai/session-ui/markdown"
import { Icon } from "@opencode-ai/ui/icon"
import { For, Match, Show, Switch, createEffect, createMemo } from "solid-js"
import { createStore } from "solid-js/store"
import { ArtifactPreview } from "@/components/artifact-preview"
import { useFile } from "@/context/file"
import { useSDK } from "@/context/sdk"
import { showToast } from "@/utils/toast"
import type { SessionArtifact } from "../agent-workbench/model"
import { workbenchFiles } from "../agent-workbench/artifact-files"
import { SnapshotFilesTab } from "../agent-workbench/snapshot-report-tabs"
import { ReportArtifactPreview } from "../report-artifact-preview"
import { MSTOCK_LEAD_AGENT } from "./config"
import { useMstockWorkbench } from "./workbench-context"

export function MstockFilesTab() {
  const context = useMstockWorkbench()
  const files = createMemo(() => workbenchFiles(context.workbench()))
  const ownerLabel = (agentId: string) => {
    if (agentId === MSTOCK_LEAD_AGENT) return "总览"
    const agent = context.workbench().agents.find((item) => item.id === agentId)
    return agent ? `${agent.profession} · ${agent.name}` : agentId || "未知来源"
  }
  if (context.artifactSource) {
    return (
      <SnapshotFilesTab
        artifacts={files}
        source={context.artifactSource}
        emptyDescription="该案例快照没有保存多股对比产物文件。"
        ownerLabel={(artifact) => ownerLabel(artifact.ownerAgentId)}
      />
    )
  }
  const file = useFile()
  const sdk = useSDK()
  const [state, setState] = createStore({
    selectedPath: undefined as string | undefined,
    downloading: undefined as string | undefined,
  })
  const selected = createMemo(() => files().find((artifact) => artifact.path === state.selectedPath))
  const content = createMemo(() => {
    const artifact = selected()
    return artifact ? file.get(artifact.path) : undefined
  })
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
        when={files().length > 0}
        fallback={<ReportEmpty title="暂无文件产出" description="当前多股对比会话确认写入的文件会在这里逐步出现。" />}
      >
        <Show
          when={selected()}
          fallback={
            <div class="deeptrading-scrollbar h-full min-h-0 space-y-2 overflow-y-auto">
              <For each={files()}>
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
                        {artifact.filename}
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

export function MstockTextReportTab() {
  const context = useMstockWorkbench()
  return (
    <Show
      when={context.replay.isReplaying()}
      fallback={
        <ReportArtifactPreview
          artifacts={workbenchFiles(context.workbench()).filter(
            (file) => !/(?:^|\/)(?:inputs|attachments)\//.test(file.path),
          )}
          artifactSource={context.artifactSource}
          kind="text"
          preferredPath={context.workbench().textReportPath}
          empty={<ReportEmpty title="文字报告尚未生成" description="等待 MD、DOCX 或 PDF 格式的产物生成。" />}
        />
      }
    >
      <div class="deeptrading-scrollbar h-full min-h-0 overflow-y-auto bg-[#f7f8fb] px-4 py-4">
        <div class="mx-auto w-full max-w-[860px] rounded-[8px] border border-[#e0e4eb] bg-white px-5 py-5 sm:px-7">
          <Markdown
            text={context.replay.textReportMarkdown()}
            cacheKey={`${context.workbench().rootSessionId}:mstock-report:replay`}
            streaming
            class="select-text text-[13px] leading-7 text-[#313847]"
          />
        </div>
      </div>
    </Show>
  )
}

export function MstockVisualReportTab() {
  const context = useMstockWorkbench()
  return (
    <ReportArtifactPreview
      artifacts={workbenchFiles(context.workbench()).filter(
        (file) => !/(?:^|\/)(?:inputs|attachments)\//.test(file.path),
      )}
      artifactSource={context.artifactSource}
      kind="visual"
      preferredPath={context.workbench().visualReportPath}
      empty={<ReportEmpty title="可视化报告尚未生成" description="等待 HTML 格式的报告生成。" />}
    />
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
