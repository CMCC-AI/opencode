import type { DataSet, Edge, Network, Node, Options } from "vis-network/standalone"
import { createEffect, createSignal, on, onCleanup, onMount, Show } from "solid-js"
import { createStore } from "solid-js/store"
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/utils/cmcc-knowledge"
import { Persist, persisted } from "@/utils/persist"

export function ForceKnowledgeGraph(props: {
  nodes: KnowledgeGraphNode[]
  edges: KnowledgeGraphEdge[]
  selection: string
  matched: Set<string>
  query: string
  resetKey: number
  select: (node: KnowledgeGraphNode) => void
}) {
  const [ready, setReady] = createSignal(false)
  const [simulating, setSimulating] = createSignal(false)
  const [settings, setSettings] = createSignal(false)
  const [preferences, setPreferences] = persisted(
    Persist.global("knowledge-graph"),
    createStore({
      nodeScale: 1.2,
      linkDistance: 70,
      repulsion: 120,
    }),
  )
  let container: HTMLDivElement | undefined
  let network: Network | undefined
  let nodeData: DataSet<Node> | undefined
  let edgeData: DataSet<Edge> | undefined
  let topology = ""
  let simulationTimer: number | undefined
  let fitAfterStabilization = false
  let disposed = false

  const colors = () => {
    const style = getComputedStyle(container ?? document.documentElement)
    return {
      background: style.getPropertyValue("--v2-background-bg-deep").trim() || "#fafafa",
      text: style.getPropertyValue("--v2-text-text-base").trim() || "#252525",
      muted: style.getPropertyValue("--v2-text-text-muted").trim() || "#777777",
      edge: style.getPropertyValue("--v2-border-border-strong").trim() || "#b5b5b5",
    }
  }

  const options = (): Options => {
    const color = colors()
    return {
      autoResize: true,
      interaction: {
        dragNodes: true,
        dragView: true,
        hover: true,
        hoverConnectedEdges: true,
        keyboard: false,
        multiselect: false,
        navigationButtons: false,
        selectConnectedEdges: true,
        tooltipDelay: 120,
        zoomSpeed: 0.45,
        zoomView: true,
      },
      nodes: {
        borderWidth: 0,
        borderWidthSelected: 4,
        chosen: true,
        shape: "dot",
        font: {
          color: color.text,
          face: "var(--font-sans, system-ui, sans-serif)",
          size: 12,
          strokeColor: color.background,
          strokeWidth: 4,
        },
        shadow: { enabled: true, color: "rgba(0, 0, 0, 0.12)", size: 8, x: 0, y: 2 },
      },
      edges: {
        arrowStrikethrough: false,
        arrows: { to: { enabled: true, scaleFactor: 0.32 } },
        color: { color: color.edge, highlight: "#d49a35", hover: "#d49a35", opacity: 0.38 },
        hoverWidth: 1.8,
        selectionWidth: 2.2,
        smooth: false,
        width: 0.8,
      },
      layout: { improvedLayout: false, randomSeed: 7 },
      physics: {
        adaptiveTimestep: true,
        enabled: true,
        forceAtlas2Based: {
          avoidOverlap: 0.35,
          centralGravity: 0.08,
          damping: 0.48,
          gravitationalConstant: -preferences.repulsion,
          springConstant: 0.08,
          springLength: preferences.linkDistance,
        },
        maxVelocity: 48,
        minVelocity: 0.75,
        solver: "forceAtlas2Based",
        stabilization: { enabled: true, fit: false, iterations: 64, onlyDynamicEdges: false, updateInterval: 16 },
        timestep: props.nodes.length > 64 ? 0.22 : 0.38,
      },
    }
  }

  const graphNode = (node: KnowledgeGraphNode): Node => {
    const active = props.selection === node.id
    const hit = props.matched.has(node.id)
    const dimmed = Boolean(props.query) && !hit
    const background = graphColor(node)
    return {
      id: node.id,
      label: node.degree > 0 || active || hit ? truncate(node.label, 24) : "",
      title: `${node.label}\n${node.degree} 个关联`,
      size: (8 + Math.min(15, Math.sqrt(node.degree) * 3.2)) * preferences.nodeScale,
      color: {
        background: dimmed ? withAlpha(background, 0.2) : background,
        border: active || hit ? "#d49a35" : background,
        highlight: { background, border: "#d49a35" },
        hover: { background, border: "#d49a35" },
      },
      font: { color: dimmed ? colors().muted : colors().text },
    }
  }

  const graphEdge = (edge: KnowledgeGraphEdge): Edge => ({
    id: edge.id,
    from: edge.source,
    to: edge.target,
    color:
      props.selection && edge.source !== props.selection && edge.target !== props.selection
        ? { color: colors().edge, opacity: 0.1 }
        : undefined,
  })

  const syncGraph = () => {
    if (!network || !nodeData || !edgeData) return
    const nextNodes = props.nodes.map(graphNode)
    const nextEdges = props.edges.map(graphEdge)
    const nextNodeIDs = new Set(nextNodes.map((node) => node.id))
    const nextEdgeIDs = new Set(nextEdges.map((edge) => edge.id))
    nodeData.remove(nodeData.getIds().filter((id) => !nextNodeIDs.has(id)))
    edgeData.remove(edgeData.getIds().filter((id) => !nextEdgeIDs.has(id)))
    nodeData.update(nextNodes)
    edgeData.update(nextEdges)

    const nextTopology = `${props.nodes.map((node) => node.id).join("\u0000")}\u0001${props.edges
      .map((edge) => edge.id)
      .join("\u0000")}`
    if (nextTopology !== topology) {
      fitAfterStabilization = true
      topology = nextTopology
      setSimulating(true)
      network.setOptions(options())
      network.stabilize(64)
    }
    if (props.selection && nextNodeIDs.has(props.selection)) {
      network.selectNodes([props.selection], true)
      return
    }
    network.unselectAll()
  }

  const stopSimulation = () => {
    window.clearTimeout(simulationTimer)
    network?.stopSimulation()
    network?.setOptions({ physics: { enabled: false } })
    setSimulating(false)
  }

  const stopSimulationLater = () => {
    window.clearTimeout(simulationTimer)
    simulationTimer = window.setTimeout(() => {
      stopSimulation()
    }, 2200)
  }

  const reheat = () => {
    if (!network) return
    setSimulating(true)
    network.setOptions(options())
    network.startSimulation()
    stopSimulationLater()
  }

  const fit = () =>
    network?.fit({ animation: { duration: 650, easingFunction: "easeInOutQuad" }, maxZoomLevel: 1.25 })

  const zoom = (factor: number) => {
    if (!network) return
    network.moveTo({
      animation: { duration: 260, easingFunction: "easeInOutQuad" },
      scale: Math.max(0.08, Math.min(3, network.getScale() * factor)),
    })
  }

  onMount(() => {
    void import("vis-network/standalone").then(({ DataSet, Network }) => {
      if (disposed || !container) return
      nodeData = new DataSet<Node>()
      edgeData = new DataSet<Edge>()
      network = new Network(container, { nodes: nodeData, edges: edgeData }, options())
      network.on("stabilizationIterationsDone", () => {
        stopSimulation()
        if (!fitAfterStabilization) return
        fitAfterStabilization = false
        fit()
      })
      network.on("dragStart", (event) => {
        if (event.nodes.length === 0) return
        window.clearTimeout(simulationTimer)
        setSimulating(true)
        network?.setOptions(options())
        network?.startSimulation()
      })
      network.on("dragEnd", (event) => {
        if (event.nodes.length === 0) return
        stopSimulationLater()
      })
      network.on("click", (event) => {
        if (event.nodes.length !== 1) return
        const node = props.nodes.find((item) => item.id === String(event.nodes[0]))
        if (node) props.select(node)
      })
      setReady(true)
      syncGraph()
    })
  })

  createEffect(() => {
    props.nodes
    props.edges
    props.selection
    props.matched
    props.query
    preferences.nodeScale
    if (ready()) syncGraph()
  })

  createEffect(
    on(
      [() => preferences.linkDistance, () => preferences.repulsion],
      () => {
        if (ready()) reheat()
      },
      { defer: true },
    ),
  )

  createEffect(
    on(
      () => props.resetKey,
      () => {
        if (ready()) fit()
      },
      { defer: true },
    ),
  )

  onCleanup(() => {
    disposed = true
    window.clearTimeout(simulationTimer)
    network?.destroy()
  })

  return (
    <div class="absolute inset-0" data-testid="knowledge-graph-canvas">
      <div
        ref={container}
        class="size-full touch-none"
        role="img"
        aria-label={`可拖拽知识关系图谱，${props.nodes.length} 个节点，${props.edges.length} 条关系`}
      />
      <Show when={!ready()}>
        <div class="pointer-events-none absolute inset-0 grid place-items-center">
          <span class="size-5 animate-spin rounded-full border-2 border-v2-border-border-strong border-r-transparent" />
        </div>
      </Show>
      <div class="absolute bottom-2 right-2 flex items-center gap-1 rounded-[7px] border border-v2-border-border-base bg-v2-background-bg-layer-01/95 p-1 shadow-sm">
        <GraphControl label="缩小" click={() => zoom(0.8)}>−</GraphControl>
        <GraphControl label="放大" click={() => zoom(1.25)}>+</GraphControl>
        <GraphControl label="适配全部节点" click={fit}>◎</GraphControl>
        <GraphControl label={simulating() ? "暂停布局" : "重新运行力导向布局"} click={() => {
          if (!network) return
          if (simulating()) {
            network.stopSimulation()
            setSimulating(false)
            return
          }
          reheat()
        }}>
          {simulating() ? "Ⅱ" : "▶"}
        </GraphControl>
        <GraphControl label="图谱参数" active={settings()} click={() => setSettings((value) => !value)}>⚙</GraphControl>
      </div>
      <Show when={settings()}>
        <div class="absolute bottom-12 right-2 w-[210px] rounded-[9px] border border-v2-border-border-base bg-v2-background-bg-layer-01/95 p-3 shadow-lg backdrop-blur-sm">
          <GraphRange
            label="节点大小"
            min={0.65}
            max={1.6}
            step={0.05}
            value={preferences.nodeScale}
            input={(value) => setPreferences("nodeScale", value)}
          />
          <GraphRange
            label="连线距离"
            min={35}
            max={180}
            step={5}
            value={preferences.linkDistance}
            input={(value) => setPreferences("linkDistance", value)}
          />
          <GraphRange
            label="节点斥力"
            min={30}
            max={800}
            step={10}
            value={preferences.repulsion}
            input={(value) => setPreferences("repulsion", value)}
          />
        </div>
      </Show>
    </div>
  )
}

