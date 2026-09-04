import type { Session } from "@opencode-ai/sdk/v2"
import type { AgentNodeStatus, AgentNodeView, SessionArtifact, SessionTranscript } from "../agent-workbench/model"
import { deriveSessionStatus, sessionCompletedAt } from "../agent-workbench/session-adapter"

export type AiScienceExecutionView = {
  id: string
  title: string
  status: AgentNodeStatus
  startedAt?: number
  completedAt?: number
  current: boolean
}

export type AiScienceArtifactTreeNode = {
  name: string
  path: string
  artifact?: SessionArtifact
  children: AiScienceArtifactTreeNode[]
}

export function buildAiScienceExecutions(input: {
  agentId: string
  children: readonly Session[]
  transcripts: ReadonlyMap<string, SessionTranscript>
  preferredSessionId?: string
  loadErrors?: Readonly<Record<string, string | undefined>>
}) {
  return input.children
    .filter((session) => session.agent === input.agentId)
    .map((session): AiScienceExecutionView => {
      const transcript = input.transcripts.get(session.id)
      return {
        id: session.id,
        title: session.title,
        startedAt: session.time.created,
        completedAt: transcript ? sessionCompletedAt(transcript) : undefined,
        current: session.id === input.preferredSessionId,
        status: input.loadErrors?.[session.id]
          ? "failed"
          : transcript
            ? deriveSessionStatus({
                session,
                status: transcript.status,
                messages: transcript.messages,
                parts: transcript.parts,
              })
            : "waiting",
      }
    })
    .sort(
      (left, right) =>
        Number(right.current) - Number(left.current) ||
        (right.startedAt ?? 0) - (left.startedAt ?? 0) ||
        right.id.localeCompare(left.id),
    )
}

export function aiScienceProgress(input: {
  nodes: readonly AgentNodeView[]
  overviewStatus: AgentNodeStatus
}) {
  if (input.overviewStatus === "completed") return 100
  const completed = input.nodes.filter((node) => node.status === "completed").length
  const running = input.nodes.filter((node) => node.status === "running").length
  const coverage = ((completed + running * 0.5) / Math.max(1, input.nodes.length)) * 100
  return Math.min(95, Math.round(coverage))
}

export function isAiScienceDagEdgeActive(source: AgentNodeStatus | undefined, target: AgentNodeStatus | undefined) {
  return source !== undefined && source !== "waiting" && target !== undefined && target !== "waiting"
}

export function isAiScienceVisibleArtifactPath(value: string) {
  const path = normalize(value)
  const segments = path.toLowerCase().split("/")
  if (segments.some((segment) => segment === "__pycache__" || segment === ".pytest_cache" || segment === ".git")) {
    return false
  }
  return !path.toLowerCase().endsWith(".pyc") && !path.toLowerCase().endsWith(".pyo")
}

export function mergeAiScienceArtifacts(input: {
  artifactRoot?: string
  scannedPaths: readonly string[]
  writtenArtifacts: readonly SessionArtifact[]
  rootSessionId: string
}) {
  const root = input.artifactRoot ? trim(normalize(input.artifactRoot)) : undefined
  const inScope = (value: string) => {
    if (!root) return true
    const path = trim(normalize(value))
    return path === root || path.startsWith(`${root}/`)
  }
  const written = new Map(
    input.writtenArtifacts
      .filter((artifact) => inScope(artifact.path) && isAiScienceVisibleArtifactPath(artifact.path))
      .map((artifact) => [normalize(artifact.path), artifact] as const),
  )
  const paths = new Map<string, string>()
  for (const path of input.scannedPaths) {
    if (!inScope(path) || !isAiScienceVisibleArtifactPath(path)) continue
    paths.set(normalize(path), normalize(path))
  }
  for (const artifact of written.values()) paths.set(normalize(artifact.path), artifact.path)

  return [...paths]
    .map(([key, path]): SessionArtifact => {
      const known = written.get(key)
      if (known) return known
      return {
        path,
        filename: filename(path),
        ownerAgentId: "",
        ownerSessionId: input.rootSessionId,
        messageId: "",
        partId: "",
        role: "supporting",
      }
    })
    .sort((left, right) => left.path.localeCompare(right.path))
}

export function aiScienceOutOfArtifactWriteCount(
  artifacts: readonly SessionArtifact[],
  artifactRoot: string | undefined,
) {
  if (!artifactRoot) return 0
  const root = trim(normalize(artifactRoot))
  return artifacts.filter((artifact) => {
    const path = trim(normalize(artifact.path))
    return path !== root && !path.startsWith(`${root}/`)
  }).length
}

export function buildAiScienceArtifactTree(
  artifacts: readonly SessionArtifact[],
  artifactRoot: string | undefined,
) {
  type MutableNode = Omit<AiScienceArtifactTreeNode, "children"> & { children: Map<string, MutableNode> }
  const root: MutableNode = { name: "", path: "", children: new Map() }
  const prefix = artifactRoot ? `${trim(normalize(artifactRoot))}/` : ""

  for (const artifact of artifacts) {
    const path = trim(normalize(artifact.path))
    const relative = prefix && path.startsWith(prefix) ? path.slice(prefix.length) : path
    if (!relative) continue
    let parent = root
    const segments = relative.split("/").filter(Boolean)
    segments.forEach((segment, index) => {
      const currentPath = prefix
        ? `${prefix}${segments.slice(0, index + 1).join("/")}`.replace(/\/$/, "")
        : segments.slice(0, index + 1).join("/")
      let current = parent.children.get(segment)
      if (!current) {
        current = { name: segment, path: currentPath, children: new Map() }
        parent.children.set(segment, current)
      }
      if (index === segments.length - 1) current.artifact = artifact
      parent = current
    })
  }

  const freeze = (node: MutableNode): AiScienceArtifactTreeNode => ({
    name: node.name,
    path: node.path,
    artifact: node.artifact,
    children: [...node.children.values()]
      .map(freeze)
      .sort((left, right) => Number(!!left.artifact) - Number(!!right.artifact) || left.name.localeCompare(right.name)),
  })

  return freeze(root).children
}

function normalize(value: string) {
  return value.replaceAll("\\", "/").replace(/\/{2,}/g, "/")
}

function trim(value: string) {
  return value.replace(/^\/+|\/+$/g, "")
}

function filename(value: string) {
  return normalize(value).split("/").at(-1) ?? value
}
