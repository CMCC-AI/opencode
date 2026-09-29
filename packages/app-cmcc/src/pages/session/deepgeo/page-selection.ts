import type { Session } from "@opencode-ai/sdk/v2"

export const DEEPGEO_LEAD_AGENT = "deepgeo/deepgeo-team-lead"

export function isDeepGeoRootSession(session?: Pick<Session, "agent" | "parentID">) {
  return session?.agent === DEEPGEO_LEAD_AGENT && !session.parentID
}

export function shouldUseDeepGeoPage(
  session: Pick<Session, "agent" | "parentID"> | undefined,
  agentType: string | undefined,
  initialUserAgent?: string,
) {
  if (session?.parentID) return false
  return (
    isDeepGeoRootSession(session) ||
    agentType?.trim().toLowerCase() === "deepgeo" ||
    initialUserAgent === DEEPGEO_LEAD_AGENT
  )
}
