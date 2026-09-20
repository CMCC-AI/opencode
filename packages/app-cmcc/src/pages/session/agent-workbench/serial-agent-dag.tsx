import { For, createMemo, createUniqueId, onCleanup, onMount } from "solid-js"
import { createStore } from "solid-js/store"
import { AgentAvatar } from "../deeptrading/deeptrading-session-view"
import type { AgentNodeStatus, AgentNodeView } from "./model"
import { serialDagEdgePath, serialDagRows } from "./serial-dag-layout"
import "./serial-agent-dag.css"

export function SerialAgentDag(props: {
  layout?: "folded" | "vertical"
  label: string
  order: readonly string[]
  edges: readonly (readonly [string, string])[]
  nodes: readonly AgentNodeView[]
  selectedAgentId: string
  onSelect: (agentId: string) => void
  avatar: (agentId: string) => string | undefined
  isEdgeActive: (source: AgentNodeStatus | undefined, target: AgentNodeStatus | undefined) => boolean
}) {
  let surface: HTMLDivElement | undefined
  const elements = new Map<string, HTMLButtonElement>()
  const rows = createMemo(() => serialDagRows(props.order, props.layout))
  const columns = createMemo(() => Math.max(1, ...rows().map((row) => row.length)))
  const nodes = createMemo(() => new Map(props.nodes.map((node) => [node.id, node])))
  const [geometry, setGeometry] = createStore({
    width: 1,
    height: 1,
    paths: [] as Array<{ key: string; source: string; target: string; d: string }>,
  })
  const id = createUniqueId()
  const active = (source: string, target: string) =>
    props.isEdgeActive(nodes().get(source)?.status, nodes().get(target)?.status)

  onMount(() => {
    let frame: number | undefined
    let disposed = false
    const update = () => {
      frame = undefined
      if (!surface || disposed) return
      const bounds = surface.getBoundingClientRect()
      if (bounds.width <= 0 || bounds.height <= 0) return
      setGeometry({
        width: bounds.width,
        height: bounds.height,
        paths: props.edges.flatMap(([source, target]) => {
          const from = elements.get(source)
          const to = elements.get(target)
          if (!from || !to) return []
          return [
            {
              key: `${source}->${target}`,
              source,
              target,
              d: serialDagEdgePath(from.getBoundingClientRect(), to.getBoundingClientRect(), bounds, props.layout),
            },
          ]
        }),
      })
    }
    const schedule = () => {
      if (disposed || frame !== undefined) return
      frame = requestAnimationFrame(update)
    }
    schedule()
    const observer = new ResizeObserver(schedule)
    if (surface) observer.observe(surface)
    for (const element of elements.values()) observer.observe(element)
    onCleanup(() => {
      disposed = true
      observer.disconnect()
      if (frame !== undefined) cancelAnimationFrame(frame)
    })
  })

  return (
    <section
      aria-label={props.label}
      class="serial-agent-dag deeptrading-scrollbar"
      data-serial-dag
      data-layout={props.layout ?? "folded"}
      data-columns={columns()}
      style={{
        "--serial-node-width": `calc((100% - ${(columns() - 1) * 12}px) / ${columns()})`,
        "--serial-min-width": `${columns() * 54 + (columns() - 1) * 12 + 36}px`,
      }}
    >
      <div ref={surface} class="serial-dag-surface">
        <svg aria-hidden="true" class="serial-dag-connections" viewBox={`0 0 ${geometry.width} ${geometry.height}`}>
          <defs>
            <marker
              id={`${id}-waiting`}
              viewBox="0 0 8 8"
              refX="7"
              refY="4"
              markerWidth="6"
              markerHeight="6"
              orient="auto"
              markerUnits="userSpaceOnUse"
            >
              <path d="M 0 0 L 8 4 L 0 8 Z" fill="#aeb9ca" />
            </marker>
            <marker
              id={`${id}-active`}
              viewBox="0 0 8 8"
              refX="7"
              refY="4"
              markerWidth="6"
              markerHeight="6"
              orient="auto"
              markerUnits="userSpaceOnUse"
            >
              <path d="M 0 0 L 8 4 L 0 8 Z" fill="#4f7df3" />
            </marker>
          </defs>
          <For each={geometry.paths}>
            {(edge) => (
              <path
                data-edge={edge.key}
                d={edge.d}
                fill="none"
                stroke={active(edge.source, edge.target) ? "#4f7df3" : "#aeb9ca"}
                stroke-width="1.5"
                stroke-dasharray="5 4"
                stroke-linecap="round"
                stroke-linejoin="round"
                marker-end={`url(#${id}-${active(edge.source, edge.target) ? "active" : "waiting"})`}
              />
            )}
          </For>
        </svg>
        <div
          class="serial-dag-rows"
          style={{ "grid-template-rows": `repeat(${Math.max(1, rows().length)}, minmax(0, 1fr))` }}
        >
          <For each={rows()}>
            {(row, index) => (
              <div class="serial-dag-row" data-reversed={props.layout !== "vertical" && index() === 1 ? "" : undefined}>
                <For each={row}>
                  {(agentId) => {
                    const node = createMemo(() => nodes().get(agentId))
                    return (
                      <button
                        type="button"
                        class="serial-dag-node"
                        data-agent-id={agentId}
                        data-status={node()?.status ?? "waiting"}
                        data-selected={props.selectedAgentId === agentId ? "" : undefined}
                        title={`${node()?.profession ?? agentId} · ${node()?.name ?? agentId}`}
                        ref={(element) => elements.set(agentId, element)}
                        onClick={() => props.onSelect(agentId)}
                      >
                        <AgentAvatar src={props.avatar(agentId)} name={node()?.name ?? "?"} size="compact" />
                        <span class="serial-dag-label">
                          <strong>{node()?.profession ?? agentId}</strong>
                          <small>{node()?.name ?? ""}</small>
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
  )
}
