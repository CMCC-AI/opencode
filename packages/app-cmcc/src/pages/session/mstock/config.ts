import type { ArtifactRoleConfig } from "../agent-workbench/artifacts"
export const MSTOCK_LEAD_AGENT = "mstock/mstock"
export const MSTOCK_EXPERT_ID = "mstock"
export const MSTOCK_MEMBERS = [
  { id: "mstock/ms-comparator", name: "横向对比", profession: "横向对比分析" },
  { id: "mstock/ms-report-writer", name: "报告撰写", profession: "对比报告撰写" },
  { id: "mstock/ms-visualizer", name: "横评可视化", profession: "横评可视化" },
]
export const MSTOCK_ARTIFACT_ROLES: ArtifactRoleConfig = {
  "20-comparison-report.md": { role: "text-report", label: "对比文字报告" },
  "40-comparison-report.html": { role: "visual-report", label: "横评可视化看板" },
}
export const MSTOCK_DAG_ORDER = MSTOCK_MEMBERS.map((member) => member.id)
export const MSTOCK_DAG_EDGES = MSTOCK_DAG_ORDER.slice(1).map((id, index) => [MSTOCK_DAG_ORDER[index], id] as const)
export function mstockAvatar(_agentId?: string): string | undefined {
  return undefined
}
export function mstockTeamAvatar(): string | undefined {
  return undefined
}
