import { For, Match, Show, Switch, createEffect } from "solid-js"
import { createStore } from "solid-js/store"
import { useDockApi } from "@/context/dockapi"
import { useServer } from "@/context/server"
import { useServerSDK } from "@/context/server-sdk"
import { useTabs } from "@/context/tabs"
import { cmccArtifactWorkspace, cmccEnsureWorkspace, cmccRememberConversationWorkspace } from "@/utils/cmcc-workspace"
import { showToast } from "@/utils/toast"
import type { DeepTradingReplayStage } from "../deeptrading/replay"
import { DEEPINSPECT_EXPERT_ID, DEEPINSPECT_LEAD_AGENT } from "./config"
import { DeepInspectFilesTab, DeepInspectTextReportTab, DeepInspectVisualReportTab } from "./report-tabs"
import { DeepInspectTeamTab } from "./team-tab"
import { useDeepInspectWorkbench } from "./workbench-context"

type DeepInspectTab = "team" | "files" | "text" | "visual"

const TABS: Array<{ id: DeepInspectTab; label: string }> = [
  { id: "team", label: "分析团队" },
  { id: "files", label: "文件" },
  { id: "text", label: "文字报告" },
  { id: "visual", label: "可视化报告" },
]

const ACTION_BUTTON_CLASS =
  "h-9 shrink-0 rounded-[18px] bg-[#eff6ff] px-3 text-[14px] font-bold text-[#3b82f6] shadow-[0_4px_10px_rgba(59,130,246,0.12)] transition hover:bg-[#e5efff] disabled:cursor-wait disabled:opacity-60 @min-[340px]:px-5"

export function DeepInspectResultsPanel() {
  const context = useDeepInspectWorkbench()
  const dockapi = useDockApi()
  const server = useServer()
  const serverSDK = useServerSDK()
  const tabs = useTabs()
  const [state, setState] = createStore({ active: "team" as DeepInspectTab, manualReplayTab: false })
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

  const selectTab = (tab: DeepInspectTab) => {
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
    const query = context.workbench().query.trim()
    if (!query) {
      showToast({ variant: "default", title: "暂无可复用的查询内容" })
      return
    }
    const directory = dockapi.workspace?.directoryPath
    const artifactDirectory = cmccArtifactWorkspace(directory)
    if (!directory || !artifactDirectory || !tabs.ready()) {
      showToast({ variant: "error", title: "无法创建同款会话", description: "当前用户工作目录尚未准备完成。" })
      return
    }
    tabs.newDraft({ server: server.key, directory, artifactDirectory, expertID: DEEPINSPECT_EXPERT_ID }, query, {
      agent: DEEPINSPECT_LEAD_AGENT,
    })
    cmccRememberConversationWorkspace(directory)
    server.projects.touch(directory)
    void cmccEnsureWorkspace(
      artifactDirectory,
      (path) => serverSDK().client.file.createDirectory({ path }, { throwOnError: true }),
      serverSDK().scope,
    ).catch((error) => {
      showToast({
        variant: "error",
        title: "无法准备会话产物目录",
        description: error instanceof Error ? error.message : String(error),
      })
    })
  }

  return (
    <div class="@container relative flex size-full min-w-0 flex-col bg-[#f7f8fb]">
      <nav
        class="flex h-12 shrink-0 items-end gap-1 border-b border-[#dfe3ea] bg-white px-3"
        aria-label="DeepInspect 报告页签"
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
              <DeepInspectTeamTab />
            </div>
          </Match>
          <Match when={state.active === "files"}>
            <DeepInspectFilesTab />
          </Match>
          <Match when={state.active === "text"}>
            <DeepInspectTextReportTab />
          </Match>
          <Match when={state.active === "visual"}>
            <DeepInspectVisualReportTab />
          </Match>
        </Switch>
      </div>
      <Show when={showReplayBar()}>
        <div class="pointer-events-none absolute inset-x-0 bottom-3 z-30 flex justify-center px-3">
          <div class="pointer-events-auto flex max-w-full min-w-0 items-center gap-2.5 rounded-[18px] border border-[#dfe5ef] bg-white/95 px-2.5 py-2 shadow-[0_8px_24px_rgba(29,45,78,0.14)] backdrop-blur">
            <div class="mr-0 flex shrink-0 items-center gap-2 whitespace-nowrap text-[13px] font-semibold text-[#2563eb] @min-[340px]:mr-2">
              <span class="flex size-[26px] items-center justify-center rounded-[8px] bg-[#eff6ff] text-[14px] font-bold text-[#2563eb] shadow-[inset_0_0_0_1px_#bfdbfe]">
                巡
              </span>
              <strong class="hidden font-semibold @min-[340px]:inline">巡查分析</strong>
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
              class={ACTION_BUTTON_CLASS}
              onClick={toggleReplay}
            >
              {context.replay.isPreparing() ? "准备中" : context.replay.isReplaying() ? "停止回放" : "看回放"}
            </button>
            <Show when={!context.replay.isPreparing() && !context.replay.isReplaying()}>
              <button type="button" class={ACTION_BUTTON_CLASS} onClick={createSame}>
                做同款
              </button>
            </Show>
          </div>
        </div>
      </Show>
    </div>
  )
}

function replayTab(stage: DeepTradingReplayStage): DeepInspectTab {
  if (stage === "files" || stage === "text" || stage === "visual") return stage
  return "team"
}

function replayStageLabel(stage: DeepTradingReplayStage) {
  if (stage === "files") return "整理文件"
  if (stage === "text") return "撰写报告"
  if (stage === "visual") return "生成可视化"
  return "巡查分析"
}
