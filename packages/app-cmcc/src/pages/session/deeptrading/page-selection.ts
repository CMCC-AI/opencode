import type { Session } from "@opencode-ai/sdk/v2"

export const DEEPTRADING_LEAD_AGENT = "deeptrading/deeptrading-team-lead"

export function isDeepTradingRootSession(session?: Pick<Session, "agent" | "parentID">) {
  return session?.agent === DEEPTRADING_LEAD_AGENT && !session.parentID
}

export function shouldUseDeepTradingPage(
  session: Pick<Session, "agent" | "parentID"> | undefined,
  agentType: string | undefined,
  initialUserAgent?: string,
) {
  if (session?.parentID) return false
  return (
    isDeepTradingRootSession(session) ||
    agentType?.trim().toLowerCase() === "deeptrading" ||
    initialUserAgent === DEEPTRADING_LEAD_AGENT
  )
}
