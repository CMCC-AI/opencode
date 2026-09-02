import type { AgentNodeStatus, AgentNodeView, ArtifactDiscovery } from "../agent-workbench/model"

export function zhengqiPublicResearchTranscripts<T extends { session: { agent?: string } }>(
  transcripts: readonly T[],
  publicResearchAgentId: string,
) {
  return transcripts.filter((transcript) => transcript.session.agent === publicResearchAgentId)
}

export function zhengqiProgress(input: { nodes: readonly AgentNodeView[]; requiredAgentIds: readonly string[] }) {
  const nodes = new Map(input.nodes.map((node) => [node.id, node]))
  const completed = input.requiredAgentIds.filter((agentId) => nodes.get(agentId)?.status === "completed").length
  return Math.round((completed / Math.max(1, input.requiredAgentIds.length)) * 100)
}

export function isZhengqiDagEdgeActive(source: AgentNodeStatus | undefined, target: AgentNodeStatus | undefined) {
  return source !== undefined && source !== "waiting" && target !== undefined && target !== "waiting"
}

export function scopeZhengqiArtifacts(discovery: ArtifactDiscovery, artifactRoot?: string): ArtifactDiscovery {
  const root = normalize(artifactRoot)
  if (!root) return discovery
  const artifacts = discovery.artifacts.filter((artifact) => isWithin(normalize(artifact.path), root))
  const omitted = discovery.artifacts.length - artifacts.length
  const runDirectory = discovery.runDirectory
  const scopedRunDirectory = runDirectory && isWithin(normalize(runDirectory), root) ? runDirectory : undefined
  return {
    artifacts,
    runDirectory: scopedRunDirectory,
    ambiguities: [
      ...discovery.ambiguities,
      ...(omitted > 0 ? [`检测到 ${omitted} 个写入会话产物目录外的文件，已从政企文件列表排除`] : []),
    ],
  }
}

function isWithin(path: string, root: string) {
  return path === root || path.startsWith(`${root}/`)
}

function normalize(value: string): string
function normalize(value?: string): string | undefined
function normalize(value?: string) {
  return value
    ?.replaceAll("\\", "/")
    .replace(/^\/+|\/+$/g, "")
    .toLowerCase()
}
