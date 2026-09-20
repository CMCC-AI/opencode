import { For, Show } from "solid-js"
import { SerialAgentDag } from "../agent-workbench/serial-agent-dag"
import { formatCaseCharacterCount } from "@/utils/cmcc-cases"
import { MSTOCK_DAG_ORDER, MSTOCK_DAG_EDGES, mstockAvatar } from "./config"
import { useMstockWorkbench } from "./workbench-context"

export function MstockTeamTab() {
  const context = useMstockWorkbench()
  const stats = () => {
    const data = context.workbench().stats
    const seconds = Math.floor(data.elapsedMs / 1000)
    return [
      ["思考时间", `${Math.floor(seconds / 60)}分${seconds % 60}秒`],
      ["消耗 token", data.tokenCount?.toLocaleString() ?? "--"],
      ["报告篇幅", context.reportLength() === undefined ? "--" : formatCaseCharacterCount(context.reportLength()!)],
      ["专家团", `${data.expertCount} 位`],
    ]
  }
  return (
    <div class="flex size-full min-h-0 flex-col gap-3 p-3">
      <section aria-label="多股对比统计" class="grid grid-cols-4 gap-1.5">
        <For each={stats()}>
          {(stat) => (
            <div class="min-w-0 rounded-[7px] border border-[#dce5f5] bg-[#f4f7fd] p-2">
              <span class="block text-[10px] text-[#7d8594]">{stat[0]}</span>
              <strong class="block break-words text-[13px] text-[#293142]">{stat[1]}</strong>
            </div>
          )}
        </For>
      </section>
      <div class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[8px] border border-[#dfe4ed] bg-white">
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
      </div>
    </div>
  )
}
