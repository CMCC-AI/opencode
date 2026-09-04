import { Icon } from "@opencode-ai/ui/icon"
import { For, Match, Show, Switch, createEffect, createMemo } from "solid-js"
import { createStore } from "solid-js/store"
import { ArtifactPreview } from "@/components/artifact-preview"
import { useFile } from "@/context/file"
import { useSDK } from "@/context/sdk"
import { showToast } from "@/utils/toast"
import type { SessionArtifact } from "../agent-workbench/model"
import { buildAiScienceArtifactTree, type AiScienceArtifactTreeNode } from "./data"
import { useAiScienceWorkbench } from "./workbench-context"

export function AiScienceFilesTab() {
  const context = useAiScienceWorkbench()
  const file = useFile()
  const sdk = useSDK()
  const [state, setState] = createStore({
    selectedPath: undefined as string | undefined,
    downloading: undefined as string | undefined,
    expanded: {} as Record<string, boolean | undefined>,
  })
  const selected = createMemo(() =>
    context.workbench().artifacts.find((artifact) => artifact.path === state.selectedPath),
  )
  const tree = createMemo(() => buildAiScienceArtifactTree(context.workbench().artifacts, context.artifactRoot()))
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
        when={context.workbench().artifacts.length > 0}
        fallback={
          <ReportEmpty
            title={context.filesLoading() ? "正在读取科研产物" : "暂无文件产出"}
            description={context.filesLoading() ? "正在扫描当前会话的独立产物目录。" : "当前会话尚未生成可展示文件。"}
          />
        }
      >
        <Show
          when={selected()}
          fallback={
            <div class="flex size-full min-h-0 flex-col overflow-hidden rounded-[8px] border border-[#e0e4eb] bg-white">
              <header class="flex h-11 shrink-0 items-center justify-between border-b border-[#edf0f5] px-3">
                <span class="flex min-w-0 items-center gap-2">
                  <Icon name="file-tree" class="size-4 shrink-0 text-[#5871aa]" />
                  <strong class="truncate text-[12px] font-medium text-[#333a49]">科研产物</strong>
                </span>
                <small class="shrink-0 text-[10px] text-[#89909f]">
                  {context.workbench().artifacts.length} 个文件
                </small>
              </header>
              <div class="deeptrading-scrollbar min-h-0 flex-1 overflow-y-auto py-1.5">
                <ArtifactTree
                  nodes={tree()}
                  depth={0}
                  selectedPath={state.selectedPath}
                  expanded={state.expanded}
                  toggle={(path) => setState("expanded", path, !state.expanded[path])}
                  select={(artifact) => setState("selectedPath", artifact.path)}
                />
              </div>
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
                    {artifact().filename}
                  </strong>
                  <small class="block truncate text-[10px] leading-4 text-[#89909f]">
                    {artifact().path} · {ownerLabel(artifact())}
                  </small>
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

function ArtifactTree(props: {
  nodes: AiScienceArtifactTreeNode[]
  depth: number
  selectedPath?: string
  expanded: Readonly<Record<string, boolean | undefined>>
  toggle: (path: string) => void
  select: (artifact: SessionArtifact) => void
}) {
  return (
    <For each={props.nodes}>
      {(node) => (
        <Show
          when={!node.artifact}
          fallback={
            <button
              type="button"
              data-selected={props.selectedPath === node.path ? "" : undefined}
              class="flex h-8 w-full min-w-0 items-center gap-2 pr-3 text-left text-[11px] text-[#535c6d] hover:bg-[#f4f6fa] data-[selected]:bg-[#edf2fc] data-[selected]:text-[#3f5f9f]"
              style={{ "padding-left": `${12 + props.depth * 14}px` }}
              title={node.path}
              onClick={() => node.artifact && props.select(node.artifact)}
            >
              <Icon name="code-lines" class="size-3.5 shrink-0 text-[#8090b1]" />
              <span class="truncate">{node.name}</span>
            </button>
          }
        >
          <button
            type="button"
            aria-expanded={!!props.expanded[node.path]}
            class="flex h-8 w-full min-w-0 items-center gap-1.5 pr-3 text-left text-[11px] font-medium text-[#485267] hover:bg-[#f4f6fa]"
            style={{ "padding-left": `${8 + props.depth * 14}px` }}
            title={node.path}
            onClick={() => props.toggle(node.path)}
          >
            <Icon name={props.expanded[node.path] ? "chevron-down" : "chevron-right"} class="size-3 shrink-0" />
            <Icon name="file-tree" class="size-3.5 shrink-0 text-[#687fae]" />
            <span class="truncate">{node.name}</span>
            <small class="ml-auto shrink-0 text-[9px] font-normal text-[#9aa1ad]">{countFiles(node)}</small>
          </button>
          <Show when={props.expanded[node.path]}>
            <ArtifactTree {...props} nodes={node.children} depth={props.depth + 1} />
          </Show>
        </Show>
      )}
    </For>
  )
}

export function AiScienceTextReportTab() {
  return (
    <div class="h-full min-h-0 bg-[#f7f8fb] px-4 py-4">
      <ReportEmpty
        title="文字报告尚未生成"
        description="当前 AI for Science 会话没有唯一的文字报告产物，已生成内容可在文件页查看。"
      />
    </div>
  )
}

export function AiScienceVisualReportTab() {
  return (
    <div class="h-full min-h-0 bg-[#f7f8fb] px-4 py-4">
      <ReportEmpty
        title="可视化报告尚未生成"
        description="当前 AI for Science 会话没有统一的可视化报告格式，图片和数据文件可在文件页查看。"
      />
    </div>
  )
}

function ReportEmpty(props: { title: string; description: string }) {
  return (
    <div class="flex size-full min-h-48 flex-col items-center justify-center rounded-[8px] border border-dashed border-[#d9dde6] bg-white px-6 text-center">
      <strong class="text-[14px] font-medium text-[#414958]">{props.title}</strong>
      <span class="mt-1 max-w-[420px] text-[12px] leading-5 text-[#8a91a0]">{props.description}</span>
    </div>
  )
}

function countFiles(node: AiScienceArtifactTreeNode): number {
  if (node.artifact) return 1
  return node.children.reduce((total, child) => total + countFiles(child), 0)
}

function ownerLabel(artifact: SessionArtifact) {
  return artifact.ownerAgentId ? `来源 ${artifact.ownerAgentId}` : "运行产物"
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
