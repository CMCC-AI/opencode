import type { Session } from "@opencode-ai/sdk/v2"

export const DEEPINSIGHT_LEAD_AGENT = "deepinsight/deepinsight-team-lead"

export function shouldUseDeepInsightPage(
  session: Pick<Session, "agent" | "parentID"> | undefined,
  initialAgent?: string,
) {
  if (session?.parentID) return false
  // DockAPI's legacy deepinsight type also contains ordinary conversations.
  return session?.agent === DEEPINSIGHT_LEAD_AGENT || initialAgent === DEEPINSIGHT_LEAD_AGENT
}
