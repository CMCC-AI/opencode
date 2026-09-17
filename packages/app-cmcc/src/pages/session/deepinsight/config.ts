import { cmccMemberAvatarUrl, cmccTeamAvatarUrl, cmccTeamExpertByAgent } from "@/utils/cmcc-experts"
import { DEEPINSIGHT_RESEARCH_MEMBERS } from "./contract"
export { DEEPINSIGHT_RESEARCH_MEMBERS, DEEPINSIGHT_ARTIFACT_ROLES } from "./contract"
import { DEEPINSIGHT_LEAD_AGENT } from "./page-selection"

export { DEEPINSIGHT_LEAD_AGENT } from "./page-selection"
const team = cmccTeamExpertByAgent(DEEPINSIGHT_LEAD_AGENT)
if (!team) throw new Error("DeepInsight team config not found")

export const DEEPINSIGHT_EXPERT_ID = team.id
export const DEEPINSIGHT_MEMBERS = team.members.filter((member) => member.role !== "lead")
export const DEEPINSIGHT_DAG_LEVELS = [
  ["deepinsight/di-intent-analyst"],
  ["deepinsight/di-query-planner"],
  DEEPINSIGHT_RESEARCH_MEMBERS,
  ["deepinsight/di-reflector"],
  ["deepinsight/di-outline-architect"],
  ["deepinsight/di-report-writer"],
  ["deepinsight/di-evidence-reviewer"],
  ["deepinsight/di-viz"],
  ["deepinsight/di-publisher"],
] as const
export const DEEPINSIGHT_DAG_EDGES = DEEPINSIGHT_DAG_LEVELS.slice(1).flatMap((level, index) =>
  DEEPINSIGHT_DAG_LEVELS[index].flatMap((source) => level.map((target) => [source, target] as const)),
)

export function deepInsightAvatar(agentId: string) {
  const member = team!.members.find((item) => item.id === agentId)
  return member ? cmccMemberAvatarUrl(member) : undefined
}

export function deepInsightTeamAvatar() {
  return deepInsightAvatar(DEEPINSIGHT_LEAD_AGENT) ?? cmccTeamAvatarUrl(team!)
}
