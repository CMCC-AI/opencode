import { describe, expect, test } from "bun:test"
import { CMCC_DEEP_RESEARCH_PRODUCT, cmccHistoryProduct } from "./cmcc-history-product"

describe("CMCC history product labels", () => {
  test("shares the research badge without relabeling general conversations", () => {
    expect(CMCC_DEEP_RESEARCH_PRODUCT.label).toBe("深度研究")
    expect(cmccHistoryProduct("deepinsight", "deepinsight/deepinsight-team-lead")).toBe(CMCC_DEEP_RESEARCH_PRODUCT)
    expect(cmccHistoryProduct("deepinsight", "build", "deepinsight/deepinsight-team-lead")).toBe(
      CMCC_DEEP_RESEARCH_PRODUCT,
    )
    expect(cmccHistoryProduct("deepinsight", "build", "build")?.label).toBe("通用对话")
  })

  test("maps supported agent types to Chinese product labels", () => {
    const cases = [
      ["DeepInsight", "通用对话"],
      ["zhengqi-visit-intel", "AI+政企"],
      ["deepinspect", "AI+巡察"],
      ["deeptrading", "AI+财经"],
      ["mstock", "多股对比"],
      ["shoppers-pro", "AI+推荐"],
      ["ai-for-science-team", "AI+科研"],
      ["ai-scientist", "AI+科研"],
      ["deepgeo", "AI+位置"],
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
      "deepgeo",
    ]
    const products = agentTypes.map((agentType) => cmccHistoryProduct(agentType))

    expect(products.every(Boolean)).toBe(true)
    expect(new Set(products.map((product) => product?.backgroundColor)).size).toBe(agentTypes.length)
  })
})
