import { For, Show } from "solid-js"
import { WorkbenchStatCard } from "../agent-workbench/stat-card"
import { WorkbenchTeamPanel } from "../agent-workbench/team-panel"
import { SerialAgentDag } from "../agent-workbench/serial-agent-dag"
import { formatCaseCharacterCount } from "@/utils/cmcc-cases"
import { MSTOCK_DAG_ORDER, MSTOCK_DAG_EDGES } from "./config"
import { mstockAvatar } from "./avatars"
import { useMstockWorkbench } from "./workbench-context"

export function MstockTeamTab() {
  const context = useMstockWorkbench()
  const stats = () => {
    const data = context.workbench().stats
    const seconds = Math.floor(data.elapsedMs / 1000)
    return [
      { metric: "elapsed", label: "思考时间", value: `${Math.floor(seconds / 60)}分${seconds % 60}秒` },
      { metric: "tokens", label: "消耗 token", value: data.tokenCount?.toLocaleString() ?? "--" },
      {
        metric: "report-length",
        label: "报告篇幅",
        value: context.reportLength() === undefined ? "--" : formatCaseCharacterCount(context.reportLength()!),
      },
      { metric: "experts", label: "专家团", value: `${data.expertCount} 位` },
    ] as const
  }
  return (
    <div class="flex size-full min-h-0 flex-col gap-3 p-3">
      <section data-workbench-stats aria-label="多股对比统计" class="grid grid-cols-4 gap-1.5">
        <For each={stats()}>{(stat) => <WorkbenchStatCard {...stat} />}</For>
      </section>
      <WorkbenchTeamPanel
        stacked
        dag={
          <div class="min-h-0 flex-1">
            <SerialAgentDag
              layout="vertical"
              label="多股对比 DAG"
              order={MSTOCK_DAG_ORDER}
              edges={MSTOCK_DAG_EDGES}
              nodes={context.workbench().agents}
              selectedAgentId={context.selectedAgentId()}
              onSelect={context.selectAgent}
              avatar={mstockAvatar}
              isEdgeActive={(a, b) => !!a && !!b && a !== "waiting" && b !== "waiting"}
            />
          </div>
        }
        progress={
          <>
            <section class="flex items-center gap-3 border-y border-[#e2e7f0] bg-[#fbfcff] px-4 py-3">
              <span class="text-[12px] text-[#4563a5]">分析流程：</span>
              <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-[#e7ebf4]">
                <span
                  class="block h-full bg-[#5878c8] transition-[width]"
                  style={{ width: `${context.progressPercent()}%` }}
                />
              </div>
            </section>
            <Show
              when={
                context.workbench().overviewStatus === "completed" &&
                !context.workbench().artifacts.some((file) => file.filename === "45-comparison-report.pdf")
              }
            >
              <p class="m-0 px-4 py-2 text-[12px] text-[#8a6b36]">PDF 未生成，已有报告仍可预览和下载。</p>
            </Show>
          </>
        }
        details={
          <section class="min-h-[100px] overflow-auto p-4 text-[12px]">
            <strong>详情信息</strong>
            <For
              each={context.workbench().nestedAgentSessions}
              fallback={
                <p class="text-[#8a91a0]">
                  {context.selectedAgentId() === "overview"
                    ? "请选择上方专家查看下级 Agent 内容"
                    : "当前专家没有下级 Agent"}
                </p>
              }
            >
              {(item) => (
                <button
                  class="mt-2 block w-full truncate text-left text-[#5271b7]"
                  onClick={() => void context.retrySession(item.id)}
                >
                  {item.title} · {item.status}
                </button>
              )}
            </For>
          </section>
        }
      />
    </div>
  )
}
