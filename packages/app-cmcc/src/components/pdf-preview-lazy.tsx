import { ErrorBoundary, Suspense, lazy } from "solid-js"

const Document = lazy(() => import("./pdf-preview"))

export function PdfPreview(props: { src: string; title?: string }) {
  return (
    <ErrorBoundary fallback={<PreviewState text="PDF 组件加载失败，请下载原文件查看。" />}>
      <Suspense fallback={<PreviewState text="正在加载 PDF..." />}>
        <Document {...props} />
      </Suspense>
    </ErrorBoundary>
  )
}

function PreviewState(props: { text: string }) {
  return (
    <div
      role="status"
      class="flex size-full items-center justify-center bg-white px-6 text-center text-[13px] text-[#697182]"
    >
      {props.text}
    </div>
  )
}
