import type { Session } from "@opencode-ai/sdk/v2"

export const DEEPINSPECT_LEAD_AGENT = "deepinspect/deepinspect-team-lead"

export function isDeepInspectRootSession(session?: Pick<Session, "agent" | "parentID">) {
  return session?.agent === DEEPINSPECT_LEAD_AGENT && !session.parentID
}

export function shouldUseDeepInspectPage(
  session: Pick<Session, "agent" | "parentID"> | undefined,
  agentType: string | undefined,
  initialUserAgent?: string,
) {
  if (session?.parentID) return false
  return (
    isDeepInspectRootSession(session) ||
    agentType?.trim().toLowerCase() === "deepinspect" ||
    initialUserAgent === DEEPINSPECT_LEAD_AGENT
  )
}
