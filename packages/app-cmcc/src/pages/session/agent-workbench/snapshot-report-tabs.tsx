import { Markdown } from "@opencode-ai/session-ui/markdown"
import { Icon } from "@opencode-ai/ui/icon"
import { For, Match, Show, Switch, createEffect, createMemo, type Accessor } from "solid-js"
import { createStore } from "solid-js/store"
import { PdfPreview } from "@/components/pdf-preview-lazy"
import { showToast } from "@/utils/toast"
import type { AgentArtifactSource } from "./artifact-source"
import type { SessionArtifact } from "./model"

export function SnapshotFilesTab(props: {
  artifacts: Accessor<readonly SessionArtifact[]>
  source: AgentArtifactSource
  emptyDescription: string
  ownerLabel?: (artifact: SessionArtifact) => string
}) {
  const [state, setState] = createStore({
    selectedPath: undefined as string | undefined,
    downloading: undefined as string | undefined,
  })
  const selected = createMemo(() => props.artifacts().find((artifact) => artifact.path === state.selectedPath))

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
        when={props.artifacts().length > 0}
        fallback={<SnapshotReportEmpty title="暂无文件产出" description={props.emptyDescription} />}
      >
        <Show
          when={selected()}
          fallback={
            <div class="deeptrading-scrollbar h-full min-h-0 space-y-2 overflow-y-auto">
              <For each={props.artifacts()}>
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
                        {props.ownerLabel?.(artifact) ?? "案例产物"} · {formatTimestamp(artifact.createdAt)} ·{" "}
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
                        class="h-7 rounded-[6px] bg-[#eef3fc] px-2 text-[11px] text-[#4e68a4] disabled:opacity-50"
                        onClick={() => download(artifact)}
                      >
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
                  class="h-8 shrink-0 rounded-[6px] bg-[#eef3fc] px-2.5 text-[12px] text-[#4e68a4] disabled:opacity-50"
                  onClick={() => download(artifact())}
                >
                  下载
                </button>
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

export function SnapshotTextReportTab(props: {
  path: Accessor<string | undefined>
  source: AgentArtifactSource
  replaying: Accessor<boolean>
  replayMarkdown: Accessor<string>
  cacheKey: Accessor<string>
  emptyDescription: string
}) {
  createEffect(() => {
    const path = props.path()
    if (path) void props.source.load(path)
  })
  const content = createMemo(() => {
    const path = props.path()
    return path ? props.source.get(path) : undefined
  })

  return (
    <div class="deeptrading-scrollbar h-full min-h-0 overflow-y-auto bg-[#f7f8fb] px-4 py-4">
      <Show
        when={props.path()}
        fallback={<SnapshotReportEmpty title="文字报告尚未生成" description={props.emptyDescription} />}
      >
        <Switch>
          <Match when={props.replaying() || content()?.loaded}>
            <div class="mx-auto w-full max-w-[860px] rounded-[8px] border border-[#e0e4eb] bg-white px-5 py-5 sm:px-7">
              <Markdown
                text={props.replaying() ? props.replayMarkdown() : (content()?.text ?? "")}
                cacheKey={props.cacheKey()}
                streaming={props.replaying()}
                class="cmcc-markdown select-text"
              />
            </div>
          </Match>
          <Match when={content()?.error}>
            {(error) => <SnapshotReportEmpty title="文字报告读取失败" description={error()} />}
          </Match>
          <Match when={true}>
            <SnapshotReportEmpty title="正在读取文字报告" description="请稍候。" />
          </Match>
        </Switch>
      </Show>
    </div>
  )
}

export function SnapshotArtifactPreview(props: { path: string; source: AgentArtifactSource }) {
  const extension = () => props.path.split(".").at(-1)?.toLowerCase()
  const textArtifact = () => isTextArtifact(props.path)
  const content = () => props.source.get(props.path)

  createEffect(() => {
    if (textArtifact()) void props.source.load(props.path)
  })

  if (textArtifact()) {
    return (
      <Switch>
        <Match when={content()?.loaded && extension() === "md"}>
          <div class="p-5">
            <Markdown
              text={content()?.text ?? ""}
              cacheKey={`case-artifact:${props.path}`}
              class="cmcc-markdown select-text"
            />
          </div>
        </Match>
        <Match when={content()?.loaded}>
          <pre class="m-0 whitespace-pre-wrap break-words p-5 text-[12px] leading-6 text-[#313847]">
            {content()?.text}
          </pre>
        </Match>
        <Match when={content()?.error}>
          <SnapshotReportEmpty title="文件读取失败" description={content()?.error ?? ""} />
        </Match>
        <Match when={true}>
          <SnapshotReportEmpty title="正在读取文件" description="请稍候。" />
        </Match>
      </Switch>
    )
  }

  const url = () => props.source.previewUrl(props.path)
  if (["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(extension() ?? "")) {
    return (
      <div class="flex min-h-full items-center justify-center p-4">
        <img
          src={url()}
          alt={props.path.split("/").at(-1) ?? "案例图片"}
          class="max-h-full max-w-full object-contain"
        />
      </div>
    )
  }
  if (extension() === "pdf") {
    return (
      <Show when={url()} fallback={<SnapshotReportEmpty title="PDF 预览地址不可用" description="请下载后查看。" />}>
        {(src) => <PdfPreview title={props.path} src={src()} />}
      </Show>
    )
  }
  if (["html", "htm"].includes(extension() ?? "")) {
    return (
      <iframe
        title={props.path}
        class="block size-full min-h-[480px] border-0"
        src={url()}
        sandbox="allow-scripts"
      />
    )
  }
  return <SnapshotReportEmpty title="该文件暂不支持在线预览" description="请下载后查看。" />
}

export function SnapshotReportEmpty(props: { title: string; description: string }) {
  return (
    <div class="flex size-full min-h-52 flex-col items-center justify-center px-6 text-center">
      <strong class="text-[14px] font-medium text-[#424a5b]">{props.title}</strong>
      <span class="mt-1 max-w-[420px] text-[12px] leading-5 text-[#8a91a0]">{props.description}</span>
    </div>
  )
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

function isTextArtifact(path: string) {
  return ["md", "txt", "json", "csv", "xml", "yaml", "yml"].includes(path.split(".").at(-1)?.toLowerCase() ?? "")
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
