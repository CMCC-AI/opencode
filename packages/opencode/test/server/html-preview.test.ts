import { describe, expect, test } from "bun:test"
import { DomUtils, parseDocument } from "htmlparser2"
import { htmlPreviewCsp, htmlPreviewRuntime, prepareHtmlPreview } from "../../src/server/html-preview"

const runtime = "http://app.local:3000/assets/report-runtime-0123456789ab.js"
const request = "http://backend.local/file/preview"
const referer = "http://app.local:3000/session/report"

describe("local report preview runtime", () => {
  test("accepts the fixed local bundle while retaining cached ECharts clients", () => {
    expect(htmlPreviewRuntime(runtime, request, referer)?.href).toBe(runtime)
    expect(htmlPreviewRuntime("http://app.local:3000/assets/echarts.min-TestHash.js", request, referer)).toBeDefined()
  })

  test.each([
    "https://external.invalid/assets/report-runtime-0123456789ab.js",
    "http://app.local:3000/assets/report-runtime-invalid.js",
    "http://app.local:3000/assets/report-runtime-0123456789ab.js?extra=1",
    "http://app.local:3000/assets/report-runtime-0123456789ab.js#fragment",
    "http://user:password@app.local:3000/assets/report-runtime-0123456789ab.js",
    "http://app.local:3000/uploads/report-runtime-0123456789ab.js",
    "http://app.local:3000/assets/other.js",
    "javascript:alert(1)",
  ])("rejects unapproved runtime URLs: %s", (url) => {
    expect(htmlPreviewRuntime(url, request, referer)).toBeUndefined()
  })

  test("installs the runtime before report scripts and removes only libraries it replaces", () => {
    const original = `<!doctype html><html><head>
      <script>window.before = true;</script>
      <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js" integrity="old"></script>
      <script src="https://cdn.jsdelivr.net/npm/echarts/dist/echarts.min.js"></script>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex/dist/katex.min.css">
      <script src="./custom-marked-helper.js"></script>
      </head><body><script type="application/json">{"content":"### 1.1 Report"}</script></body></html>`
    const html = prepareHtmlPreview(original, runtime, "/workspace", "report.html")
    const document = parseDocument(html)
    const scripts = DomUtils.getElementsByTagName("script", document.children)
    expect(scripts[0].attribs.src).toBe(runtime)
    expect(scripts[0].attribs["data-cmcc-report-runtime"]).toBe("local")
    expect(html).not.toContain("cdn.jsdelivr.net")
    expect(html).toContain("custom-marked-helper.js")
    expect(html).toContain('{"content":"### 1.1 Report"}')
    expect(html).toContain("window.before = true;")
    expect(original).toContain('integrity="old"')
  })

  test("keeps the preview isolated without external network or font access", () => {
    const csp = htmlPreviewCsp(new URL(runtime))
    expect(csp).toContain(`script-src 'unsafe-inline' ${runtime}`)
    expect(csp).toContain("connect-src 'none'")
    expect(csp).toContain("font-src data:")
    expect(csp).toContain("form-action 'none'")
    expect(csp).not.toContain("https:")
  })
})
