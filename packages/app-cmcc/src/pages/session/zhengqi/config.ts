import { cmccMemberAvatarUrl, cmccTeamAvatarUrl, cmccTeamExpertByAgent } from "@/utils/cmcc-experts"
import type { ArtifactRoleConfig } from "../agent-workbench/artifacts"
import { ZHENGQI_LEAD_AGENT } from "./page-selection"

export { ZHENGQI_LEAD_AGENT } from "./page-selection"

const team = cmccTeamExpertByAgent(ZHENGQI_LEAD_AGENT)

if (!team) throw new Error(`Zhengqi team config not found: ${ZHENGQI_LEAD_AGENT}`)

export const ZHENGQI_EXPERT_ID = team.id
export const ZHENGQI_LEAD_MEMBER = team.members.find((member) => member.role === "lead")
export const ZHENGQI_MEMBERS = team.members.filter((member) => member.role !== "lead")
export const ZHENGQI_REQUIRED_MEMBER_IDS = ZHENGQI_MEMBERS.map((member) => member.id)
export const ZHENGQI_PUBLIC_RESEARCH_AGENT = "zhengqi-visit-intel/public-web-researcher"

export const ZHENGQI_DAG_LEVELS = [
  ["zhengqi-visit-intel/sensitive-check-officer"],
  ["zhengqi-visit-intel/internal-intel-researcher"],
  ["zhengqi-visit-intel/research-query-planner"],
  ["zhengqi-visit-intel/public-web-researcher"],
  ["zhengqi-visit-intel/intelligence-synthesizer"],
  ["zhengqi-visit-intel/research-reflection-analyst"],
  ["zhengqi-visit-intel/outline-architect"],
  ["zhengqi-visit-intel/report-chief-writer"],
  ["zhengqi-visit-intel/evidence-verify-officer"],
  ["zhengqi-visit-intel/report-visual-designer"],
] as const

export const ZHENGQI_DAG_EDGES = ZHENGQI_DAG_LEVELS.slice(0, -1).map(
  (level, index) => [level[0], ZHENGQI_DAG_LEVELS[index + 1]![0]] as const,
)

// Only authoritative reports determine the report directory. Other write records
// remain visible as supporting files without influencing report selection.
export const ZHENGQI_ARTIFACT_ROLES: ArtifactRoleConfig = {
  "20-report.md": {
    role: "text-report",
    label: "谈参高拜文字报告",
    expectedAgentId: "zhengqi-visit-intel/report-chief-writer",
  },
  "25-visual-report.json": {
    role: "visual-report",
    label: "谈参高拜可视化报告",
    expectedAgentId: "zhengqi-visit-intel/report-visual-designer",
  },
}

const memberById = new Map(team.members.map((member) => [member.id, member]))

export function zhengqiAvatar(agentId: string) {
  const member = memberById.get(agentId)
  return member ? cmccMemberAvatarUrl(member) : undefined
}

export function zhengqiTeamAvatar() {
  return ZHENGQI_LEAD_MEMBER ? cmccMemberAvatarUrl(ZHENGQI_LEAD_MEMBER) : cmccTeamAvatarUrl(team!)
}
