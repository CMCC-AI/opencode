import { describe, expect, test } from "bun:test"
import { cmccHistoryProduct } from "./cmcc-history-product"

describe("CMCC history product labels", () => {
  test("maps supported agent types to Chinese product labels", () => {
    const cases = [
      ["DeepInsight", "通用深度"],
      ["zhengqi-visit-intel", "AI+政企"],
      ["deepinspect", "AI+巡察"],
      ["deeptrading", "AI+财经"],
      ["shoppers-pro", "AI+推荐"],
      ["ai-for-science-team", "AI+科研"],
      ["ai-scientist", "AI+科研"],
      ["deepcampaign", "AI+营销"],
    ] as const

    for (const [agentType, label] of cases) {
      expect(cmccHistoryProduct(agentType)?.label).toBe(label)
    }
  })

  test("normalizes whitespace and case without exposing unknown technical names", () => {
    expect(cmccHistoryProduct("  DEEPTRADING  ")?.label).toBe("AI+财经")
    expect(cmccHistoryProduct("unsupported-agent")).toBeUndefined()
    expect(cmccHistoryProduct(undefined)).toBeUndefined()
  })

  test("uses a distinct palette for each visible product", () => {
    const agentTypes = [
      "deepinsight",
      "zhengqi-visit-intel",
      "deepinspect",
      "deeptrading",
      "shoppers-pro",
      "ai-for-science-team",
      "deepcampaign",
    ]
    const products = agentTypes.map((agentType) => cmccHistoryProduct(agentType))

    expect(products.every(Boolean)).toBe(true)
    expect(new Set(products.map((product) => product?.backgroundColor)).size).toBe(agentTypes.length)
  })
})
