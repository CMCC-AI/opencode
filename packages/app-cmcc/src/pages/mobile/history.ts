import type { Session } from "@opencode-ai/sdk/v2/client"
export type MobileAssistant = "lingxi" | "deepinsight" | "finance" | "shopping" | "deeplens"
export type MobileSource = "opencode" | "langgraph"
export type MobileOpenCodeMode = { assistant: MobileAssistant; agent: string } | { research: true }
export type MobileAgents = {
  finance: { id: string; quick?: string; analysis?: string }
  shopping: { id: string; quick?: string }
  research: { id: string; quick?: string; lead: string }
  lens: { id: string; quick: string }
}

export function mobileOpenCodeMode(
  session: Pick<Session, "agent" | "parentID" | "time">,
  agentType: string,
  generalType: string,
  { finance, shopping, research, lens }: MobileAgents,
): MobileOpenCodeMode | undefined {
  if (session.parentID || session.time.archived || !session.agent) return
  const type = agentType.trim().toLowerCase()
  const agent = session.agent
  if (type === generalType && (agent === "build" || agent === "plan")) return { assistant: "lingxi", agent: "build" }
  if (type === finance.id && (agent === finance.quick || agent === finance.analysis)) return { assistant: "finance", agent }
  if (type === shopping.id && agent === shopping.quick) return { assistant: "shopping", agent }
  if (type === lens.id && agent === lens.quick) return { assistant: "deeplens", agent }
  if (type !== research.id) return
  if (agent === research.lead) return { research: true }
  if (agent === research.quick) return { assistant: "deepinsight", agent }
}

export function mobileHistoryHref(source: MobileSource, id: string) {
  return `/mobile/history/${source}/${encodeURIComponent(id)}`
}
