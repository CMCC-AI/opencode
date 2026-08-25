import type { Message, Part, Session, SessionStatus } from "@opencode-ai/sdk/v2"
import type {
  AgentDisplayMember,
  AgentNodeStatus,
  AgentNodeView,
  NestedAgentSessionView,
  SessionTranscript,
} from "./model"

const compareMessage = (left: Message, right: Message) =>
  left.time.created - right.time.created || left.id.localeCompare(right.id)

function isVisibleTextPart(part: Part): part is Extract<Part, { type: "text" }> {
  return part.type === "text" && !part.ignored && !!part.text.trim()
}

function joinTextParts(parts: readonly Part[]) {
  return parts
    .filter(isVisibleTextPart)
    .map((part) => part.text)
    .join("")
}

export function extractAssistantMarkdown(messages: readonly Message[], parts: SessionTranscript["parts"]) {
  return [...messages]
    .filter((message) => message.role === "assistant")
    .sort(compareMessage)
    .flatMap((message) => {
      const text = joinTextParts(parts[message.id] ?? [])
      return text.trim() ? [text] : []
    })
    .join("\n\n")
}

export function extractUserQuery(messages: readonly Message[], parts: SessionTranscript["parts"]) {
  const message = [...messages].filter((item) => item.role === "user").sort(compareMessage)[0]
  if (!message) return ""
  return joinTextParts(parts[message.id] ?? []).trim()
}

export function deriveSessionStatus(input: {
  session?: Session
  status?: SessionStatus
  messages: readonly Message[]
  parts: SessionTranscript["parts"]
}): AgentNodeStatus {
  if (!input.session) return "waiting"
  if (input.status && input.status.type !== "idle") return "running"

  const assistant = [...input.messages]
    .filter((message) => message.role === "assistant")
    .sort(compareMessage)
    .at(-1)
  if (assistant?.error) return "failed"
  if (assistant?.time.completed !== undefined) return "completed"
  if (extractAssistantMarkdown(input.messages, input.parts)) return "running"
  return "running"
}

export function sessionCompletedAt(transcript: SessionTranscript) {
  const messageTimes = transcript.messages.flatMap((message) =>
    message.role === "assistant" && message.time.completed !== undefined ? [message.time.completed] : [],
  )
  const toolTimes = transcript.messages.flatMap((message) =>
    (transcript.parts[message.id] ?? []).flatMap((part) =>
      part.type === "tool" && part.state.status === "completed" ? [part.state.time.end] : [],
    ),
  )
  const times = [...messageTimes, ...toolTimes]
  return times.length ? Math.max(...times) : undefined
}

export function buildAgentNodes(input: {
  members: readonly AgentDisplayMember[]
  children: readonly Session[]
  transcripts: ReadonlyMap<string, SessionTranscript>
  preferredSessionIds?: ReadonlyMap<string, string>
  resolution?: AgentSessionResolution
}): { nodes: AgentNodeView[]; ambiguities: string[] } {
  const resolution =
    input.resolution ??
    resolveAgentSessions({
      members: input.members,
      children: input.children,
      preferredSessionIds: input.preferredSessionIds,
    })
  const nodes = resolution.members.map(({ member, session, ambiguity }) => {
    if (ambiguity) return { ...member, status: "failed" as const, markdown: "", ambiguity }
    const transcript = session ? input.transcripts.get(session.id) : undefined
    return {
      ...member,
      sessionId: session?.id,
      status: deriveSessionStatus({
        session,
        status: transcript?.status,
        messages: transcript?.messages ?? [],
        parts: transcript?.parts ?? {},
      }),
      markdown: transcript ? extractAssistantMarkdown(transcript.messages, transcript.parts) : "",
      startedAt: session?.time.created,
      completedAt: transcript ? sessionCompletedAt(transcript) : undefined,
    }
  })

  return { nodes, ambiguities: resolution.ambiguities }
}

export type AgentSessionResolution = {
  members: Array<{ member: AgentDisplayMember; session?: Session; ambiguity?: string }>
  ambiguities: string[]
}

export function resolveAgentSessions(input: {
  members: readonly AgentDisplayMember[]
  children: readonly Session[]
  preferredSessionIds?: ReadonlyMap<string, string>
}): AgentSessionResolution {
  const grouped = new Map<string, Session[]>()
  for (const session of input.children) {
    if (!session.agent) continue
    grouped.set(session.agent, [...(grouped.get(session.agent) ?? []), session])
  }

  const ambiguities: string[] = []
  const members = input.members.map((member) => {
    const matches = grouped.get(member.id) ?? []
    const preferredId = input.preferredSessionIds?.get(member.id)
    const preferred = preferredId ? matches.find((session) => session.id === preferredId) : undefined
    const candidates = preferred ? [preferred] : matches
    if (candidates.length > 1) {
      const ambiguity = `${member.name}检测到 ${matches.length} 个子会话，暂时无法确定展示来源`
      ambiguities.push(ambiguity)
      return { member, ambiguity }
    }

    const session = candidates[0]
    return { member, session }
  })

  return { members, ambiguities }
}

export function buildNestedAgentSessions(input: {
  parentSessionId?: string
  sessions: readonly Session[]
  transcripts: ReadonlyMap<string, SessionTranscript>
  loadErrors?: Readonly<Record<string, string | undefined>>
}): NestedAgentSessionView[] {
  if (!input.parentSessionId) return []
  return input.sessions
    .filter((session) => session.parentID === input.parentSessionId)
    .sort((left, right) => left.time.created - right.time.created || left.id.localeCompare(right.id))
    .map((session) => {
      const transcript = input.transcripts.get(session.id)
      return {
        id: session.id,
        parentSessionId: input.parentSessionId!,
        agentId: session.agent,
        title: session.title,
        startedAt: session.time.created,
        completedAt: transcript ? sessionCompletedAt(transcript) : undefined,
        status: input.loadErrors?.[session.id]
          ? ("failed" as const)
          : transcript
            ? deriveSessionStatus({
                session,
                status: transcript.status,
                messages: transcript.messages,
                parts: transcript.parts,
              })
            : ("waiting" as const),
      }
    })
}

export function extractTaskChildPreferences(transcript: SessionTranscript) {
  const preferences = new Map<string, { sessionId: string; completedAt: number; partId: string }>()
  for (const message of transcript.messages) {
    for (const part of transcript.parts[message.id] ?? []) {
      if (part.type !== "tool" || part.tool !== "task" || part.state.status !== "completed") continue
      const agent = stringField(part.state.input, "subagent_type")
      const sessionId = stringField(part.state.metadata, "sessionId")
      if (!agent || !sessionId) continue
      const candidate = { sessionId, completedAt: part.state.time.end, partId: part.id }
      const current = preferences.get(agent)
      if (
        current &&
        (current.completedAt > candidate.completedAt ||
          (current.completedAt === candidate.completedAt && current.partId.localeCompare(candidate.partId) >= 0))
      ) {
        continue
      }
      preferences.set(agent, candidate)
    }
  }
  return new Map([...preferences].map(([agent, preference]) => [agent, preference.sessionId]))
}

function stringField(value: unknown, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return
  const field = (value as Record<string, unknown>)[key]
  return typeof field === "string" && field.trim() ? field.trim() : undefined
}
