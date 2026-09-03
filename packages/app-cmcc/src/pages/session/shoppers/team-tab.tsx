import { Icon } from "@opencode-ai/ui/icon"
import { For, Match, Show, Switch, createMemo, createSignal, onCleanup, onMount } from "solid-js"
import type { AgentNodeStatus } from "../agent-workbench/model"
import { AgentAvatar, StatusBadge } from "../deeptrading/deeptrading-session-view"
import { SHOPPERS_DAG_EDGES, SHOPPERS_DAG_LEVELS, SHOPPERS_REQUIRED_MEMBER_IDS, shoppersAvatar } from "./config"
import { isShoppersDagEdgeActive, shoppersProgress } from "./data"
import { useShoppersWorkbench } from "./workbench-context"

export function ShoppersTeamTab() {
  const context = useShoppersWorkbench()
  const nodes = createMemo(() => new Map(context.workbench().agents.map((agent) => [agent.id, agent])))
  const progress = createMemo(() =>
    context.workbench().loading
      ? 0
      : shoppersProgress({ nodes: context.workbench().agents, requiredAgentIds: SHOPPERS_REQUIRED_MEMBER_IDS }),
  )
  let dagContainer: HTMLDivElement | undefined
  const dagNodes = new Map<string, HTMLButtonElement>()
  const stats = createMemo(() => {
    const data = context.workbench()
    const tokenCount = data.stats.tokenCount
    const recommendationCount = context.recommendationCount()
    return [
      {
        key: "elapsed",
        label: "思考时间",
        value: data.loading ? "--" : formatElapsed(data.stats.elapsedMs),
        icon: "brain" as const,
      },
      {
        key: "tokens",
        label: "消耗 token",
        value: data.loading || tokenCount === undefined ? "--" : formatNumber(tokenCount),
        icon: "code-lines" as const,
      },
      {
        key: "products",
        label: "推荐商品",
        value: data.loading || recommendationCount === undefined ? "--" : `${formatNumber(recommendationCount)} 款`,
        icon: "magnifying-glass" as const,
      },
      {
        key: "experts",
        label: "专家团",
        value: `${data.stats.expertCount} 位`,
        icon: "fork" as const,
      },
    ]
  })

  return (
    <div class="flex size-full min-h-0 flex-col gap-3 px-3 py-3">
      <section aria-label="推荐分析统计" class="grid grid-cols-4 gap-1.5">
        <For each={stats()}>
          {(stat) => (
            <div class="flex min-h-[64px] min-w-0 items-center gap-1.5 rounded-[7px] border border-[#dce5f5] bg-[#f4f7fd] p-2">
              <span class="flex size-7 shrink-0 items-center justify-center rounded-[6px] bg-[#dfe8fb] text-[#4969b4]">
                <Icon name={stat.icon} class="size-3.5" />
              </span>
              <span class="min-w-0">
                <span class="block break-words text-[10px] leading-4 text-[#7d8594]">{stat.label}</span>
                <strong class="block break-words text-[13px] font-semibold leading-4 text-[#293142]">
                  {stat.value}
                </strong>
              </span>
            </div>
          )}
        </For>
      </section>

      <div class="grid min-h-0 flex-1 grid-rows-[minmax(0,2fr)_auto_minmax(0,1fr)] overflow-hidden rounded-[8px] border border-[#dfe4ed] bg-white">
        <section aria-label="推荐分析 DAG" class="min-h-0 overflow-hidden bg-[#f9fbff] px-3 py-1">
          <div ref={dagContainer} class="relative mx-auto h-full w-full max-w-[860px]">
            <DagConnections
              getContainer={() => dagContainer}
              getNode={(agentId) => dagNodes.get(agentId)}
              nodes={nodes()}
            />
            <div
              class="relative z-10 grid h-full min-h-0"
              style={{ "grid-template-rows": `repeat(${SHOPPERS_DAG_LEVELS.length}, minmax(0, 1fr))` }}
            >
              <For each={SHOPPERS_DAG_LEVELS}>
                {(level) => (
                  <div
                    class="grid min-h-0 items-center gap-2"
                    style={{ "grid-template-columns": `repeat(${level.length}, minmax(0, 1fr))` }}
                  >
                    <For each={level}>
                      {(agentId) => {
                        const node = createMemo(() => nodes().get(agentId))
                        return (
                          <button
                            type="button"
                            data-status={node()?.status ?? "waiting"}
                            data-selected={context.selectedAgentId() === agentId ? "" : undefined}
                            class="relative mx-auto flex h-[clamp(34px,76%,44px)] w-full max-w-[154px] min-w-0 items-center gap-1.5 rounded-full border border-[#cfdaee] bg-white px-1 py-1 text-left shadow-[0_2px_8px_rgba(45,68,112,0.06)] transition hover:border-[#8fa9df] hover:shadow-[0_4px_12px_rgba(45,68,112,0.10)] data-[selected]:border-[#6687d6] data-[selected]:bg-[#f1f5ff] data-[selected]:shadow-[0_0_0_2px_rgba(82,113,183,0.12)] data-[status=completed]:border-[#a9d8c2] data-[status=failed]:border-[#e6aaaa] data-[status=running]:border-[#91abe2]"
                            title={`${node()?.profession ?? agentId} · ${node()?.name ?? agentId}`}
                            ref={(element) => dagNodes.set(agentId, element)}
                            onClick={() => context.selectAgent(agentId)}
                          >
                            <AgentAvatar src={shoppersAvatar(agentId)} name={node()?.name ?? "?"} size="compact" />
                            <span class="min-w-0 flex-1">
                              <strong class="block truncate text-[10px] font-semibold leading-4 text-[#303746]">
                                {node()?.profession ?? "等待会话"}
                              </strong>
                              <small class="block truncate text-[9px] leading-3 text-[#8992a3]">
                                {node()?.name ?? agentId}
                              </small>
                            </span>
                          </button>
                        )
                      }}
                    </For>
                  </div>
                )}
              </For>
            </div>
          </div>
        </section>

        <section class="flex shrink-0 items-center gap-3 border-y border-[#e2e7f0] bg-[#fbfcff] px-4 py-2.5">
          <h3 class="m-0 shrink-0 text-[12px] font-semibold leading-5 text-[#4563a5]">分析流程：</h3>
          <div class="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[#e7ebf4]">
            <span
              class="block h-full rounded-full bg-[#5878c8] transition-[width]"
              style={{ width: `${progress()}%` }}
            />
          </div>
        </section>

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
      </div>
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

const DAG_VIEWBOX_WIDTH = 1_000
const DAG_VIEWBOX_HEIGHT = 1_000

type DagPath = { key: string; d: string }

function DagConnections(props: {
  getContainer: () => HTMLDivElement | undefined
  getNode: (agentId: string) => HTMLButtonElement | undefined
  nodes: ReadonlyMap<string, { status: AgentNodeStatus }>
}) {
  const [paths, setPaths] = createSignal<DagPath[]>([])
  const activePaths = createMemo(() => {
    const keys = new Set(
      SHOPPERS_DAG_EDGES.filter(([source, target]) =>
        isShoppersDagEdgeActive(props.nodes.get(source)?.status, props.nodes.get(target)?.status),
      ).map(([source, target]) => edgeKey(source, target)),
    )
    return paths().filter((path) => keys.has(path.key))
  })

  onMount(() => {
    let disposed = false
    const update = () => {
      const container = props.getContainer()
      if (!container) return
      const containerRect = container.getBoundingClientRect()
      setPaths(
        SHOPPERS_DAG_EDGES.flatMap(([sourceId, targetId]) => {
          const source = props.getNode(sourceId)
          const target = props.getNode(targetId)
          if (!source || !target || containerRect.width === 0 || containerRect.height === 0) return []
          return [{ key: edgeKey(sourceId, targetId), d: edgePath(source, target, containerRect) }]
        }),
      )
    }
    const schedule = () => queueMicrotask(() => !disposed && update())
    schedule()
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(schedule)
    const container = props.getContainer()
    if (container) observer.observe(container)
    for (const agentId of SHOPPERS_DAG_LEVELS.flat()) {
      const node = props.getNode(agentId)
      if (node) observer.observe(node)
    }
    onCleanup(() => {
      disposed = true
      observer.disconnect()
    })
  })

  return (
    <svg
      aria-hidden="true"
      class="pointer-events-none absolute inset-0 z-0 size-full"
      viewBox={`0 0 ${DAG_VIEWBOX_WIDTH} ${DAG_VIEWBOX_HEIGHT}`}
      preserveAspectRatio="none"
    >
      <g
        fill="none"
        stroke="#c5ccd8"
        stroke-width="1.2"
        stroke-dasharray="5 4"
        stroke-linecap="round"
        stroke-linejoin="round"
        vector-effect="non-scaling-stroke"
      >
        <For each={paths()}>{(path) => <path d={path.d} />}</For>
      </g>
      <g
        fill="none"
        stroke="#4f7df3"
        stroke-width="1.5"
        stroke-dasharray="5 4"
        stroke-linecap="round"
        stroke-linejoin="round"
        vector-effect="non-scaling-stroke"
      >
        <For each={activePaths()}>{(path) => <path d={path.d} />}</For>
      </g>
    </svg>
  )
}

function edgeKey(sourceId: string, targetId: string) {
  return `${sourceId}->${targetId}`
}

function edgePath(source: HTMLButtonElement, target: HTMLButtonElement, container: DOMRect) {
  const sourceRect = source.getBoundingClientRect()
  const targetRect = target.getBoundingClientRect()
  const sourcePoint = toPoint(sourceRect.left + sourceRect.width / 2, sourceRect.bottom, container)
  const targetPoint = toPoint(targetRect.left + targetRect.width / 2, targetRect.top, container)
  if (sourcePoint.x === targetPoint.x) return `M ${sourcePoint.x} ${sourcePoint.y} V ${targetPoint.y}`
  const middleY = (sourcePoint.y + targetPoint.y) / 2
  const direction = targetPoint.x > sourcePoint.x ? 1 : -1
  const radius = Math.min(10, Math.abs(targetPoint.x - sourcePoint.x) / 2, Math.abs(targetPoint.y - sourcePoint.y) / 4)
  return [
    `M ${sourcePoint.x} ${sourcePoint.y}`,
    `V ${middleY - radius}`,
    `Q ${sourcePoint.x} ${middleY} ${sourcePoint.x + direction * radius} ${middleY}`,
    `H ${targetPoint.x - direction * radius}`,
    `Q ${targetPoint.x} ${middleY} ${targetPoint.x} ${middleY + radius}`,
    `V ${targetPoint.y}`,
  ].join(" ")
}

function toPoint(x: number, y: number, container: DOMRect) {
  return {
    x: ((x - container.left) / container.width) * DAG_VIEWBOX_WIDTH,
    y: ((y - container.top) / container.height) * DAG_VIEWBOX_HEIGHT,
  }
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
