export type CmccHistoryProduct = Readonly<{
  label: string
  backgroundColor: string
  borderColor: string
  textColor: string
}>

const deepResearch = {
  label: "通用深度",
  backgroundColor: "#e8efff",
  borderColor: "#d8e4ff",
  textColor: "#4774e8",
} as const

const aiScience = {
  label: "AI+科研",
  backgroundColor: "#f0ecff",
  borderColor: "#dfd7ff",
  textColor: "#6d54d8",
} as const

const products: Record<string, CmccHistoryProduct> = {
  deepinsight: deepResearch,
  "zhengqi-visit-intel": {
    label: "AI+政企",
    backgroundColor: "#e8f4ff",
    borderColor: "#d4e9fb",
    textColor: "#2b7ec1",
  },
  deepinspect: {
    label: "AI+巡察",
    backgroundColor: "#e6f7f4",
    borderColor: "#d1eee7",
    textColor: "#1b8574",
  },
  deeptrading: {
    label: "AI+财经",
    backgroundColor: "#e5f5fb",
    borderColor: "#d0eaf2",
    textColor: "#147b9c",
  },
  "shoppers-pro": {
    label: "AI+推荐",
    backgroundColor: "#fff0e5",
    borderColor: "#f5ddc8",
    textColor: "#c46b26",
  },
  "ai-for-science-team": aiScience,
  "ai-scientist": aiScience,
  deepcampaign: {
    label: "AI+营销",
    backgroundColor: "#fdebf4",
    borderColor: "#f4d5e5",
    textColor: "#b64f7b",
  },
}

export function cmccHistoryProduct(agentType: string | undefined): CmccHistoryProduct | undefined {
  const key = agentType?.trim().toLowerCase()
  if (!key) return undefined
  return products[key]
}
