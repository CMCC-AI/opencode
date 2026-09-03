import { cmccMemberAvatarUrl, cmccTeamAvatarUrl, cmccTeamExpertByAgent } from "@/utils/cmcc-experts"
import type { ArtifactRoleConfig } from "../agent-workbench/artifacts"
import { SHOPPERS_LEAD_AGENT } from "./page-selection"

export { SHOPPERS_LEAD_AGENT } from "./page-selection"

const team = cmccTeamExpertByAgent(SHOPPERS_LEAD_AGENT)

if (!team) throw new Error(`Shoppers Pro team config not found: ${SHOPPERS_LEAD_AGENT}`)

export const SHOPPERS_EXPERT_ID = team.id
export const SHOPPERS_LEAD_MEMBER = team.members.find((member) => member.role === "lead")
export const SHOPPERS_MEMBERS = team.members.filter((member) => member.role !== "lead")
export const SHOPPERS_REQUIRED_MEMBER_IDS = SHOPPERS_MEMBERS.map((member) => member.id)
export const SHOPPERS_CARD_EDITOR_AGENT = "shoppers-pro/card-editor"

export const SHOPPERS_DAG_LEVELS = [
  ["shoppers-pro/need-insight"],
  ["shoppers-pro/product-discoverer"],
  ["shoppers-pro/reputation-scout"],
  ["shoppers-pro/card-editor"],
] as const

export const SHOPPERS_DAG_EDGES = SHOPPERS_DAG_LEVELS.slice(0, -1).map(
  (level, index) => [level[0], SHOPPERS_DAG_LEVELS[index + 1]![0]] as const,
)

export const SHOPPERS_ARTIFACT_ROLES: ArtifactRoleConfig = {
  "20-report.md": { role: "text-report", label: "购买决策文字报告" },
  "25-visual-report.json": { role: "visual-report", label: "购买决策可视化报告" },
}

const memberById = new Map(team.members.map((member) => [member.id, member]))

export function shoppersAvatar(agentId: string) {
  const member = memberById.get(agentId)
  return member ? cmccMemberAvatarUrl(member) : undefined
}

export function shoppersTeamAvatar() {
  return SHOPPERS_LEAD_MEMBER ? cmccMemberAvatarUrl(SHOPPERS_LEAD_MEMBER) : cmccTeamAvatarUrl(team!)
}
