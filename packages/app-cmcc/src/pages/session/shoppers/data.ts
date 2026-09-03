import type { AgentNodeStatus, AgentNodeView, SessionArtifact, SessionTranscript } from "../agent-workbench/model"

export type ShoppersRecommendationSummary = {
  productCount: number
}

export function shoppersProgress(input: { nodes: readonly AgentNodeView[]; requiredAgentIds: readonly string[] }) {
  const nodes = new Map(input.nodes.map((node) => [node.id, node]))
  const completed = input.requiredAgentIds.filter((agentId) => nodes.get(agentId)?.status === "completed").length
  return Math.round((completed / Math.max(1, input.requiredAgentIds.length)) * 100)
}

export function isShoppersDagEdgeActive(source: AgentNodeStatus | undefined, target: AgentNodeStatus | undefined) {
  return source !== undefined && source !== "waiting" && target !== undefined && target !== "waiting"
}

export function parseShoppersRecommendation(value: string): ShoppersRecommendationSummary | undefined {
  for (const candidate of jsonCandidates(value)) {
    let parsed: unknown
    try {
      parsed = JSON.parse(candidate)
    } catch {
      continue
    }
    if (!isRecord(parsed) || !Array.isArray(parsed.products)) continue
    const productCount = parsed.products.filter(
      (product) =>
        isRecord(product) &&
        !!text(product.title ?? product.id) &&
        typeof product.recommendationIndex === "number" &&
        Number.isFinite(product.recommendationIndex),
    ).length
    if (productCount > 0) return { productCount }
  }
}

export function recommendationFromCardEditorTasks(root: SessionTranscript, cardEditorAgentId: string) {
  return root.messages
    .flatMap((message) =>
      (root.parts[message.id] ?? []).flatMap((part) => {
        if (
          part.type !== "tool" ||
          part.tool !== "task" ||
          part.state.status !== "completed" ||
          part.state.input.subagent_type !== cardEditorAgentId
        )
          return []
        const recommendation = parseShoppersRecommendation(part.state.output)
        return recommendation ? [{ recommendation, completedAt: part.state.time.end, partId: part.id }] : []
      }),
    )
    .sort((left, right) => right.completedAt - left.completedAt || right.partId.localeCompare(left.partId))[0]
    ?.recommendation
}

export function cardEditorJsonArtifacts(artifacts: readonly SessionArtifact[], cardEditorAgentId: string) {
  return artifacts
    .filter(
      (artifact) => artifact.ownerAgentId === cardEditorAgentId && artifact.filename.toLowerCase().endsWith(".json"),
    )
    .sort((left, right) => (right.createdAt ?? 0) - (left.createdAt ?? 0) || right.path.localeCompare(left.path))
}

export function shoppersArtifactDirectoryWarning(input: {
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

function jsonCandidates(value: string) {
  const candidates = [value.trim()]
  for (const match of value.matchAll(/```json\s*([\s\S]*?)```/gi)) {
    if (match[1]?.trim()) candidates.push(match[1].trim())
  }
  return [...new Set(candidates.filter(Boolean))]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function text(value: unknown) {
  if (typeof value === "string" && value.trim()) return value.trim()
  if (typeof value === "number") return String(value)
  return
}

function normalize(value: string): string
function normalize(value?: string): string | undefined
function normalize(value?: string) {
  return value
    ?.replaceAll("\\", "/")
    .replace(/^\/+|\/+$/g, "")
    .toLowerCase()
}
