import type { Part, Session } from "@opencode-ai/sdk/v2"
import type { DockApiCaseSnapshot } from "@/context/dockapi"
import type { ArtifactRoleConfig } from "./artifacts"
import type {
  AgentDisplayMember,
  AgentWorkbench,
  ArtifactDiscovery,
  ArtifactRole,
  SessionArtifact,
  SessionTranscript,
} from "./model"
import {
  buildAgentNodes,
  buildNestedAgentSessions,
  deriveSessionStatus,
  extractAssistantMarkdown,
  extractOverviewConversation,
  extractWorkbenchMessages,
  extractTaskChildPreferences,
  extractUserQuery,
  resolveAgentSessions,
} from "./session-adapter"
import { calculateElapsedMs, sumSessionTokens } from "./statistics"

export type CaseSnapshotWorkbenchResult = {
  workbench: AgentWorkbench
  root?: SessionTranscript
  children: Session[]
  transcripts: ReadonlyMap<string, SessionTranscript>
  preferences: ReadonlyMap<string, string>
  discovery: ArtifactDiscovery
}

export function buildCaseSnapshotWorkbench(input: {
  snapshot: DockApiCaseSnapshot
  members: readonly AgentDisplayMember[]
  roles: ArtifactRoleConfig
  selectedAgentId: string
  includeNested?: boolean
  uniqueSearchUrlCount?: number
  artifacts?: (discovery: ArtifactDiscovery) => ArtifactDiscovery
}): CaseSnapshotWorkbenchResult {
  const transcripts = caseSnapshotTranscripts(input.snapshot)
  const root = transcripts.get(input.snapshot.rootSessionId)
  const emptyDiscovery = { artifacts: [], ambiguities: [] }
  if (!root) {
    return {
      workbench: emptyWorkbench(input.snapshot.rootSessionId, input.members, "案例快照缺少根会话"),
      children: [],
      transcripts,
      preferences: new Map(),
      discovery: emptyDiscovery,
    }
  }

  const memberIds = new Set(input.members.map((member) => member.id))
  const sessions = [...transcripts.values()].map((item) => item.session)
  const children = sessions.filter(
    (session) => session.parentID === root.session.id && !!session.agent && memberIds.has(session.agent),
  )
  const preferences = extractTaskChildPreferences(root)
  const resolution = resolveAgentSessions({ members: input.members, children, preferredSessionIds: preferences })
  const nodes = buildAgentNodes({
    members: input.members,
    children,
    transcripts,
    preferredSessionIds: preferences,
    resolution,
  })
  const selected = nodes.nodes.find((agent) => agent.id === input.selectedAgentId)
  const nestedAgentSessions = input.includeNested
    ? buildNestedAgentSessions({ parentSessionId: selected?.sessionId, sessions, transcripts })
    : []
  const rawDiscovery = caseSnapshotArtifacts(input.snapshot, transcripts, input.roles)
  const discovery = input.artifacts?.(rawDiscovery) ?? rawDiscovery
  const textReport = uniqueRoleArtifact(discovery.artifacts, "text-report")
  const visualReport = uniqueRoleArtifact(discovery.artifacts, "visual-report")
  const selectedTranscripts = [
    root,
    ...children.flatMap((session) => {
      const transcript = transcripts.get(session.id)
      return transcript ? [transcript] : []
    }),
  ]

  return {
    root,
    children,
    transcripts,
    preferences,
    discovery,
    workbench: {
      rootSessionId: root.session.id,
      query: input.snapshot.query || extractUserQuery(root.messages, root.parts),
      overviewMarkdown: extractAssistantMarkdown(root.messages, root.parts),
      overviewTurns: extractOverviewConversation(root.messages, root.parts),
      overviewMessages: extractWorkbenchMessages(root.messages, root.parts),
      overviewStatus: deriveSessionStatus({
        session: root.session,
        status: root.status,
        messages: root.messages,
        parts: root.parts,
      }),
      agents: nodes.nodes,
      nestedAgentSessions,
      nestedAgentSessionsLoading: false,
      stats: {
        elapsedMs: calculateElapsedMs({ root, transcripts: selectedTranscripts, running: false, now: Date.now() }),
        tokenCount: sumSessionTokens(selectedTranscripts.map((item) => item.session)),
        uniqueSearchUrlCount: input.uniqueSearchUrlCount ?? 0,
        expertCount: input.members.length,
      },
      artifacts: discovery.artifacts,
      textReportPath: discovery.runDirectory !== undefined ? textReport?.path : undefined,
      visualReportPath: discovery.runDirectory !== undefined ? visualReport?.path : undefined,
      ambiguities: [
        ...nodes.ambiguities,
        ...discovery.ambiguities,
        ...(roleAmbiguity(discovery.artifacts, "text-report") ? ["检测到多个文字报告文件，暂时无法确定最终报告"] : []),
        ...(roleAmbiguity(discovery.artifacts, "visual-report")
          ? ["检测到多个可视化报告文件，暂时无法确定最终报告"]
          : []),
      ],
      loading: false,
    },
  }
}

export function caseSnapshotTranscripts(snapshot: DockApiCaseSnapshot) {
  return new Map(
    snapshot.sessions.map((entry) => {
      const transcript: SessionTranscript = {
        session: entry.session,
        status: entry.status,
        messages: entry.messages.map((message) => message.info),
        parts: Object.fromEntries(entry.messages.map((message) => [message.info.id, message.parts])),
      }
      return [entry.session.id, transcript] as const
    }),
  )
}

