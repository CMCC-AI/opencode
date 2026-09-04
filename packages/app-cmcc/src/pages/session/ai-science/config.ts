import { cmccMemberAvatarUrl, cmccTeamAvatarUrl, cmccTeamExpertByAgent } from "@/utils/cmcc-experts"
import { AI_SCIENCE_LEAD_AGENT } from "./page-selection"
import { AI_SCIENCE_DAG_EDGES, AI_SCIENCE_DAG_LEVELS } from "./topology"

export { AI_SCIENCE_LEAD_AGENT } from "./page-selection"
export { AI_SCIENCE_DAG_EDGES, AI_SCIENCE_DAG_LEVELS } from "./topology"

const team = cmccTeamExpertByAgent(AI_SCIENCE_LEAD_AGENT)

if (!team) throw new Error(`AI for Science team config not found: ${AI_SCIENCE_LEAD_AGENT}`)

export const AI_SCIENCE_EXPERT_ID = team.id
export const AI_SCIENCE_LEAD_MEMBER = team.members.find((member) => member.role === "lead")
export const AI_SCIENCE_MEMBERS = team.members.filter((member) => member.role !== "lead")

const configuredIds = new Set(AI_SCIENCE_MEMBERS.map((member) => member.id))
const topologyIds = new Set<string>(AI_SCIENCE_DAG_LEVELS.flat())
if (configuredIds.size !== topologyIds.size || [...configuredIds].some((id) => !topologyIds.has(id))) {
  throw new Error("AI for Science capability DAG does not match the configured team members")
}

const memberById = new Map(team.members.map((member) => [member.id, member]))

export function aiScienceAvatar(agentId: string) {
  const member = memberById.get(agentId)
  return member ? cmccMemberAvatarUrl(member) : undefined
}

export function aiScienceTeamAvatar() {
  return AI_SCIENCE_LEAD_MEMBER ? cmccMemberAvatarUrl(AI_SCIENCE_LEAD_MEMBER) : cmccTeamAvatarUrl(team!)
}
