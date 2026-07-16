import type { FileContent } from "@opencode-ai/sdk/v2"
import { Markdown } from "@opencode-ai/session-ui/markdown"
import { useFileComponent } from "@opencode-ai/ui/context/file"
import { Match, Show, Switch, createEffect, createMemo, onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import { Dynamic } from "solid-js/web"
import {
  artifactBuffer,
  artifactDataUrl,
  artifactPreviewKind,
  artifactText,
  type ArtifactPreviewKind,
} from "@/pages/session/artifact-preview"

export function ArtifactPreview(props: {
  path: string
  content: FileContent
  markdownCacheKey?: string
  htmlTitle?: string
  htmlDescription?: string
  unsupportedDescription?: string
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
        <OfficePreview kind="excel" data={data()} />
      </Match>
      <Match when={kind() === "pptx"}>
        <OfficePreview kind="pptx" data={data()} />
      </Match>
      <Match when={kind() === "pdf"}>
        <iframe
          title={fileName(props.path)}
          class="size-full border-0 bg-white"
          src={artifactDataUrl(props.content, "application/pdf")}
        />
      </Match>
      <Match when={kind() === "image"}>
        <div class="flex size-full items-center justify-center overflow-auto bg-[linear-gradient(45deg,rgba(128,128,128,0.08)_25%,transparent_25%,transparent_75%,rgba(128,128,128,0.08)_75%),linear-gradient(45deg,rgba(128,128,128,0.08)_25%,transparent_25%,transparent_75%,rgba(128,128,128,0.08)_75%)] bg-[length:20px_20px] bg-[position:0_0,10px_10px] p-4">
          <img
            src={artifactDataUrl(props.content, props.content.mimeType ?? "image/png")}
            alt={fileName(props.path)}
            class="max-h-full max-w-full object-contain"
          />
        </div>
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

function OfficePreview(props: { kind: Extract<ArtifactPreviewKind, "docx" | "excel" | "pptx">; data: ArrayBuffer }) {
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
        : kind === "excel"
          ? Promise.all([import("@js-preview/excel"), import("@js-preview/excel/lib/index.css")]).then(([module]) =>
              module.default.init(container, { minColLength: 12, minRowLength: 20, showContextmenu: false }),
            )
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
      <div
        ref={container}
        class="size-full min-h-0 min-w-0"
        classList={{ "overflow-hidden": props.kind === "excel", "overflow-auto": props.kind !== "excel" }}
      />
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
