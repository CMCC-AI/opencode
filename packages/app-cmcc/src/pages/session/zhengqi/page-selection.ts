import type { Session } from "@opencode-ai/sdk/v2"

export const ZHENGQI_LEAD_AGENT = "zhengqi-visit-intel/zhengqi-visit-intel-team-lead"

export function isZhengqiRootSession(session?: Pick<Session, "agent" | "parentID">) {
  return session?.agent === ZHENGQI_LEAD_AGENT && !session.parentID
}

export function shouldUseZhengqiPage(
  session: Pick<Session, "agent" | "parentID"> | undefined,
  agentType: string | undefined,
  initialUserAgent?: string,
) {
  if (session?.parentID) return false
  return (
    isZhengqiRootSession(session) ||
    agentType?.trim().toLowerCase() === "zhengqi-visit-intel" ||
    initialUserAgent === ZHENGQI_LEAD_AGENT
  )
}
