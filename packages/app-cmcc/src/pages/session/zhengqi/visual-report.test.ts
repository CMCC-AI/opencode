import { describe, expect, test } from "bun:test"
import { parseZhengqiVisualReport } from "./visual-report"

describe("Zhengqi visual report", () => {
  test("parses the documented report schema with an ECharts option", () => {
    const result = parseZhengqiVisualReport(
      JSON.stringify({
        report: {
          title: "谈参高拜报告",
          sections: [
            {
              id: "overview",
              title: "拜访摘要",
              blocks: [
                { type: "markdown", content: "正文" },
                {
                  type: "chart",
                  chart: { id: "income", type: "bar", option: { series: [{ type: "bar", data: [1] }] } },
                },
              ],
            },
          ],
        },
        references: [{ id: "REF-1", type: "public", title: "公开来源", url: "https://example.com" }],
      }),
    )
    expect(result.report?.sections[0]?.blocks.map((block) => block.type)).toEqual(["markdown", "chart"])
    expect(result.report?.references).toEqual([
      { id: "REF-1", type: "public", title: "公开来源", url: "https://example.com" },
    ])
  })

  test("parses the observed chart, table and stat grid schema", () => {
    const result = parseZhengqiVisualReport(
      JSON.stringify({
        report: {
          title: "工商银行谈参报告",
          sections: [
            {
              title: "经营分析",
              blocks: [
                {
                  type: "chart",
                  id: "growth",
                  chart_type: "bar",
                  config: { orientation: "horizontal" },
                  categories: ["专线", "云"],
                  series: [{ name: "同比", data: [14.4, -5.7] }],
                },
                { type: "table", headers: ["业务", "收入"], rows: [["专线", 10]] },
                { type: "stat_grid", items: [{ label: "客户排名", value: 2, unit: "位" }] },
              ],
            },
          ],
        },
      }),
    )
    const blocks = result.report?.sections[0]?.blocks ?? []
    expect(blocks.map((block) => block.type)).toEqual(["chart", "table", "stat_grid"])
    expect(blocks[0]?.type === "chart" && blocks[0].option).toBeTruthy()
    expect(blocks[0]?.type === "chart" && blocks[0].fallback?.rows).toEqual([
      ["专线", 14.4],
      ["云", -5.7],
    ])
  })

  test("rejects malformed and unknown reports without guessing", () => {
    expect(parseZhengqiVisualReport("not-json").error).toBe("可视化报告不是有效的 JSON")
    expect(parseZhengqiVisualReport(JSON.stringify({ report: { sections: [] } })).error).toBe(
      "可视化报告没有可识别的内容块",
    )
    expect(
      parseZhengqiVisualReport(
        JSON.stringify({ report: { sections: [{ blocks: [{ type: "unknown", content: "x" }] }] } }),
      ).error,
    ).toBe("可视化报告没有可识别的内容块")
  })
})
