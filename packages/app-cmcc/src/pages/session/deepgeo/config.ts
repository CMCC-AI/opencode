import { cmccMemberAvatarUrl, cmccTeamAvatarUrl, cmccTeamExpertByAgent } from "@/utils/cmcc-experts"
import type { ArtifactRoleConfig } from "../agent-workbench/artifacts"
import { DEEPGEO_LEAD_AGENT } from "./page-selection"

export { DEEPGEO_LEAD_AGENT } from "./page-selection"

const team = cmccTeamExpertByAgent(DEEPGEO_LEAD_AGENT)

if (!team) throw new Error(`DeepGeo team config not found: ${DEEPGEO_LEAD_AGENT}`)

export const DEEPGEO_EXPERT_ID = team.id
export const DEEPGEO_LEAD_MEMBER = team.members.find((member) => member.role === "lead")
export const DEEPGEO_MEMBERS = team.members.filter((member) => member.role !== "lead")
export const DEEPGEO_REQUIRED_MEMBER_IDS = DEEPGEO_MEMBERS.map((member) => member.id)
export const DEEPGEO_DAG_LEVELS = [
  ["deepgeo/dg-task-governor"],
  ["deepgeo/dg-data-steward"],
  [
    "deepgeo/dg-location-analyst",
    "deepgeo/dg-audience-analyst",
    "deepgeo/dg-commercial-ecology",
    "deepgeo/dg-market-researcher",
  ],
  ["deepgeo/dg-decision-modeler"],
  ["deepgeo/dg-business-strategist"],
  ["deepgeo/dg-decision-synthesizer"],
  ["deepgeo/dg-report-editor"],
  ["deepgeo/dg-independent-reviewer"],
] as const

export const DEEPGEO_DAG_EDGES = DEEPGEO_DAG_LEVELS.slice(0, -1).flatMap((level, index) =>
  level.flatMap((source) => DEEPGEO_DAG_LEVELS[index + 1]!.map((target) => [source, target] as const)),
)

export const DEEPGEO_ARTIFACT_ROLES: ArtifactRoleConfig = {
  "report.md": { role: "text-report", label: "位置决策文字报告" },
  "report.html": { role: "visual-report", label: "位置决策可视化报告" },
  "report.pdf": { role: "supporting", label: "位置决策 PDF 报告" },
}

const memberById = new Map(team.members.map((member) => [member.id, member]))

export function deepGeoAvatar(agentId: string) {
  const member = memberById.get(agentId)
  return member ? cmccMemberAvatarUrl(member) : undefined
}

export function deepGeoTeamAvatar() {
  return DEEPGEO_LEAD_MEMBER ? cmccMemberAvatarUrl(DEEPGEO_LEAD_MEMBER) : cmccTeamAvatarUrl(team!)
}
