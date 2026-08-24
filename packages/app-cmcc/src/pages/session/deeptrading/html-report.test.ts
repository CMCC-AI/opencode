import { describe, expect, test } from "bun:test"
import { deepTradingHtmlReportPreviewUrl } from "./html-report"

describe("DeepTrading HTML report", () => {
  test("builds a directory-scoped preview URL with the packaged ECharts runtime", () => {
    const preview = new URL(
      deepTradingHtmlReportPreviewUrl({
        serverUrl: "http://localhost:4096/server/local",
        directory: "D:/workspace/u-2/runs/session-1",
        path: "tmp/trading-workspace/40-report.html",
        runtimeUrl: "/assets/echarts.min-test.js",
        pageOrigin: "http://localhost:3000",
        authToken: "encoded-token",
      }),
    )

    expect(preview.origin).toBe("http://localhost:4096")
    expect(preview.pathname).toBe("/file/preview")
    expect(preview.searchParams.get("directory")).toBe("D:/workspace/u-2/runs/session-1")
    expect(preview.searchParams.get("path")).toBe("tmp/trading-workspace/40-report.html")
    expect(preview.searchParams.get("runtime")).toBe("http://localhost:3000/assets/echarts.min-test.js")
    expect(preview.searchParams.get("auth_token")).toBe("encoded-token")
  })
})
