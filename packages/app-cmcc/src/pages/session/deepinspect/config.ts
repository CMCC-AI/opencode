import { cmccMemberAvatarUrl, cmccTeamAvatarUrl, cmccTeamExpertByAgent } from "@/utils/cmcc-experts"
import type { ArtifactRoleConfig } from "../agent-workbench/artifacts"
import { DEEPINSPECT_LEAD_AGENT } from "./page-selection"

export { DEEPINSPECT_LEAD_AGENT } from "./page-selection"

const team = cmccTeamExpertByAgent(DEEPINSPECT_LEAD_AGENT)

if (!team) throw new Error(`DeepInspect team config not found: ${DEEPINSPECT_LEAD_AGENT}`)

export const DEEPINSPECT_EXPERT_ID = team.id
export const DEEPINSPECT_LEAD_MEMBER = team.members.find((member) => member.role === "lead")
export const DEEPINSPECT_MEMBERS = team.members.filter((member) => member.role !== "lead")
export const DEEPINSPECT_OPTIONAL_MEMBER_IDS = ["deepinspect/web-researcher"] as const
export const DEEPINSPECT_CORE_MEMBER_IDS = DEEPINSPECT_MEMBERS.map((member) => member.id).filter(
  (agentId) => !DEEPINSPECT_OPTIONAL_MEMBER_IDS.includes(agentId as (typeof DEEPINSPECT_OPTIONAL_MEMBER_IDS)[number]),
)

export const DEEPINSPECT_DAG_LEVELS = [
  ["deepinspect/intent-analyst"],
  ["deepinspect/query-planner"],
  ["deepinspect/material-researcher", "deepinspect/risk-identifier", "deepinspect/web-researcher"],
  ["deepinspect/problem-consolidator"],
  ["deepinspect/reflector"],
  ["deepinspect/outline-architect"],
  ["deepinspect/report-writer"],
  ["deepinspect/evidence-reviewer"],
  ["deepinspect/viz-specialist"],
] as const

export const DEEPINSPECT_DAG_EDGES = [
  ["deepinspect/intent-analyst", "deepinspect/query-planner"],
  ["deepinspect/query-planner", "deepinspect/material-researcher"],
  ["deepinspect/query-planner", "deepinspect/risk-identifier"],
  ["deepinspect/query-planner", "deepinspect/web-researcher"],
  ["deepinspect/material-researcher", "deepinspect/problem-consolidator"],
  ["deepinspect/risk-identifier", "deepinspect/problem-consolidator"],
  ["deepinspect/web-researcher", "deepinspect/problem-consolidator"],
  ["deepinspect/problem-consolidator", "deepinspect/reflector"],
  ["deepinspect/reflector", "deepinspect/outline-architect"],
  ["deepinspect/outline-architect", "deepinspect/report-writer"],
  ["deepinspect/report-writer", "deepinspect/evidence-reviewer"],
  ["deepinspect/evidence-reviewer", "deepinspect/viz-specialist"],
] as const

export const DEEPINSPECT_ARTIFACT_ROLES: ArtifactRoleConfig = {
  "00-input.json": { role: "supporting", label: "巡查任务输入" },
  "02-intent.json": { role: "supporting", label: "意图分析" },
  "03-plan.json": { role: "supporting", label: "研究方案" },
  "04-sources.json": { role: "supporting", label: "来源清单" },
  "04-materials.md": { role: "supporting", label: "材料原文" },
  "05-risk-findings.md": { role: "supporting", label: "风险识别结果" },
  "06-consolidated-issues.json": { role: "supporting", label: "问题归并结果" },
  "10-outline.json": { role: "supporting", label: "报告大纲" },
  "20-report.md": { role: "text-report", label: "巡查文字报告" },
  "25-visual-report.json": { role: "visual-report", label: "巡查可视化报告" },
}

const memberById = new Map(team.members.map((member) => [member.id, member]))

export function deepInspectAvatar(agentId: string) {
  const member = memberById.get(agentId)
  return member ? cmccMemberAvatarUrl(member) : undefined
}

export function deepInspectTeamAvatar() {
  return DEEPINSPECT_LEAD_MEMBER ? cmccMemberAvatarUrl(DEEPINSPECT_LEAD_MEMBER) : cmccTeamAvatarUrl(team!)
}
