import type { FileContent } from "@opencode-ai/sdk/v2"
import { Markdown } from "@opencode-ai/session-ui/markdown"
import { useFileComponent } from "@opencode-ai/ui/context/file"
import { Match, Show, Switch, createEffect, createMemo, onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import { Dynamic } from "solid-js/web"
import { ExcelPreview } from "@cmcc/components/excel-preview"
import {
  artifactBuffer,
  artifactDataUrl,
  artifactImageMimeType,
  artifactPreviewKind,
  artifactText,
  type ArtifactPreviewKind,
} from "@cmcc/pages/session/artifact-preview"

export function ArtifactPreview(props: {
  path: string
  content: FileContent
  markdownCacheKey?: string
  htmlTitle?: string
  htmlDescription?: string
  unsupportedDescription?: string
  pdfSrc?: string
}) {
  const fileComponent = useFileComponent()
  const kind = createMemo(() => artifactPreviewKind(props.path))
  const text = createMemo(() => artifactText(props.content.content, props.content.encoding))
  const data = createMemo(() => artifactBuffer(props.content.content, props.content.encoding))

  return (
    <Switch>
      <Match when={kind() === "docx"}>
        <OfficePreview kind="docx" data={data()} />
      </Match>
      <Match when={kind() === "excel"}>
        <ExcelPreview data={data()} />
      </Match>
      <Match when={kind() === "pptx"}>
        <OfficePreview kind="pptx" data={data()} />
      </Match>
      <Match when={kind() === "pdf"}>
        <iframe
          title={fileName(props.path)}
          class="size-full border-0 bg-white"
          src={props.pdfSrc ?? artifactDataUrl(props.content, "application/pdf")}
          referrerpolicy="no-referrer"
        />
      </Match>
      <Match when={kind() === "image"}>
        <ImagePreview path={props.path} content={props.content} />
      </Match>
      <Match when={kind() === "markdown"}>
        <div class="size-full overflow-auto px-6 py-5">
          <Markdown text={text()} cacheKey={props.markdownCacheKey} class="select-text" />
        </div>
      </Match>
      <Match when={kind() === "html"}>
        <PreviewEmpty
          title={props.htmlTitle ?? "已在浏览器中打开"}
          description={props.htmlDescription ?? "HTML 产出会在右栏浏览器的隔离沙箱中直接运行。"}
        />
      </Match>
      <Match when={kind() === "unsupported"}>
        <PreviewEmpty
          title="暂不支持内嵌预览"
          description={props.unsupportedDescription ?? "可使用右上角“下载”保存到本地后打开。"}
        />
      </Match>
      <Match when={true}>
        <div class="size-full overflow-auto">
          <Dynamic
            component={fileComponent}
            mode="text"
            file={{ name: fileName(props.path), contents: text() }}
            class="select-text"
          />
        </div>
      </Match>
    </Switch>
  )
}

function ImagePreview(props: { path: string; content: FileContent }) {
  const source = createMemo(() =>
    artifactDataUrl(props.content, artifactImageMimeType(props.path, props.content.mimeType)),
  )
  const [state, setState] = createStore({
    fit: true,
    scale: 1,
    checkerboard: true,
    loading: true,
    error: false,
    width: 0,
    height: 0,
  })

  createEffect(() => {
    source()
    setState({ fit: true, scale: 1, loading: true, error: false, width: 0, height: 0 })
  })

  const zoom = (change: number) => {
    const scale = Math.min(8, Math.max(0.1, (state.fit ? 1 : state.scale) + change))
    setState({ fit: false, scale })
  }

  const actualSize = () => setState({ fit: false, scale: 1 })
  const fit = () => setState("fit", true)

  return (
    <div data-cmcc-image-preview class="flex size-full min-h-0 min-w-0 flex-col bg-v2-background-bg-layer-01">
      <div class="flex h-10 shrink-0 items-center gap-1 border-b border-v2-border-border-base px-2">
        <button
          type="button"
          aria-label="缩小图片"
          title="缩小"
          class="flex size-7 items-center justify-center rounded-[5px] text-[16px] text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base"
          onClick={() => zoom(-0.25)}
        >
          −
        </button>
        <button
          type="button"
          aria-label="恢复图片原始尺寸"
          title="原始尺寸"
          class="h-7 min-w-14 rounded-[5px] px-1.5 text-[12px] tabular-nums text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base"
          onClick={actualSize}
        >
          {state.fit ? "适应" : `${Math.round(state.scale * 100)}%`}
        </button>
        <button
          type="button"
          aria-label="放大图片"
          title="放大"
          class="flex size-7 items-center justify-center rounded-[5px] text-[16px] text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base"
          onClick={() => zoom(0.25)}
        >
          +
        </button>
        <button
          type="button"
          aria-pressed={state.fit}
          class="ml-1 h-7 rounded-[5px] px-2 text-[12px] text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base data-[selected]:bg-v2-background-bg-layer-03 data-[selected]:text-v2-text-text-base"
          data-selected={state.fit ? "" : undefined}
          onClick={fit}
        >
          适应窗口
        </button>
        <div class="min-w-0 flex-1 truncate text-right text-[11px] text-v2-text-text-faint">
          {state.width > 0 && state.height > 0 ? `${state.width} × ${state.height}` : ""}
        </div>
        <button
          type="button"
          aria-pressed={state.checkerboard}
          title={state.checkerboard ? "切换为纯色背景" : "显示透明网格"}
          class="h-7 shrink-0 rounded-[5px] px-2 text-[12px] text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base"
          onClick={() => setState("checkerboard", (value) => !value)}
        >
          {state.checkerboard ? "纯色背景" : "透明网格"}
        </button>
      </div>
      <div
        class="relative min-h-0 min-w-0 flex-1 overflow-auto bg-white"
        classList={{
          "bg-[linear-gradient(45deg,rgba(128,128,128,0.1)_25%,transparent_25%,transparent_75%,rgba(128,128,128,0.1)_75%),linear-gradient(45deg,rgba(128,128,128,0.1)_25%,transparent_25%,transparent_75%,rgba(128,128,128,0.1)_75%)] bg-[length:20px_20px] bg-[position:0_0,10px_10px]":
            state.checkerboard,
        }}
        onWheel={(event) => {
          if (!(event.metaKey || event.ctrlKey)) return
          event.preventDefault()
          zoom(event.deltaY < 0 ? 0.25 : -0.25)
        }}
      >
        <div
          class="flex items-center justify-center p-4"
          classList={{ "size-full": state.fit, "min-h-full min-w-full": !state.fit }}
        >
          <img
            src={source()}
            alt={fileName(props.path)}
            draggable={false}
            class="block select-none object-contain"
            classList={{ "max-h-full max-w-full": state.fit, "max-w-none": !state.fit }}
            style={
              state.fit || state.width === 0
                ? undefined
                : { width: `${state.width * state.scale}px`, height: `${state.height * state.scale}px` }
            }
            onDblClick={() => (state.fit ? actualSize() : fit())}
            onLoad={(event) =>
              setState({
                loading: false,
                error: false,
                width: event.currentTarget.naturalWidth,
                height: event.currentTarget.naturalHeight,
              })
            }
            onError={() => setState({ loading: false, error: true })}
          />
        </div>
        <Show when={state.loading}>
          <div class="absolute inset-0 flex items-center justify-center bg-v2-background-bg-layer-01/80 text-[13px] text-v2-text-text-muted">
            正在加载图片...
          </div>
        </Show>
        <Show when={state.error}>
          <div class="absolute inset-0 flex items-center justify-center bg-v2-background-bg-layer-01 px-8 text-center text-[13px] text-v2-text-text-muted">
            图片预览失败，请下载后在本地打开。
          </div>
        </Show>
      </div>
    </div>
  )
}

function OfficePreview(props: { kind: Extract<ArtifactPreviewKind, "docx" | "pptx">; data: ArrayBuffer }) {
  let container!: HTMLDivElement
  const [state, setState] = createStore({ loading: true, error: undefined as string | undefined })

  createEffect(() => {
    const kind = props.kind
    const data = props.data
    let active = true
    let previewer: { preview: (data: ArrayBuffer) => Promise<unknown>; destroy: () => void } | undefined
    container.replaceChildren()
    setState({ loading: true, error: undefined })

    const load =
      kind === "docx"
        ? import("docx-preview").then((module) => ({
            preview: (value: ArrayBuffer) =>
              module.renderAsync(value, container, container, {
                ignoreWidth: false,
                ignoreHeight: false,
                renderHeaders: true,
                renderFooters: true,
              }),
            destroy: () => container.replaceChildren(),
          }))
        : import("pptx-preview").then((module) => {
            const width = Math.max(container.clientWidth - 32, 320)
            return module.init(container, { width, height: Math.round((width * 9) / 16), mode: "list" })
          })

    void load
      .then((instance) => {
        if (!active) {
          instance.destroy()
          return Promise.resolve()
        }
        previewer = instance
        return instance.preview(data)
      })
      .then(() => {
        if (!active) return
        setState("loading", false)
      })
      .catch((error: unknown) => {
        if (!active) return
        setState({ loading: false, error: error instanceof Error ? error.message : String(error) })
      })

    onCleanup(() => {
      active = false
      previewer?.destroy()
    })
  })

  return (
    <div
      data-cmcc-office-preview={props.kind}
      class="relative size-full min-h-0 min-w-0 overflow-hidden bg-white text-black"
    >
      <div ref={container} class="size-full min-h-0 min-w-0 overflow-auto" />
      <Show when={state.loading}>
        <div class="absolute inset-0 flex items-center justify-center bg-white/90 text-[13px] text-black/60">
          正在渲染文档...
        </div>
      </Show>
      <Show when={state.error}>
        {(error) => (
          <div class="absolute inset-0 flex items-center justify-center bg-white px-8 text-center text-[13px] text-black/60">
            文档渲染失败：{error()}
          </div>
        )}
      </Show>
    </div>
  )
}

function PreviewEmpty(props: { title: string; description: string }) {
  return (
    <div class="flex h-full items-center justify-center px-8 text-center">
      <div>
        <div class="text-[14px] font-medium leading-5 text-v2-text-text-base">{props.title}</div>
        <div class="mt-2 text-[12px] leading-5 text-v2-text-text-muted">{props.description}</div>
      </div>
    </div>
  )
}

function fileName(value: string) {
  return value.replaceAll("\\", "/").split("/").at(-1) ?? value
}
