import { CMCC_DEFAULT_RESEARCH_EXPERT, CMCC_TEAM_EXPERTS } from "@/utils/cmcc-experts"
import type { MobileAgents, MobileAssistant } from "./history"

const finance = CMCC_TEAM_EXPERTS.find((entry) => entry.id === "deeptrading")!
const shopping = CMCC_TEAM_EXPERTS.find((entry) => entry.id === "shoppers-pro")!
const research = CMCC_DEFAULT_RESEARCH_EXPERT
const researchQuick = "deepinsight/deepinsight-quick"
const lens = { id: "deeplens", quick: "deeplens/deeplens-quick" } as const

export const financeAnalysisAgent = finance.quickAgent!
export const mobileAssistants = {
  lingxi: { name: "灵犀", agent: "build", expertID: undefined },
  deepinsight: { name: "深度洞察", agent: researchQuick, expertID: research.id },
  finance: { name: "财经专家", agent: finance.liteQuickAgent!, expertID: finance.id },
  shopping: { name: "AI+推荐", agent: shopping.quickAgent!, expertID: shopping.id },
  deeplens: { name: "DeepLens 拍照即懂", agent: lens.quick, expertID: lens.id },
} as const satisfies Record<MobileAssistant, { name: string; agent?: string; expertID?: string }>

export const mobileAgents: MobileAgents = {
  finance: { id: finance.id, quick: mobileAssistants.finance.agent, analysis: financeAnalysisAgent },
  shopping: { id: shopping.id, quick: mobileAssistants.shopping.agent },
  research: { id: research.id, quick: researchQuick, lead: research.leadAgent },
  lens,
}

export const mobileSkills: Partial<Record<MobileAssistant, string>> = {
  deepinsight: "deepinsight-brief",
  deeplens: "deeplens-brief",
}
