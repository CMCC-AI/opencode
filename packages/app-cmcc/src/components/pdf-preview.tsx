import type { PDFDocumentLoadingTask } from "pdfjs-dist"
import type { PDFViewer } from "pdfjs-dist/web/pdf_viewer.mjs"
import workerUrl from "pdfjs-dist/build/pdf.worker.mjs?url"
import viewerCss from "pdfjs-dist/web/pdf_viewer.css?inline"
import { Show, createEffect, onCleanup } from "solid-js"
import { createStore } from "solid-js/store"

export default function PdfPreview(props: { src: string; title?: string }) {
  let host!: HTMLDivElement
  const [state, setState] = createStore({ loading: true, error: "" })

  createEffect(() => {
    const src = props.src
    const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" })
    const style = document.createElement("style")
    // Keep the PDF viewer's document-level styles out of the surrounding app.
    style.textContent = `${viewerCss.replaceAll(":root", ":host")}
      :host { color-scheme: light; }
      .cmcc-pdf-pages { position: absolute; inset: 0; overflow: auto; overscroll-behavior: contain; background: #fff; }
      .pdfViewer { padding: 0; }
      .pdfViewer .page { box-shadow: none; }
      .pdfViewer.removePageBorders .page { margin: 0 auto 12px; border: 0; }
    `
    const container = document.createElement("div")
    container.className = "cmcc-pdf-pages"
    container.tabIndex = 0
    const pages = document.createElement("div")
    pages.className = "pdfViewer"
    container.append(pages)
    shadow.replaceChildren(style, container)
    setState({ loading: true, error: "" })
    let active = true
    let viewer: PDFViewer | undefined
    let loading: PDFDocumentLoadingTask | undefined
    const observer = new ResizeObserver(() => {
      if (viewer?.pagesCount && container.clientWidth > 0) viewer.currentScaleValue = "page-width"
    })

    const load = async () => {
      const { getDocument, GlobalWorkerOptions, version } = await import("pdfjs-dist")
      // pdf_viewer reads the API initialized by pdfjs-dist when it is evaluated.
      const { EventBus, PDFViewer, PDFLinkService, LinkTarget } = await import("pdfjs-dist/web/pdf_viewer.mjs")
      if (!active) return
      GlobalWorkerOptions.workerSrc = workerUrl
      const eventBus = new EventBus()
      const links = new PDFLinkService({ eventBus, externalLinkTarget: LinkTarget.BLANK })
      viewer = new PDFViewer({ container, viewer: pages, eventBus, linkService: links, removePageBorders: true })
      links.setViewer(viewer)
      eventBus.on("pagesinit", () => {
        if (active && viewer && container.clientWidth > 0) viewer.currentScaleValue = "page-width"
      })
      eventBus.on("pagerendered", (event: { error?: unknown }) => {
        if (active) setState({ loading: false, error: event.error ? "PDF 页面渲染失败，请下载原文件查看。" : "" })
      })
      const assets = `${import.meta.env.BASE_URL}pdfjs/${version}/`
      loading = getDocument({
        url: src,
        cMapUrl: `${assets}cmaps/`,
        cMapPacked: true,
        standardFontDataUrl: `${assets}standard_fonts/`,
        wasmUrl: `${assets}wasm/`,
        iccUrl: `${assets}iccs/`,
      })
      const document = await loading.promise
      if (!active) return
      links.setDocument(document)
      viewer.setDocument(document)
      observer.observe(container)
    }
    void load().catch(() => {
      if (active) setState({ loading: false, error: "PDF 预览失败，请下载原文件查看。" })
    })

    onCleanup(() => {
      active = false
      observer.disconnect()
      viewer?.setDocument(null)
      void loading?.destroy().catch(() => {})
      shadow.replaceChildren()
    })
  })

  return (
    <div
      data-cmcc-pdf-preview
      data-ready={!state.loading && !state.error ? "true" : "false"}
      aria-label={props.title ?? "PDF 文档"}
      class="relative size-full min-h-0 min-w-0 overflow-hidden bg-white"
    >
      <div ref={host} class="absolute inset-0" />
      <Show when={state.loading || state.error}>
        <div
          role="status"
          class="absolute inset-0 flex items-center justify-center bg-white px-6 text-center text-[13px] text-[#697182]"
        >
          {state.error || "正在加载 PDF..."}
        </div>
      </Show>
    </div>
  )
}
