export const CMCC_RESEARCH_DEMO = import.meta.env.VITE_CMCC_RESEARCH_DEMO !== "false"

export const CMCC_RESEARCH_EXPERT_ID = "ai-for-science-team"
export const CMCC_RESEARCH_AGENT = "ai-for-science-team/ai-for-science-team-team-lead"

export function cmccResearchDemoExpertVisible(expertID: string) {
  return !CMCC_RESEARCH_DEMO || expertID === CMCC_RESEARCH_EXPERT_ID
}

export function cmccResearchDemoSessionVisible(input: { agentType?: string; teamExpertID?: string }) {
  if (!CMCC_RESEARCH_DEMO) return true
  if (input.agentType === CMCC_RESEARCH_EXPERT_ID) return true
  if (input.agentType && input.agentType !== "deepinsight") return false
  return !input.teamExpertID || input.teamExpertID === CMCC_RESEARCH_EXPERT_ID
}
