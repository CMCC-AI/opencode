import { For, Match, Show, Switch, createEffect } from "solid-js"
import { createStore } from "solid-js/store"
import { showToast } from "@/utils/toast"
import { DeepTradingFilesTab, DeepTradingTextReportTab, DeepTradingVisualReportTab } from "./report-tabs"
import type { DeepTradingReplayStage } from "./replay"
import { DeepTradingTeamTab } from "./team-tab"
import { useDeepTradingWorkbench } from "./workbench-context"

type DeepTradingTab = "team" | "files" | "text" | "visual"

const TABS: Array<{ id: DeepTradingTab; label: string }> = [
  { id: "team", label: "分析团队" },
  { id: "files", label: "文件" },
  { id: "text", label: "文字报告" },
  { id: "visual", label: "可视化报告" },
]

export function DeepTradingResultsPanel() {
  const context = useDeepTradingWorkbench()
  const [state, setState] = createStore({ active: "team" as DeepTradingTab, manualReplayTab: false })
  let wasReplaying = false

  createEffect(() => {
    const replaying = context.replay.isReplaying()
    const stage = context.replay.stage()
    if (!replaying) {
      if (wasReplaying) setState("manualReplayTab", false)
      wasReplaying = false
      return
    }
    if (!wasReplaying) {
      wasReplaying = true
      setState({ active: "team", manualReplayTab: false })
      return
    }
    if (!state.manualReplayTab) setState("active", replayTab(stage))
  })

  const selectTab = (tab: DeepTradingTab) => {
    if (context.replay.isReplaying()) setState("manualReplayTab", true)
    setState("active", tab)
  }

  const toggleReplay = () => {
    if (context.replay.isPreparing()) return
    if (context.replay.isReplaying()) {
      context.replay.stop()
      return
    }
    void context.replay.start().then(
      (started) => {
        if (started) return
        showToast({ variant: "default", title: "暂无可回放内容", description: "请等待当前会话完成并加载详情。" })
      },
      (error: unknown) => {
        context.replay.stop()
        showToast({
          variant: "error",
          title: "回放准备失败",
          description: error instanceof Error ? error.message : String(error),
        })
      },
    )
  }

  const showReplayBar = () =>
    context.replay.canReplay() || context.replay.isPreparing() || context.replay.isReplaying()

  return (
    <div class="@container relative flex size-full min-w-0 flex-col bg-[#f7f8fb]">
      <nav
        class="flex h-12 shrink-0 items-end gap-1 border-b border-[#dfe3ea] bg-white px-3"
        aria-label="DeepTrading 报告页签"
      >
        <For each={TABS}>
          {(tab) => (
            <button
              type="button"
              data-selected={state.active === tab.id ? "" : undefined}
              class="relative h-11 min-w-0 flex-1 px-1 text-[12px] leading-4 text-[#7b8392] hover:text-[#384050] data-[selected]:font-medium data-[selected]:text-[#345897] after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:bg-transparent data-[selected]:after:bg-[#5271b7]"
              onClick={() => selectTab(tab.id)}
            >
              <span class="block truncate">{tab.label}</span>
            </button>
          )}
        </For>
      </nav>
      <div class="min-h-0 flex-1 overflow-hidden" classList={{ "pb-[72px]": showReplayBar() }}>
        <Switch>
          <Match when={state.active === "team"}>
            <div class="size-full overflow-hidden bg-[#f7f8fb]">
              <DeepTradingTeamTab />
            </div>
          </Match>
          <Match when={state.active === "files"}>
            <DeepTradingFilesTab />
          </Match>
          <Match when={state.active === "text"}>
            <DeepTradingTextReportTab />
          </Match>
          <Match when={state.active === "visual"}>
            <DeepTradingVisualReportTab />
          </Match>
        </Switch>
      </div>
      <Show when={showReplayBar()}>
        <div class="pointer-events-none absolute inset-x-0 bottom-3 z-30 flex justify-center px-3">
          <div class="pointer-events-auto flex max-w-full min-w-0 items-center gap-2.5 rounded-[18px] border border-[#dfe5ef] bg-white/95 px-2.5 py-2 shadow-[0_8px_24px_rgba(29,45,78,0.14)] backdrop-blur">
            <div class="mr-0 flex shrink-0 items-center gap-2 whitespace-nowrap text-[13px] font-semibold text-[#2563eb] @min-[340px]:mr-2">
              <span class="flex size-[26px] items-center justify-center rounded-[8px] bg-[#eff6ff] text-[14px] font-bold text-[#2563eb] shadow-[inset_0_0_0_1px_#bfdbfe]">
                深
              </span>
              <strong class="hidden font-semibold @min-[340px]:inline">深度洞察</strong>
            </div>
            <Show when={context.replay.isPreparing() || context.replay.isReplaying()}>
              <div class="flex min-w-0 items-center gap-2 whitespace-nowrap text-[11px] text-[#6b7280]">
                <span class="hidden @min-[390px]:inline">
                  {context.replay.isPreparing() ? "准备回放" : replayStageLabel(context.replay.stage())}
                </span>
                <div class="h-[5px] w-12 overflow-hidden rounded-full bg-[#eef2ff] @min-[390px]:w-[72px]">
                  <span
                    class="block h-full rounded-full bg-gradient-to-r from-[#3b82f6] to-[#6366f1] transition-[width] duration-300"
                    style={{ width: `${Math.round(context.replay.progress() * 100)}%` }}
                  />
                </div>
              </div>
            </Show>
            <button
              type="button"
              disabled={context.replay.isPreparing()}
              aria-pressed={context.replay.isReplaying()}
              class="h-9 shrink-0 rounded-[18px] bg-[#eff6ff] px-3 text-[14px] font-bold text-[#3b82f6] shadow-[0_4px_10px_rgba(59,130,246,0.12)] transition hover:bg-[#e5efff] disabled:cursor-wait disabled:opacity-60 @min-[340px]:px-5"
              onClick={toggleReplay}
            >
              {context.replay.isPreparing() ? "准备中" : context.replay.isReplaying() ? "停止回放" : "看回放"}
            </button>
          </div>
        </div>
      </Show>
    </div>
  )
}

function replayTab(stage: DeepTradingReplayStage) {
  if (stage === "files" || stage === "text" || stage === "visual") return stage
  return "team"
}

function replayStageLabel(stage: DeepTradingReplayStage) {
  if (stage === "files") return "整理文件"
  if (stage === "text") return "撰写报告"
  if (stage === "visual") return "生成可视化"
  return "分析团队"
}
