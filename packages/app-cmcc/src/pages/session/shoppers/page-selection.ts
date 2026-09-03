import type { Session } from "@opencode-ai/sdk/v2"

export const SHOPPERS_LEAD_AGENT = "shoppers-pro/shoppers-pro-team-lead"

export function isShoppersRootSession(session?: Pick<Session, "agent" | "parentID">) {
  return session?.agent === SHOPPERS_LEAD_AGENT && !session.parentID
}

export function shouldUseShoppersPage(
  session: Pick<Session, "agent" | "parentID"> | undefined,
  agentType: string | undefined,
  initialUserAgent?: string,
) {
  if (session?.parentID) return false
  return (
    isShoppersRootSession(session) ||
    agentType?.trim().toLowerCase() === "shoppers-pro" ||
    initialUserAgent === SHOPPERS_LEAD_AGENT
  )
}
