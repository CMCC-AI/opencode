import { useNavigate } from "@solidjs/router"
import { WorkbenchReplayToolbar } from "../agent-workbench/replay-toolbar"
import { For, Match, Show, Switch, createEffect } from "solid-js"
import { createStore } from "solid-js/store"
import { showToast } from "@/utils/toast"
import type { DeepTradingReplayStage } from "../deeptrading/replay"
import { MstockFilesTab, MstockTextReportTab, MstockVisualReportTab } from "./report-tabs"
import { MstockTeamTab } from "./team-tab"
import { useMstockWorkbench } from "./workbench-context"

type MstockTab = "team" | "files" | "text" | "visual"

const TABS: Array<{ id: MstockTab; label: string }> = [
  { id: "team", label: "分析团队" },
  { id: "files", label: "文件" },
  { id: "text", label: "文字报告" },
  { id: "visual", label: "可视化报告" },
]

export function MstockResultsPanel(props: { onCreateSame?: () => void } = {}) {
  const context = useMstockWorkbench()
  const navigate = useNavigate()
  const [state, setState] = createStore({ active: "team" as MstockTab, manualReplayTab: false })
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

  const selectTab = (tab: MstockTab) => {
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
        if (!started)
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
  const showReplayBar = () => context.replay.canReplay() || context.replay.isPreparing() || context.replay.isReplaying()

  const createSame = () => {
    if (context.replay.isPreparing() || context.replay.isReplaying()) return
    if (props.onCreateSame) return props.onCreateSame()
    navigate("/mstock?fresh=1")
  }

  return (
    <div class="workbench-results @container relative flex size-full min-w-0 flex-col">
      <nav
        class="flex h-12 shrink-0 items-end gap-1 border-b border-[#dfe3ea] bg-white px-3"
        aria-label="多股对比报告页签"
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
      <div class="min-h-0 flex-1 overflow-hidden">
        <Switch>
          <Match when={state.active === "team"}>
            <div class="size-full overflow-hidden">
              <MstockTeamTab />
            </div>
          </Match>
          <Match when={state.active === "files"}>
            <MstockFilesTab />
          </Match>
          <Match when={state.active === "text"}>
            <MstockTextReportTab />
          </Match>
          <Match when={state.active === "visual"}>
            <MstockVisualReportTab />
          </Match>
        </Switch>
      </div>
      <Show when={showReplayBar()}>
        <WorkbenchReplayToolbar
          badge="多"
          name="多股对比"
          preparing={context.replay.isPreparing()}
          playing={context.replay.isReplaying()}
          stage={replayStageLabel(context.replay.stage())}
          progress={context.replay.progress()}
          onReplay={toggleReplay}
          onCreateSame={createSame}
        />
      </Show>
    </div>
  )
}

function replayTab(stage: DeepTradingReplayStage): MstockTab {
  if (stage === "files" || stage === "text" || stage === "visual") return stage
  return "team"
}

function replayStageLabel(stage: DeepTradingReplayStage) {
  if (stage === "files") return "整理文件"
  if (stage === "text") return "撰写报告"
  if (stage === "visual") return "生成可视化"
  return "多股对比分析"
}