export function caseSnapshotArtifacts(
  snapshot: DockApiCaseSnapshot,
  transcripts: ReadonlyMap<string, SessionTranscript>,
  roles: ArtifactRoleConfig,
): ArtifactDiscovery {
  const writers = new Map<
    string,
    { agentId: string; sessionId: string; messageId: string; partId: string; at: number }
  >()
  const ambiguities: string[] = []

  for (const transcript of transcripts.values()) {
    for (const message of transcript.messages) {
      for (const part of transcript.parts[message.id] ?? []) {
        const path = writtenArtifactPath(part)
        if (!path) continue
        const at = part.type === "tool" && part.state.status === "completed" ? part.state.time.end : 0
        const current = writers.get(path)
        if (current && current.at > at) continue
        writers.set(path, {
          agentId: transcript.session.agent ?? "",
          sessionId: transcript.session.id,
          messageId: message.id,
          partId: part.id,
          at,
        })
      }
    }
  }

  const artifacts = snapshot.artifacts
    .map((item): SessionArtifact => {
      const path = normalizeRelativePath(item.path)
      const filename = path.split("/").at(-1) ?? path
      const writer = writers.get(path)
      const configured = roles[filename]
      if (configured?.expectedAgentId && writer?.agentId && configured.expectedAgentId !== writer.agentId) {
        ambiguities.push(`${path} 实际由 ${writer.agentId} 写入，与配置主要产生者 ${configured.expectedAgentId} 不一致`)
      }
      return {
        path,
        filename,
        sizeBytes: item.size,
        ownerAgentId: writer?.agentId ?? "",
        ownerSessionId: writer?.sessionId ?? snapshot.rootSessionId,
        messageId: writer?.messageId ?? "",
        partId: writer?.partId ?? "",
        createdAt: writer?.at,
        role: configured?.role ?? "supporting",
        label: configured?.label,
      }
    })
    .sort((left, right) => (left.createdAt ?? 0) - (right.createdAt ?? 0) || left.path.localeCompare(right.path))

  const directories = new Set(
    artifacts
      .filter((artifact) => roles[artifact.filename])
      .map((artifact) => artifact.path.split("/").slice(0, -1).join("/")),
  )
  if (directories.size > 1) ambiguities.push("检测到多个报告目录，暂时无法确定最终报告")
  return {
    artifacts,
    runDirectory: directories.size === 1 ? [...directories][0] : undefined,
    ambiguities: [...new Set(ambiguities)],
  }
}

export function findCaseSnapshotArtifact(artifacts: readonly SessionArtifact[], filename: string, directory?: string) {
  const matches = artifacts.filter(
    (artifact) =>
      artifact.filename === filename &&
      (directory === undefined || artifact.path.split("/").slice(0, -1).join("/") === directory),
  )
  return matches.length === 1 ? matches[0] : undefined
}

export function caseSnapshotNestedSessions(data: CaseSnapshotWorkbenchResult, agentId: string) {
  const selected = data.workbench.agents.find((agent) => agent.id === agentId)
  return buildNestedAgentSessions({
    parentSessionId: selected?.sessionId,
    sessions: [...data.transcripts.values()].map((item) => item.session),
    transcripts: data.transcripts,
  })
}

function uniqueRoleArtifact(artifacts: readonly SessionArtifact[], role: ArtifactRole) {
  const matches = artifacts.filter((artifact) => artifact.role === role)
  return matches.length === 1 ? matches[0] : undefined
}

function roleAmbiguity(artifacts: readonly SessionArtifact[], role: ArtifactRole) {
  return artifacts.filter((artifact) => artifact.role === role).length > 1
}

function writtenArtifactPath(part: Part): string | undefined {
  if (part.type !== "tool" || part.tool !== "write" || part.state.status !== "completed") return undefined
  const metadata = part.state.metadata
  const inputPath = typeof part.state.input.filePath === "string" ? part.state.input.filePath : undefined
  const metadataPath =
    metadata && typeof metadata === "object" && typeof metadata.filepath === "string" ? metadata.filepath : undefined
  const value = inputPath ?? metadataPath
  if (!value) return undefined
  const normalized = value.replaceAll("\\", "/")
  const marker = "case://artifacts/"
  const index = normalized.indexOf(marker)
  return index < 0 ? undefined : normalizeRelativePath(normalized.slice(index + marker.length))
}

function normalizeRelativePath(value: string) {
  return value
    .replaceAll("\\", "/")
    .replace(/^\/+/, "")
    .replace(/\/{2,}/g, "/")
}

function emptyWorkbench(rootSessionId: string, members: readonly AgentDisplayMember[], error: string): AgentWorkbench {
  return {
    rootSessionId,
    query: "",
    overviewMarkdown: "",
    overviewTurns: [],
    overviewStatus: "failed",
    agents: members.map((member) => ({ ...member, status: "waiting", markdown: "" })),
    nestedAgentSessions: [],
    nestedAgentSessionsLoading: false,
    stats: { elapsedMs: 0, uniqueSearchUrlCount: 0, expertCount: members.length },
    artifacts: [],
    ambiguities: [],
    loading: false,
    error,
  }
}
