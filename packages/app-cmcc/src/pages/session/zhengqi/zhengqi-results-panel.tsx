import { For, Match, Show, Switch, createEffect } from "solid-js"
import { WorkbenchReplayToolbar } from "../agent-workbench/replay-toolbar"
import { createStore } from "solid-js/store"
import { useDockApi } from "@/context/dockapi"
import { useServer } from "@/context/server"
import { useServerSDK } from "@/context/server-sdk"
import { useTabs } from "@/context/tabs"
import { cmccArtifactWorkspace, cmccEnsureWorkspace, cmccRememberConversationWorkspace } from "@/utils/cmcc-workspace"
import { showToast } from "@/utils/toast"
import type { DeepTradingReplayStage } from "../deeptrading/replay"
import { ZHENGQI_EXPERT_ID, ZHENGQI_LEAD_AGENT } from "./config"
import { ZhengqiFilesTab, ZhengqiTextReportTab, ZhengqiVisualReportTab } from "./report-tabs"
import { ZhengqiTeamTab } from "./team-tab"
import { useZhengqiWorkbench } from "./workbench-context"

type ZhengqiTab = "team" | "files" | "text" | "visual"

const TABS: Array<{ id: ZhengqiTab; label: string }> = [
  { id: "team", label: "分析团队" },
  { id: "files", label: "文件" },
  { id: "text", label: "文字报告" },
  { id: "visual", label: "可视化报告" },
]

export function ZhengqiResultsPanel(props: { onCreateSame?: () => void } = {}) {
  const context = useZhengqiWorkbench()
  const dockapi = useDockApi()
  const server = useServer()
  const serverSDK = useServerSDK()
  const tabs = useTabs()
  const [state, setState] = createStore({ active: "team" as ZhengqiTab, manualReplayTab: false })
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

  const selectTab = (tab: ZhengqiTab) => {
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
    tabs.newDraft({ server: server.key, directory, artifactDirectory, expertID: ZHENGQI_EXPERT_ID }, query, {
      agent: ZHENGQI_LEAD_AGENT,
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
    <div class="workbench-results @container relative flex size-full min-w-0 flex-col">
      <nav class="flex h-12 shrink-0 items-end gap-1 border-b border-[#dfe3ea] bg-white px-3" aria-label="政企报告页签">
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
              <ZhengqiTeamTab />
            </div>
          </Match>
          <Match when={state.active === "files"}>
            <ZhengqiFilesTab />
          </Match>
          <Match when={state.active === "text"}>
            <ZhengqiTextReportTab />
          </Match>
          <Match when={state.active === "visual"}>
            <ZhengqiVisualReportTab />
          </Match>
        </Switch>
      </div>
      <Show when={showReplayBar()}>
        <WorkbenchReplayToolbar
          badge="政"
          name="政企洞察"
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

function replayTab(stage: DeepTradingReplayStage): ZhengqiTab {
  if (stage === "files" || stage === "text" || stage === "visual") return stage
  return "team"
}

function replayStageLabel(stage: DeepTradingReplayStage) {
  if (stage === "files") return "整理文件"
  if (stage === "text") return "撰写报告"
  if (stage === "visual") return "生成可视化"
  return "政企分析"
}
