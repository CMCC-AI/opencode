import { Icon } from "@opencode-ai/ui/icon"
import { For, Match, Show, Switch, createEffect, createMemo, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import echartsRuntimeUrl from "../../../node_modules/echarts/dist/echarts.min.js?url"
import { ArtifactPreview } from "@/components/artifact-preview"
import { useFile } from "@/context/file"
import { useSDK } from "@/context/sdk"
import { useServerSDK } from "@/context/server-sdk"
import { authTokenFromCredentials } from "@/utils/server"
import { showToast } from "@/utils/toast"
import { artifactHtmlPreviewUrl } from "./artifact-html-preview"
import { artifactPdfPreviewUrl } from "./artifact-pdf-preview"
import { artifactPreviewKind, artifactReportFiles, type ArtifactReportKind } from "./artifact-preview"
import type { AgentArtifactSource } from "./agent-workbench/artifact-source"
import { createSnapshotReportFiles } from "./agent-workbench/snapshot-report-files"

type ReportArtifact = { path: string; filename: string }

export function ReportArtifactPreview(props: {
  artifacts: readonly ReportArtifact[]
  kind: ArtifactReportKind
  preferredPath?: string
  artifactSource?: AgentArtifactSource
  empty: JSX.Element
}) {
  const file = props.artifactSource ? createSnapshotReportFiles(props.artifactSource) : useFile()
  const sdk = props.artifactSource ? undefined : useSDK()
  const serverSDK = props.artifactSource ? undefined : useServerSDK()
  const [state, setState] = createStore({ selectedPath: undefined as string | undefined, downloading: false })
  const reports = createMemo(() => {
    const items = artifactReportFiles(props.artifacts, props.kind)
    if (!props.preferredPath) return items
    return [...items].sort(
      (left, right) => Number(right.path === props.preferredPath) - Number(left.path === props.preferredPath),
    )
  })
  const selected = createMemo(() => reports().find((artifact) => artifact.path === state.selectedPath) ?? reports()[0])
  const content = createMemo(() => {
    const artifact = selected()
    return artifact && props.kind === "text" ? file.get(artifact.path) : undefined
  })
  const previewUrl = createMemo(() => {
    const artifact = selected()
    if (!artifact || (props.kind !== "visual" && artifactPreviewKind(artifact.path) !== "pdf")) return undefined
    if (props.artifactSource) return props.artifactSource.previewUrl(artifact.path)
    if (!sdk || !serverSDK) return undefined
    const sdkContext = sdk()
    const connection = serverSDK().server.http
    if (artifactPreviewKind(artifact.path) === "pdf")
      return artifactPdfPreviewUrl({
        serverUrl: sdkContext.url,
        directory: sdkContext.directory,
        path: artifact.path,
        authToken: connection.password
          ? authTokenFromCredentials({ username: connection.username, password: connection.password })
          : undefined,
      })
    return artifactHtmlPreviewUrl({
      serverUrl: sdkContext.url,
      directory: sdkContext.directory,
      path: artifact.path,
      runtimeUrl: echartsRuntimeUrl,
      pageOrigin: window.location.origin,
      authToken: connection.password
        ? authTokenFromCredentials({ username: connection.username, password: connection.password })
        : undefined,
    })
  })

  createEffect(() => {
    const artifact = selected()
    if (artifact && props.kind === "text") void file.load(artifact.path)
  })

  const downloadFile = (path: string) => {
    if (props.artifactSource) return props.artifactSource.download(path)
    if (!sdk) return Promise.reject(new Error("文件服务未就绪"))
    return sdk()
      .client.file.download({ path })
      .then((response) => {
        if (!(response.data instanceof Blob)) throw new Error("服务器未返回文件内容")
        return response.data
      })
  }

  const download = () => {
    const artifact = selected()
    if (!artifact || state.downloading) return
    setState("downloading", true)
    void downloadFile(artifact.path)
      .then((blob) => {
        downloadBlob(blob, artifact.filename)
      })
      .catch((error: unknown) => {
        showToast({
          variant: "error",
          title: "文件下载失败",
          description: error instanceof Error ? error.message : String(error),
        })
      })
      .finally(() => setState("downloading", false))
  }

  return (
    <Show when={selected()} fallback={props.empty}>
      {(artifact) => (
        <div class="flex h-full min-h-0 flex-col overflow-hidden bg-[#f7f8fb] px-4 py-4">
          <header class="mb-3 flex h-9 shrink-0 items-center gap-2">
            <div class="deeptrading-scrollbar flex min-w-0 flex-1 gap-1 overflow-x-auto">
              <For each={reports()}>
                {(report) => (
                  <button
                    type="button"
                    data-selected={artifact().path === report.path ? "" : undefined}
                    class="h-8 max-w-56 shrink-0 truncate rounded-[6px] border border-[#d5dae5] bg-white px-3 text-[11px] text-[#697182] hover:bg-[#f4f6fa] data-[selected]:border-[#b9c9e7] data-[selected]:bg-[#edf3fd] data-[selected]:text-[#3f5f9f]"
                    title={report.path}
                    onClick={() => setState("selectedPath", report.path)}
                  >
                    {report.filename}
                  </button>
                )}
              </For>
            </div>
            <button
              type="button"
              disabled={state.downloading}
              class="flex h-8 shrink-0 items-center gap-1 rounded-[6px] border border-[#cbd7ef] bg-[#eef3fc] px-2.5 text-[12px] text-[#4e68a4] hover:bg-[#e5ecf9] disabled:opacity-50"
              onClick={download}
            >
              <Icon name="download" class="size-3.5" />
              下载
            </button>
          </header>
          <div class="min-h-0 flex-1 overflow-hidden rounded-[8px] border border-[#e0e4eb] bg-white">
            <Show
              when={props.kind === "visual"}
              fallback={
                <Switch>
                  <Match when={content()?.loaded && content()?.content}>
                    <ArtifactPreview path={artifact().path} content={content()!.content!} pdfSrc={previewUrl()} />
                  </Match>
                  <Match when={content()?.error}>
                    {(error) => <ReportState title="文字报告读取失败" description={error()} />}
                  </Match>
                  <Match when={true}>
                    <ReportState title="正在读取文字报告" description="请稍候。" />
                  </Match>
                </Switch>
              }
            >
              <Show
                when={previewUrl()}
                keyed
                fallback={<ReportState title="可视化报告读取失败" description="无法生成 HTML 预览地址。" />}
              >
                {(url) => (
                  <iframe
                    title={artifact().filename}
                    class="block size-full min-h-[400px] border-0 bg-white"
                    src={url}
                    sandbox="allow-scripts"
                    referrerpolicy="origin"
                  />
                )}
              </Show>
            </Show>
          </div>
        </div>
      )}
    </Show>
  )
}

function ReportState(props: { title: string; description: string }) {
  return (
    <div class="flex size-full min-h-48 flex-col items-center justify-center px-6 text-center">
      <strong class="text-[14px] font-medium text-[#414958]">{props.title}</strong>
      <span class="mt-1 max-w-[420px] text-[12px] leading-5 text-[#8a91a0]">{props.description}</span>
    </div>
  )
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
