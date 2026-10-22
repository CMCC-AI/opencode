import { readFile } from "node:fs/promises"
import type { Page } from "@playwright/test"
import { htmlPreviewCsp, htmlPreviewRuntime, prepareHtmlPreview } from "../../../opencode/src/server/html-preview"

export async function htmlReportFixture() {
  if (process.env.CMCC_HTML_REPORT_FIXTURE) return readFile(process.env.CMCC_HTML_REPORT_FIXTURE, "utf8")
  const template = await readFile(
    new URL(
      "../../../../.opencode/experts/deepinsight/skills/deepinsight-pipeline/templates/report.html.tpl",
      import.meta.url,
    ),
    "utf8",
  )
  const print = await readFile(
    new URL(
      "../../../../.opencode/experts/deepinsight/skills/deepinsight-pipeline/templates/report-print.css",
      import.meta.url,
    ),
    "utf8",
  )
  const visual = {
    title: "Local HTML Report Verification",
    sections: [
      {
        id: "verification",
        heading: "1 Report",
        level: 2,
        blocks: [
          {
            type: "markdown",
            content: String.raw`### 1.1 Mathematics

The operator is $\mathcal{N}[u]$. Source [1].

$$\frac{\partial u}{\partial t}+u\frac{\partial u}{\partial x}=0$$

| Field | Value |
| --- | --- |
| Network | $u_\theta$ |

Cost $100-$200. Inline code: ${"`$x$`"}.

${"```text\n### literal heading\n$$not-a-formula$$\n```"}`,
          },
          {
            type: "chart",
            chart: {
              id: "fixture",
              type: "bar",
              title: "Compatibility chart",
              option: {
                animation: false,
                xAxis: { type: "category", data: ["A", "B", "C"] },
                yAxis: { type: "value" },
                series: [{ type: "bar", name: "Value", data: [1, 2, 3] }],
              },
            },
          },
        ],
      },
    ],
  }
  const references = [{ n: 1, title: "Fixture reference", target: "https://example.invalid/source" }]
  const json = (value: unknown) => JSON.stringify(value).replace(/<\/script>/gi, "<\\/script>")
  return template
    .replaceAll("__TITLE__", visual.title)
    .replace("__VISUAL_REPORT_JSON__", () => json(visual))
    .replace("__REFERENCES_JSON__", () => json(references))
    .replace("__PRINT_CSS__", () => print)
}

export async function serveReportRuntime(page: Page) {
  // Avoid loopback networking from an opaque sandbox; this exercises the real built bundle.
  await page.route("**/assets/report-runtime-*.js", async (route) => {
    const asset = new URL(route.request().url()).pathname.split("/").at(-1)!
    return route.fulfill({
      contentType: "text/javascript; charset=utf-8",
      body: await readFile(new URL(`../../dist/assets/${asset}`, import.meta.url)),
    })
  })
}

export function htmlReportPreview(html: string, requestUrl: string, pageUrl = requestUrl) {
  const url = new URL(requestUrl)
  const runtime = htmlPreviewRuntime(url.searchParams.get("runtime") ?? undefined, requestUrl, pageUrl)
  if (!runtime) throw new Error("Unexpected report runtime URL")
  return {
    contentType: "text/html; charset=utf-8",
    body: prepareHtmlPreview(html, runtime.href, url.searchParams.get("directory") ?? "/", "report.html"),
    headers: { "content-security-policy": htmlPreviewCsp(runtime) },
  }
}
