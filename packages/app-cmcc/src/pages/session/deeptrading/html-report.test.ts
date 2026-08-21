import { describe, expect, test } from "bun:test"
import { prepareDeepTradingHtmlReport } from "./html-report"

describe("DeepTrading HTML report", () => {
  test("replaces the generated ECharts CDN script with the packaged runtime", () => {
    const prepared = prepareDeepTradingHtmlReport(
      `<!DOCTYPE html>
      <html>
        <head>
          <title>中通客车可视化报告</title>
          <script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"></script>
        </head>
        <body><script>window.chartReady = typeof echarts !== "undefined"</script></body>
      </html>`,
      "/assets/echarts.min.js",
    )

    expect(prepared.error).toBeUndefined()
    expect(prepared.title).toBe("中通客车可视化报告")
    expect(prepared.document).not.toContain("cdn.jsdelivr.net")

    const document = new DOMParser().parseFromString(prepared.document!, "text/html")
    const scripts = [...document.querySelectorAll("script")]
    expect(scripts[0]?.getAttribute("src")).toBe("/assets/echarts.min.js")
    expect(scripts[0]?.dataset.deeptradingEcharts).toBe("local")
    expect(scripts[1]?.textContent).toContain("window.chartReady")
  })

  test("injects the packaged runtime even when the report omits the CDN tag", () => {
    const prepared = prepareDeepTradingHtmlReport(
      "<html><head></head><body><div id=\"chart\"></div></body></html>",
      "/assets/echarts.min.js",
    )
    const document = new DOMParser().parseFromString(prepared.document!, "text/html")

    expect(document.querySelectorAll('script[data-deeptrading-echarts="local"]')).toHaveLength(1)
  })

  test("reports an empty HTML artifact instead of rendering a blank frame", () => {
    expect(prepareDeepTradingHtmlReport("  ", "/assets/echarts.min.js")).toEqual({
      title: "DeepTrading 可视化报告",
      error: "HTML 报告内容为空",
    })
  })
})
