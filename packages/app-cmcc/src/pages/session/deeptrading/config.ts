import { cmccTeamExpertByAgent } from "@/utils/cmcc-experts"
import type { ArtifactRoleConfig } from "../agent-workbench/artifacts"
import { DEEPTRADING_LEAD_AGENT } from "./page-selection"

export { DEEPTRADING_LEAD_AGENT } from "./page-selection"

const team = cmccTeamExpertByAgent(DEEPTRADING_LEAD_AGENT)

if (!team) throw new Error(`DeepTrading team config not found: ${DEEPTRADING_LEAD_AGENT}`)

export const DEEPTRADING_EXPERT_ID = team.id
export const DEEPTRADING_MEMBERS = team.members.filter((member) => member.role !== "lead")

export const DEEPTRADING_DAG_LEVELS = [
  ["deeptrading/dt-intake"],
  [
    "deeptrading/dt-market-analyst",
    "deeptrading/dt-sentiment-analyst",
    "deeptrading/dt-news-analyst",
    "deeptrading/dt-fundamentals-analyst",
  ],
  ["deeptrading/dt-research-manager"],
  ["deeptrading/dt-trader"],
  ["deeptrading/dt-report-writer"],
  ["deeptrading/dt-viz"],
] as const

export const DEEPTRADING_DAG_EDGES = [
  ...DEEPTRADING_DAG_LEVELS[1].map((agent) => ["deeptrading/dt-intake", agent] as const),
  ...DEEPTRADING_DAG_LEVELS[1].map((agent) => [agent, "deeptrading/dt-research-manager"] as const),
  ["deeptrading/dt-research-manager", "deeptrading/dt-trader"],
  ["deeptrading/dt-trader", "deeptrading/dt-report-writer"],
  ["deeptrading/dt-report-writer", "deeptrading/dt-viz"],
] as const

export const DEEPTRADING_STAGE_LABELS = [
  "标的确认",
  "四维分析",
  "投资决策",
  "交易方案",
  "报告撰写",
  "可视化交付",
] as const

export const DEEPTRADING_ARTIFACT_ROLES: ArtifactRoleConfig = {
  "00-input.json": { role: "supporting", label: "用户输入与任务参数" },
  "01-intake.json": { role: "supporting", label: "标的确认", expectedAgentId: "deeptrading/dt-intake" },
  "10-market-report.md": {
    role: "supporting",
    label: "市场分析报告",
    expectedAgentId: "deeptrading/dt-market-analyst",
  },
  "11-sentiment-report.md": {
    role: "supporting",
    label: "舆情分析报告",
    expectedAgentId: "deeptrading/dt-sentiment-analyst",
  },
  "12-news-report.md": { role: "supporting", label: "新闻分析报告", expectedAgentId: "deeptrading/dt-news-analyst" },
  "13-fundamentals-report.md": {
    role: "supporting",
    label: "基本面分析报告",
    expectedAgentId: "deeptrading/dt-fundamentals-analyst",
  },
  "20-research-plan.md": {
    role: "supporting",
    label: "投资研究计划",
    expectedAgentId: "deeptrading/dt-research-manager",
  },
  "21-trader-plan.md": { role: "supporting", label: "交易执行方案", expectedAgentId: "deeptrading/dt-trader" },
  "30-final-report.md": { role: "text-report", label: "文字报告", expectedAgentId: "deeptrading/dt-report-writer" },
  "35-visual-report.json": {
    role: "supporting",
    label: "可视化报告结构数据",
    expectedAgentId: "deeptrading/dt-viz",
  },
  "40-report.html": { role: "visual-report", label: "可视化报告" },
}

const AVATARS = import.meta.glob("../../../../../../.opencode/experts/deeptrading/avatars/*.png", {
  eager: true,
  import: "default",
  query: "?url",
}) as Record<string, string>

export function deepTradingAvatar(agentId: string) {
  const agent = agentId.split("/").at(-1)
  if (!agent) return
  return AVATARS[`../../../../../../.opencode/experts/deeptrading/avatars/${agent}.png`]
}
