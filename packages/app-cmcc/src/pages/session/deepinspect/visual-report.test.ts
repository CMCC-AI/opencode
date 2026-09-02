import { describe, expect, test } from "bun:test"
import {
  buildDeepInspectMarkdownPlaceholders,
  deepInspectBundleChartOption,
  orderDeepInspectVisualBlocks,
  parseDeepInspectVisualReport,
  resolveDeepInspectMarkdownBlock,
} from "./visual-report"

describe("DeepInspect visual report", () => {
  test("parses the sections and blocks layout", () => {
    const result = parseDeepInspectVisualReport(
      JSON.stringify({
        layout_version: 2,
        title: "巡查报告",
        sections: [
          {
            id: "ch1",
            heading: "一、主要问题",
            blocks: [
              { type: "chart", chart: { id: "risk", title: "风险", option: { series: [] } }, after: "__CH1_1__" },
              { type: "markdown", content: "__CH1_1__" },
              { type: "callout", content: "需要整改", tone: "warning" },
            ],
          },
        ],
      }),
    )
    expect(result.error).toBeUndefined()
    expect(result.report?.kind).toBe("layout")
    if (result.report?.kind !== "layout") throw new Error("expected layout")
    expect(result.report.sections[0]?.blocks.map((block) => block.type)).toEqual(["chart", "markdown", "callout"])
  })

  test("parses the verified charts summary structure", () => {
    const result = parseDeepInspectVisualReport(
      JSON.stringify({
        charts: [
          {
            chart_id: "levels",
            chart_type: "pie",
            title: "风险等级",
            data: [
              { label: "高风险", value: 5, color: "#a33a32" },
              { label: "一般", value: 2 },
            ],
          },
        ],
        summary: "共2类风险",
      }),
    )
    expect(result.report?.kind).toBe("chart-bundle")
    if (result.report?.kind !== "chart-bundle") throw new Error("expected chart bundle")
    expect(result.report.charts[0]?.data).toHaveLength(2)
    expect(deepInspectBundleChartOption(result.report.charts[0]!)?.series).toBeDefined()
  })

  test("rejects malformed and unknown reports without guessing", () => {
    expect(parseDeepInspectVisualReport("invalid").error).toContain("有效的 JSON")
    expect(parseDeepInspectVisualReport('{"meta":{"title":"unknown"}}').error).toContain("暂不支持")
  })

  test("fills report placeholders from H2 and H3 sections", () => {
    const placeholders = buildDeepInspectMarkdownPlaceholders(`# 标题

## 摘要

摘要正文

## 一、主要问题

### 1.1 管理问题

问题正文

### 1.2 风险问题

风险正文`)
    expect(placeholders.get("__ABSTRACT__")).toBe("摘要正文")
    expect(placeholders.get("__CH1_1__")).toContain("管理问题")
    expect(placeholders.get("__CH1_2__")).toContain("风险正文")
    expect(resolveDeepInspectMarkdownBlock("__CH1_1__", placeholders).unresolved).toBe(false)
    expect(resolveDeepInspectMarkdownBlock("______", placeholders).unresolved).toBe(true)
  })

  test("places anchored charts after their markdown block", () => {
    const parsed = parseDeepInspectVisualReport(
      JSON.stringify({
        layout_version: 2,
        sections: [
          {
            blocks: [
              { type: "chart", chart: { id: "risk", option: {} }, after: "__CH1_1__" },
              { type: "markdown", content: "__CH1_1__" },
            ],
          },
        ],
      }),
    )
    if (parsed.report?.kind !== "layout") throw new Error("expected layout")
    expect(orderDeepInspectVisualBlocks(parsed.report.sections[0]!.blocks).map((block) => block.type)).toEqual([
      "markdown",
      "chart",
    ])
  })
})
