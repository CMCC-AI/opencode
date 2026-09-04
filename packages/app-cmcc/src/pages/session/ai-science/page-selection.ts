import type { Session } from "@opencode-ai/sdk/v2"

export const AI_SCIENCE_AGENT_TYPE = "ai-for-science-team"
export const AI_SCIENCE_LEAD_AGENT = "ai-for-science-team/ai-for-science-team-team-lead"

export function isAiScienceRootSession(session?: Pick<Session, "agent" | "parentID">) {
  return session?.agent === AI_SCIENCE_LEAD_AGENT && !session.parentID
}

export function shouldUseAiSciencePage(
  session: Pick<Session, "agent" | "parentID"> | undefined,
  agentType: string | undefined,
  initialUserAgent?: string,
) {
  if (session?.parentID) return false
  return (
    isAiScienceRootSession(session) ||
    agentType?.trim().toLowerCase() === AI_SCIENCE_AGENT_TYPE ||
    initialUserAgent === AI_SCIENCE_LEAD_AGENT
  )
}
