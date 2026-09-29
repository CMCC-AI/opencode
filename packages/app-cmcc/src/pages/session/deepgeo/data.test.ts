import { describe, expect, test } from "bun:test"
import { deepGeoArtifactOwnerLabel, deepGeoProgress, deepGeoReportChartCount } from "./data"

describe("DeepGeo data adapters", () => {
  test("counts only SVG chart artifacts", () => {
    expect(
      deepGeoReportChartCount([
        { filename: "chart.svg" } as never,
        { filename: "report.html" } as never,
        { filename: "other.SVG" } as never,
      ]),
    ).toBe(2)
  })

  test("uses configured members as the progress denominator", () => {
    expect(
      deepGeoProgress({
        requiredAgentIds: ["a", "b", "c"],
        nodes: [
          { id: "a", status: "completed" } as never,
          { id: "b", status: "running" } as never,
          { id: "c", status: "waiting" } as never,
        ],
      }),
    ).toBe(33)
  })

  test("labels directory-scanned files without inventing an Agent owner", () => {
    expect(deepGeoArtifactOwnerLabel("")).toBe("产物目录扫描")
    expect(deepGeoArtifactOwnerLabel("deepgeo/dg-report-editor", "报告与可视化总编 · 阿读")).toBe(
      "报告与可视化总编 · 阿读",
    )
  })
})
