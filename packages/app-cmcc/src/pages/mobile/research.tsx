import { createEffect, createResource, createSignal, onCleanup, Show } from "solid-js"
import { useDockApi } from "@/context/dockapi"
import { useServerSync } from "@/context/server-sync"
import { showToast } from "@/utils/toast"
import { ResearchResultView } from "../general-deepinsight/result-view"
import { RESEARCH_API, type ResearchDetail } from "../general-deepinsight/model"
import { DeepInsightSessionView } from "../session/deepinsight/deepinsight-session-view"
import { DeepInsightResultsPanel } from "../session/deepinsight/deepinsight-results-panel"
import { DeepInsightWorkbenchProvider } from "../session/deepinsight/workbench-context"
import { downloadMobileBlob } from "./conversation"
import type { MobileSource } from "./history"
import "../general-deepinsight/research.css"

export default function MobileResearchHistory(props: { source: MobileSource; id: string }) {
  return <Show when={props.source === "opencode"} fallback={<LangGraphHistory id={props.id} />}>
    <OpenCodeHistory id={props.id} />
  </Show>
}

function OpenCodeHistory(props: { id: string }) {
  const sync = useServerSync()
  const [results, setResults] = createSignal(false)
  createEffect(() => {
    const id = props.id
    sync().session.pin(id)
    onCleanup(() => sync().session.unpin(id))
  })
  return (
    <DeepInsightWorkbenchProvider sessionID={() => props.id} active={() => true}>
      <div class="di-mobile-research">
        <div class="di-mobile-research-tabs" role="group" aria-label="研究详情">
          <button type="button" aria-pressed={!results()} onClick={() => setResults(false)}>研究内容</button>
          <button type="button" aria-pressed={results()} onClick={() => setResults(true)}>研究结果</button>
        </div>
        <div class="di-mobile-research-content">
          <Show when={results()} fallback={<DeepInsightSessionView readOnly />}>
            <DeepInsightResultsPanel readOnly />
          </Show>
        </div>
      </div>
    </DeepInsightWorkbenchProvider>
  )
}

function LangGraphHistory(props: { id: string }) {
  const dock = useDockApi()
  const [detail, actions] = createResource(() => props.id, (id) =>
    dock.research.request<ResearchDetail>(`${RESEARCH_API}/sessions/${encodeURIComponent(id)}`),
  )
  const [busy, setBusy] = createSignal(false)
  const download = async (kind: "pdf" | "html") => {
    if (busy() || detail()?.session.status !== "completed") return
    setBusy(true)
    try {
      const response = await dock.research.fetch(`${RESEARCH_API}/export-${kind}`, {
        method: "POST",
        body: JSON.stringify({ sessionId: props.id }),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      downloadMobileBlob(await response.blob(), `research-report.${kind}`)
    } catch {
      showToast({ variant: "error", title: "报告下载失败" })
    } finally {
      setBusy(false)
    }
  }
  const noop = () => {}
  return (
    <div class="di-mobile-research general-research">
      <Show when={!detail.error && detail.latest} fallback={
        <Show when={detail.error} fallback={<p class="di-mobile-state" role="status">正在读取研究内容…</p>}>
          <button type="button" class="di-mobile-history-status" onClick={() => void actions.refetch()}>研究内容加载失败，重试</button>
        </Show>
      }>
        {(value) => <ResearchResultView
          detail={value()}
          elapsed={value().conversationData.elapsedUnknown ? "--" : `${Math.floor(value().session.elapsedSeconds / 60)}分${value().session.elapsedSeconds % 60}秒`}
          busy={busy()}
          readOnly
          historyView
          small
          editing={false}
          onNew={noop}
          onSame={noop}
          onStop={noop}
          onStart={noop}
          onEdit={noop}
          onMarkdown={() => downloadMobileBlob(new Blob([value().reportContent], { type: "text/markdown;charset=utf-8" }), "research-report.md")}
          onPdf={() => void download("pdf")}
          onHtml={() => void download("html")}
        />}
      </Show>
    </div>
  )
}