function GraphControl(props: { label: string; active?: boolean; click: () => void; children: string }) {
  return (
    <button
      type="button"
      class="flex size-7 items-center justify-center rounded-[5px] text-[12px] font-medium text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base data-[active]:bg-v2-background-bg-layer-03 data-[active]:text-v2-text-text-base"
      data-active={props.active ? "" : undefined}
      title={props.label}
      aria-label={props.label}
      onClick={props.click}
    >
      {props.children}
    </button>
  )
}

function GraphRange(props: {
  label: string
  min: number
  max: number
  step: number
  value: number
  input: (value: number) => void
}) {
  return (
    <label class="mb-2.5 block last:mb-0">
      <span class="mb-1 flex items-center justify-between text-[10px] text-v2-text-text-muted">
        <span>{props.label}</span>
        <span class="text-v2-text-text-faint">{props.value}</span>
      </span>
      <input
        class="block h-4 w-full accent-v2-text-text-base"
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onInput={(event) => props.input(Number(event.currentTarget.value))}
      />
    </label>
  )
}

function graphColor(node: KnowledgeGraphNode) {
  if (node.degree >= 10) return "#c8892d"
  if (node.degree >= 5) return "#557ac2"
  if (node.degree >= 2) return "#3a8f75"
  return "#7d8da0"
}

function truncate(value: string, length: number) {
  if (value.length <= length) return value
  return `${value.slice(0, length - 1)}…`
}

function withAlpha(color: string, alpha: number) {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return color
  return `${color}${Math.round(alpha * 255)
    .toString(16)
    .padStart(2, "0")}`
}
