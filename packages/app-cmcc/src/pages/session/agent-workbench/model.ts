import type { Message, Part, Session, SessionStatus } from "@opencode-ai/sdk/v2"

export type AgentNodeStatus = "waiting" | "running" | "completed" | "failed"

export type AgentDisplayMember = {
  id: string
  name: string
  profession: string
}

export type SessionTranscript = {
  session: Session
  status?: SessionStatus
  messages: readonly Message[]
  parts: Record<string, readonly Part[] | undefined>
}

export type AgentNodeView = AgentDisplayMember & {
  sessionId?: string
  status: AgentNodeStatus
  markdown: string
  startedAt?: number
  completedAt?: number
  ambiguity?: string
}

export type NestedAgentSessionView = {
  id: string
  parentSessionId: string
  agentId?: string
  title: string
  status: AgentNodeStatus
  startedAt?: number
  completedAt?: number
}

export type AgentWorkbenchStats = {
  elapsedMs: number
  tokenCount?: number
  uniqueSearchUrlCount: number
  expertCount: number
}

export type OverviewConversationTurn = {
  id: string
  query: string
  markdown: string
}

export type ArtifactRole = "text-report" | "visual-report" | "supporting"

export type SessionArtifact = {
  path: string
  filename: string
  sizeBytes?: number
  ownerAgentId: string
  ownerSessionId: string
  messageId: string
  partId: string
  createdAt?: number
  role: ArtifactRole
  label?: string
}

export type ArtifactDiscovery = {
  artifacts: SessionArtifact[]
  runDirectory?: string
  ambiguities: string[]
}

export type AgentWorkbench = {
  rootSessionId: string
  query: string
  overviewMarkdown: string
  overviewTurns: OverviewConversationTurn[]
  overviewStatus: AgentNodeStatus
  agents: AgentNodeView[]
  nestedAgentSessions: NestedAgentSessionView[]
  nestedAgentSessionsLoading: boolean
  nestedAgentSessionsError?: string
  stats: AgentWorkbenchStats
  artifacts: SessionArtifact[]
  textReportPath?: string
  visualReportPath?: string
  ambiguities: string[]
  loading: boolean
  error?: string
}
