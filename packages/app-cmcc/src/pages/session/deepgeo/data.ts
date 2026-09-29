import type { AgentNodeStatus, AgentNodeView, SessionArtifact } from "../agent-workbench/model"

export function deepGeoProgress(input: { nodes: readonly AgentNodeView[]; requiredAgentIds: readonly string[] }) {
  const nodes = new Map(input.nodes.map((node) => [node.id, node]))
  const completed = input.requiredAgentIds.filter((agentId) => nodes.get(agentId)?.status === "completed").length
  return Math.round((completed / Math.max(1, input.requiredAgentIds.length)) * 100)
}

export function isDeepGeoDagEdgeActive(source: AgentNodeStatus | undefined, target: AgentNodeStatus | undefined) {
  return source !== undefined && source !== "waiting" && target !== undefined && target !== "waiting"
}

export function deepGeoReportChartCount(artifacts: readonly SessionArtifact[]) {
  return artifacts.filter((artifact) => artifact.filename.toLowerCase().endsWith(".svg")).length
}

export function deepGeoArtifactOwnerLabel(agentId: string, knownLabel?: string) {
  return knownLabel ?? (agentId.trim() || "产物目录扫描")
}

export function deepGeoArtifactDirectoryWarning(input: {
  artifacts: readonly SessionArtifact[]
  artifactRoot?: string
}) {
  const root = normalize(input.artifactRoot)
  if (!root) return
  const outside = input.artifacts.filter((artifact) => {
    const path = normalize(artifact.path)
    return path !== root && !path.startsWith(`${root}/`)
  }).length
  return outside > 0
    ? `检测到 ${outside} 个文件未写入独立会话产物目录，已按当前会话的真实 write 记录兼容展示`
    : undefined
}

function normalize(value: string): string
function normalize(value?: string): string | undefined
function normalize(value?: string) {
  return value
    ?.replaceAll("\\", "/")
    .replace(/^\/+|\/+$/g, "")
    .toLowerCase()
}
