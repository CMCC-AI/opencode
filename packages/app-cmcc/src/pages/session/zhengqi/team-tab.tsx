import { Icon } from "@opencode-ai/ui/icon"
import { WorkbenchStatCard } from "../agent-workbench/stat-card"
import { WorkbenchTeamPanel } from "../agent-workbench/team-panel"
import { formatCaseCharacterCount } from "@/utils/cmcc-cases"
import { For, Match, Show, Switch, createMemo } from "solid-js"
import { SerialAgentDag } from "../agent-workbench/serial-agent-dag"
import { StatusBadge } from "../deeptrading/deeptrading-session-view"
import { ZHENGQI_DAG_EDGES, ZHENGQI_DAG_LEVELS, ZHENGQI_REQUIRED_MEMBER_IDS, zhengqiAvatar } from "./config"
import { isZhengqiDagEdgeActive, zhengqiProgress } from "./data"
import { useZhengqiWorkbench } from "./workbench-context"

export function ZhengqiTeamTab() {
  const context = useZhengqiWorkbench()
  const progress = createMemo(() =>
    context.workbench().loading
      ? 0
      : zhengqiProgress({ nodes: context.workbench().agents, requiredAgentIds: ZHENGQI_REQUIRED_MEMBER_IDS }),
  )
  const stats = createMemo(() => {
    const tokenCount = context.workbench().stats.tokenCount
    const reportLength = context.reportLength()
    return [
      {
        metric: "elapsed",
        label: "思考时间",
        value: context.workbench().loading ? "--" : formatElapsed(context.workbench().stats.elapsedMs),
      },
      {
        metric: "tokens",
        label: "消耗 token",
        value: context.workbench().loading || tokenCount === undefined ? "--" : formatNumber(tokenCount),
      },
      {
        metric: "report-length",
        label: "报告篇幅",
        value: context.workbench().loading || reportLength === undefined ? "--" : formatCaseCharacterCount(reportLength),
      },
      {
        metric: "experts",
        label: "专家团",
        value: `${context.workbench().stats.expertCount} 位`,
      },
    ] as const
  })

  return (
    <div class="flex size-full min-h-0 flex-col gap-3 px-3 py-3">
      <section data-workbench-stats aria-label="政企分析统计" class="grid grid-cols-4 gap-1.5">
        <For each={stats()}>{(stat) => <WorkbenchStatCard {...stat} />}</For>
      </section>

      <WorkbenchTeamPanel
        dag={
          <SerialAgentDag
            label="政企分析 DAG"
            order={ZHENGQI_DAG_LEVELS.flat()}
            edges={ZHENGQI_DAG_EDGES}
            nodes={context.workbench().agents}
            selectedAgentId={context.selectedAgentId()}
            onSelect={context.selectAgent}
            avatar={zhengqiAvatar}
            isEdgeActive={isZhengqiDagEdgeActive}
          />

        }
        progress={
          <section class="flex shrink-0 items-center gap-3 border-y border-[#e2e7f0] bg-[#fbfcff] px-4 py-2.5">
            <h3 class="m-0 shrink-0 text-[12px] font-semibold leading-5 text-[#4563a5]">分析流程：</h3>
            <div class="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[#e7ebf4]">
              <span
                class="block h-full rounded-full bg-[#5878c8] transition-[width]"
                style={{ width: `${progress()}%` }}
              />
            </div>
          </section>
        }
        details={
          <section class="flex min-h-0 flex-col bg-white">
            <header class="shrink-0 border-b border-[#edf0f5] px-4 py-2.5">
              <h3 class="m-0 text-[13px] font-semibold leading-5 text-[#293142]">详情信息</h3>
            </header>
            <div class="deeptrading-scrollbar min-h-0 flex-1 overflow-y-auto px-3 py-3">
              <Switch>
                <Match when={context.selectedAgentId() === "overview"}>
                  <DetailEmpty>请选择上方一级专家查看二级 Agent 内容</DetailEmpty>
                </Match>
                <Match when={context.workbench().nestedAgentSessionsLoading}>
                  <DetailEmpty>正在读取二级 Agent 内容</DetailEmpty>
                </Match>
                <Match when={context.workbench().nestedAgentSessionsError}>
                  {(error) => <DetailEmpty>二级 Agent 内容加载失败：{error()}</DetailEmpty>}
                </Match>
                <Match when={context.workbench().nestedAgentSessions.length > 0}>
                  <div class="space-y-2">
                    <For each={context.workbench().nestedAgentSessions}>
                      {(session) => (
                        <div class="flex w-full min-w-0 items-center gap-2 rounded-[7px] border border-[#e3e7ef] bg-[#fafbfc] px-2.5 py-2">
                          <span class="flex size-8 shrink-0 items-center justify-center rounded-[6px] bg-[#e7ecf7] text-[#5670ad]">
                            <Icon name="fork" class="size-4" />
                          </span>
                          <span class="min-w-0 flex-1">
                            <strong class="block break-words text-[12px] font-medium leading-4 text-[#343b4a]">
                              {session.title}
                            </strong>
                            <Show when={session.agentId}>
                              {(agentId) => (
                                <small class="block break-all text-[10px] leading-4 text-[#8a91a0]">{agentId()}</small>
                              )}
                            </Show>
                          </span>
                          <StatusBadge status={session.status} />
                        </div>
                      )}
                    </For>
                  </div>
                </Match>
                <Match when={true}>
                  <DetailEmpty>当前专家暂无二级 Agent 内容</DetailEmpty>
                </Match>
              </Switch>
            </div>
          </section>
        }
      />
    </div>
  )
}

function DetailEmpty(props: { children: string | string[] }) {
  return (
    <div class="flex h-full min-h-24 items-center justify-center px-4 text-center text-[11px] leading-5 text-[#8a92a1]">
      {props.children}
    </div>
  )
}

function formatElapsed(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1_000))
  const hours = Math.floor(seconds / 3_600)
  const minutes = Math.floor((seconds % 3_600) / 60)
  const remainder = seconds % 60
  if (hours > 0) return `${hours}时${minutes}分${remainder}秒`
  if (minutes > 0) return `${minutes}分${remainder}秒`
  return `${remainder}秒`
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value)
}
