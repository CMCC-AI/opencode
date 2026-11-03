import { cmccExpertMembers } from "@/utils/cmcc-expert-members"
import type { ArtifactRoleConfig } from "../agent-workbench/artifacts"
export const MSTOCK_LEAD_AGENT = "mstock/mstock"
export const MSTOCK_EXPERT_ID = "mstock"
export const MSTOCK_LEAD_MEMBER = cmccExpertMembers(MSTOCK_EXPERT_ID).find((member) => member.role === "lead")
export const MSTOCK_MEMBERS = cmccExpertMembers(MSTOCK_EXPERT_ID).filter((member) => member.role !== "lead")
export const MSTOCK_ARTIFACT_ROLES: ArtifactRoleConfig = {
  "20-comparison-report.md": { role: "text-report", label: "对比文字报告" },
  "40-comparison-report.html": { role: "visual-report", label: "横评可视化看板" },
}
export const MSTOCK_DAG_ORDER = MSTOCK_MEMBERS.map((member) => member.id)
export const MSTOCK_DAG_EDGES = MSTOCK_DAG_ORDER.slice(1).map((id, index) => [MSTOCK_DAG_ORDER[index], id] as const)
