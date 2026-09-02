import type { Session } from "@opencode-ai/sdk/v2"
import { cmccWorkspaceRelativePath } from "@/utils/cmcc-artifact-paths"
import type { AgentNodeStatus, AgentNodeView, SessionTranscript } from "../agent-workbench/model"
import { deriveSessionStatus, sessionCompletedAt } from "../agent-workbench/session-adapter"

export type DeepInspectExecutionView = {
  id: string
  title: string
  status: AgentNodeStatus
  startedAt?: number
  completedAt?: number
  current: boolean
}

export function buildDeepInspectExecutions(input: {
  agentId: string
  children: readonly Session[]
  transcripts: ReadonlyMap<string, SessionTranscript>
  preferredSessionId?: string
  loadErrors?: Readonly<Record<string, string | undefined>>
}) {
  return input.children
    .filter((session) => session.agent === input.agentId)
    .map((session): DeepInspectExecutionView => {
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

export function deepInspectProgress(input: {
  nodes: readonly AgentNodeView[]
  coreAgentIds: readonly string[]
  optionalAgentIds: readonly string[]
}) {
  const nodes = new Map(input.nodes.map((node) => [node.id, node]))
  const active = [...input.coreAgentIds, ...input.optionalAgentIds.filter((agentId) => !!nodes.get(agentId)?.sessionId)]
  const completed = active.filter((agentId) => nodes.get(agentId)?.status === "completed").length
  return Math.round((completed / Math.max(1, active.length)) * 100)
}

export function isDeepInspectDagEdgeActive(source: AgentNodeStatus | undefined, target: AgentNodeStatus | undefined) {
  return source !== undefined && source !== "waiting" && target !== undefined && target !== "waiting"
}

export function parseDeepInspectIssueCount(value: string) {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    return
  }
  if (!isRecord(parsed) || !isRecord(parsed.statistics)) return
  const count = parsed.statistics.total_issues
  if (typeof count !== "number" || !Number.isFinite(count) || count < 0) return
  return Math.trunc(count)
}

export function deepInspectArtifactDirectoryWarning(input: {
  workspaceDirectory: string
  artifactDirectory?: string
  runDirectory?: string
}) {
  if (!input.artifactDirectory || !input.runDirectory) return
  const expected = cmccWorkspaceRelativePath(input.workspaceDirectory, input.artifactDirectory)
  if (!expected) return "会话产物目录不属于当前用户工作区"
  const normalizedExpected = normalize(expected)
  const normalizedRun = normalize(input.runDirectory)
  if (normalizedRun === normalizedExpected || normalizedRun.startsWith(`${normalizedExpected}/`)) return
  return "当前历史会话的产物未写入独立会话目录，已按真实 write 记录兼容展示"
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function normalize(value: string) {
  return value
    .replaceAll("\\", "/")
    .replace(/^\/+|\/+$/g, "")
    .toLowerCase()
}
