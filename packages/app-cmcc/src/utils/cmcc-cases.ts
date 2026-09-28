export const CMCC_CASE_CATEGORIES = [
  {
    code: "deep-research",
    label: "通用深度研究",
    agentType: "deepinsight",
    description: "跨行业复杂问题研究与长报告交付",
    tone: "#eef4ff",
  },
  {
    code: "government",
    label: "AI+政企",
    agentType: "zhengqi-visit-intel",
    description: "政企客户洞察与高价值拜访准备",
    tone: "#eef8ff",
  },
  {
    code: "science",
    label: "AI+科研",
    agentType: "ai-scientist",
    description: "论文解读、实验复现与科研分析",
    tone: "#eef8ff",
  },
  {
    code: "finance",
    label: "AI+财经",
    agentType: "deeptrading",
    description: "多智能体财经研究与交易分析",
    tone: "#fff9e9",
  },
  {
    code: "recommendation",
    label: "AI+推荐",
    agentType: "shoppers-pro",
    description: "商品发现、口碑分析与购买决策",
    tone: "#f1f3ff",
  },
  {
    code: "location",
    label: "AI+位置",
    agentType: "deepgeo",
    description: "商业选址与位置决策分析",
    tone: "#f7f1ff",
  },
  {
    code: "inspection",
    label: "AI+巡察",
    agentType: "deepinspect",
    description: "现场风险识别与巡察报告生成",
    tone: "#eefafa",
  },
] as const

export const CMCC_CASES_UPDATED_EVENT = "cmcc:cases-updated"

const CMCC_CASE_AGENT_TYPE_ALIASES: Record<string, string> = {
  mstock: "deeptrading",
  "ai-for-science-team": "ai-scientist",
  deepcampaign: "deepgeo",
}

export type CmccCaseCategoryCode = (typeof CMCC_CASE_CATEGORIES)[number]["code"]

export function cmccCaseCategoryByCode(code: string | undefined) {
  return CMCC_CASE_CATEGORIES.find((item) => item.code === code)
}

export function cmccCaseCategoryByAgentType(agentType: string | undefined) {
  const key = agentType?.trim().toLowerCase()
  if (!key) return undefined
  const canonical = CMCC_CASE_AGENT_TYPE_ALIASES[key] ?? key
  return CMCC_CASE_CATEGORIES.find((item) => item.agentType === canonical)
}

export function cmccCasePublishingAllowed(casePublishAllowed: boolean | undefined, agentType: string | undefined) {
  return casePublishAllowed === true && cmccCaseCategoryByAgentType(agentType) !== undefined
}

export function cmccCaseManagementAllowed(casePublishAllowed: boolean | undefined) {
  return casePublishAllowed === true
}

export function formatCaseCharacterCount(value: number) {
  const count = Math.max(0, Number.isFinite(value) ? value : 0)
  if (count >= 10_000) return `${(count / 10_000).toFixed(count >= 100_000 ? 0 : 1)}万字`
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}千字`
  return `${Math.round(count)}字`
}
