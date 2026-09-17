import type { ArtifactRoleConfig } from "../agent-workbench/artifacts"

export const DEEPINSIGHT_RESEARCH_MEMBERS = [
  "deepinsight/di-local-researcher",
  "deepinsight/di-web-researcher",
] as const
export const DEEPINSIGHT_ARTIFACT_ROLES: ArtifactRoleConfig = {
  "20-report.md": { role: "text-report" },
  "30-report.html": { role: "visual-report" },
}
