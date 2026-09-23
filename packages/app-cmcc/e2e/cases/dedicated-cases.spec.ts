import { expect, test, type Page } from "@playwright/test"
import JSZip from "jszip"
import type { DockApiCaseSnapshot } from "../../src/context/dockapi"
import { mockOpenCodeServer } from "../utils/mock-server"
import { fixture } from "../smoke/session-timeline.fixture"

test.use({ channel: process.env.PLAYWRIGHT_CHANNEL, video: "off" })

const cases = [
  {
    type: "deepinspect",
    lead: "deepinspect/deepinspect-team-lead",
    member: "deepinspect/report-writer",
    category: "inspection",
    experts: 11,
  },
  {
    type: "zhengqi-visit-intel",
    lead: "zhengqi-visit-intel/zhengqi-visit-intel-team-lead",
    member: "zhengqi-visit-intel/report-chief-writer",
    category: "government",
    experts: 10,
  },
  {
    type: "shoppers-pro",
    lead: "shoppers-pro/shoppers-pro-team-lead",
    member: "shoppers-pro/card-editor",
    category: "recommendation",
    experts: 5,
  },
  {
    type: "ai-for-science-team",
    lead: "ai-for-science-team/ai-for-science-team-team-lead",
    member: "ai-for-science-team/as-evidence-writer",
    category: "science",
    experts: 20,
  },
  {
    type: "deepinsight",
    lead: "deepinsight/deepinsight-team-lead",
    member: "deepinsight/di-report-writer",
    category: "deep-research",
    experts: 10,
  },
]

type CaseInput = (typeof cases)[number]
const reportText = "# 案例测试报告\n\n## 摘要\n\n只读快照报告正文。"

function snapshot(input: CaseInput): DockApiCaseSnapshot {
  const entry = (id: string, agent: string, parentID?: string): DockApiCaseSnapshot["sessions"][number] => ({
    session: {
      id,
      slug: id,
      projectID: "case-test",
      directory: "case://workspace",
      title: id,
      agent,
      parentID,
      version: "v2",
      time: { created: 1000, updated: 3000 },
      tokens: { input: 10, output: 20, reasoning: 5, cache: { read: 50, write: 10 } },
    },
    status: { type: "idle" },
    messages: [
      {
        info: {
          id: `${id}-u`,
          sessionID: id,
          role: "user",
          time: { created: 1000 },
          agent,
          model: { providerID: "test", modelID: "test" },
        },
        parts: [
          {
            id: `${id}-ut`,
            messageID: `${id}-u`,
            sessionID: id,
            type: "text",
            text: parentID ? "专家任务" : "案例原始查询",
          },
        ],
      },
      {
        info: {
          id: `${id}-a`,
          sessionID: id,
          role: "assistant",
          parentID: `${id}-u`,
          time: { created: 1500, completed: 3000 },
          agent,
          modelID: "test",
          providerID: "test",
          mode: "build",
          path: { cwd: "case://workspace", root: "case://workspace" },
          cost: 0,
          tokens: { input: 10, output: 20, reasoning: 5, cache: { read: 50, write: 10 } },
        },
        parts: [
          {
            id: `${id}-at`,
            messageID: `${id}-a`,
            sessionID: id,
            type: "text",
            text: parentID ? "专家分析完成" : "案例总览结论",
          },
        ],
      },
    ],
  })
  const root = entry("case-root", input.lead)
  const child = entry("case-child", input.member, "case-root")
  const filenames =
    input.category === "deep-research"
      ? ["20-report.md", "30-report.html", "25-visual-report.json", "22-references.json"]
      : input.category === "science"
        ? ["writing/paper.md", "figures/chart.svg", "reports/view.html"]
        : ["20-report.md", "25-visual-report.json", "06-consolidated-issues.json"]
  for (const path of filenames) {
    child.messages[1].parts.push({
      id: `write-${path}`,
      messageID: "case-child-a",
      sessionID: "case-child",
      type: "tool",
      callID: path,
      tool: "write",
      state: {
        status: "completed",
        title: path,
        input: { filePath: `case://artifacts/${path}`, content: "test" },
        output: "ok",
        metadata: {},
        time: { start: 1900, end: 2500 },
      },
    })
  }
  return {
    schemaVersion: 1,
    caseCode: input.category,
    capturedAt: "2026-09-07T00:00:00Z",
    rootSessionId: "case-root",
    query: "案例原始查询",
    agentType: input.type,
    rootAgent: input.lead,
    sessions: [root, child],
    artifacts: filenames.map((path) => ({ path, size: 120, contentType: "text/plain" })),
  }
}

async function prepare(
  page: Page,
  input: CaseInput,
  options: { fileError?: boolean; inspectionHtml?: boolean; wordReport?: boolean } = {},
) {
  const apiRequests: string[] = []
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  page.on("request", (request) => {
    if (new URL(request.url()).port === "4096")
      apiRequests.push(request.method() + " " + new URL(request.url()).pathname)
  })
  await mockOpenCodeServer(page, { ...fixture, sessions: [], pageMessages: () => ({ items: [] }) })
  await page.addInitScript(() => {
    if (window === window.top) localStorage.setItem("dockapi.accessToken", "case-ui-test-token")
  })
  const snap = snapshot(input)
  const wordArchive = options.wordReport ? new JSZip() : undefined
  wordArchive?.file(
    "[Content_Types].xml",
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  )
  wordArchive?.file(
    "_rels/.rels",
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  )
  wordArchive?.file(
    "word/document.xml",
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>案例 Word 正文</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>',
  )
  const wordBuffer = await wordArchive?.generateAsync({ type: "nodebuffer" })
  if (wordBuffer)
    snap.artifacts.push({
      path: "writing/report.docx",
      size: wordBuffer.length,
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    })
  if (options.inspectionHtml) {
    snap.artifacts.push({ path: "reports/inspection.html", size: 120, contentType: "text/html" })
  }
  const metadata = {
    ...snap,
    caseName: `测试案例-${input.category}`,
    category: input.category,
    categoryLabel: "测试分类",
    caseTag: "测试标签",
    coverUrl: "",
    reportCharCount: 20,
    publishedAt: "2026-09-07",
    snapshotVersion: "test-version",
    snapshotBytes: 1000,
    artifactBytes: 120,
  }
  const fileRequests: string[] = []
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname
    const json = (data: unknown) =>
      route.fulfill({ json: { code: 200, message: "ok", data }, headers: { "access-control-allow-origin": "*" } })
    if (path === "/api/user/profile")
      return json({
        user: { id: 999, name: "测试用户", phone: "", enabled: true, casePublishAllowed: false },
        workspace: { id: 999, workspaceKey: "test", directoryPath: fixture.directory, status: "READY" },
      })
    if (path === "/api/dockapi/sessions") return json([])
    if (path.endsWith("/preview-ticket"))
      return json({
        baseUrl: `http://localhost:8081/api/dockapi/case-preview/${input.category}`,
        expiresAt: "2099-01-01T00:00:00Z",
      })
    if (path.endsWith("/snapshot"))
      return route.fulfill({ json: snap, headers: { "access-control-allow-origin": "*" } })
    if (path.includes("/case-preview/")) {
      fileRequests.push(path)
      if (options.fileError)
        return route.fulfill({ status: 404, body: "missing", headers: { "access-control-allow-origin": "*" } })
      let body = reportText
      if (path.endsWith("22-references.json"))
        body = JSON.stringify([
          { key: "local:SRC-001", kind: "local" },
          { key: "https://example.com/source", kind: "web" },
        ])
      if (path.endsWith("30-report.html"))
        return route.fulfill({
          contentType: "text/html; charset=utf-8",
          body: "<!doctype html><html><body>深度研究可视化正文</body></html>",
        })
      if (path.endsWith("report.docx") && wordBuffer)
        return route.fulfill({
          contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          headers: { "access-control-allow-origin": "*" },
          body: wordBuffer,
        })
      if (path.endsWith("inspection.html"))
        return route.fulfill({
          contentType: "text/html; charset=utf-8",
          body: "<!doctype html><html><body>巡查 HTML 优先预览</body></html>",
        })
      if (path.endsWith("view.html"))
        return route.fulfill({
          contentType: "text/html; charset=utf-8",
          body: '<!doctype html><html><body>科研可视化测试<img src="../figures/chart.svg" alt="案例图表"></body></html>',
        })
      if (path.endsWith("06-consolidated-issues.json")) body = JSON.stringify({ statistics: { total_issues: 7 } })
      if (path.endsWith("25-visual-report.json")) {
        const blocks = [
          { type: "markdown", content: "图表测试正文" },
          {
            type: "chart",
            chart: {
              id: "test-chart",
              option: {
                xAxis: { type: "category", data: ["A", "B"] },
                yAxis: {},
                series: [{ type: "bar", data: [3, 5] }],
              },
            },
          },
        ]
        body = JSON.stringify(
          input.category === "government"
            ? { report: { title: "政企图表测试", sections: [{ id: "s", title: "测试图表", blocks }] } }
            : { layout_version: 2, title: "巡查图表测试", sections: [{ id: "s", heading: "测试图表", blocks }] },
        )
      }
      if (path.endsWith(".svg"))
        return route.fulfill({
          contentType: "image/svg+xml",
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="#4378c4"/></svg>',
        })
      return route.fulfill({ contentType: "text/plain", body, headers: { "access-control-allow-origin": "*" } })
    }
    if (path === `/api/dockapi/cases/${input.category}`) return json(metadata)
    return json([])
  })
  await page.goto(`/cases/${input.category}`)
  await expect(page.getByText(`测试案例-${input.category}`, { exact: true })).toBeVisible({ timeout: 60000 })
  return { errors, apiRequests, fileRequests }
}

test("finance retains its dedicated layout after lazy loading", async ({ page }) => {
  const state = await prepare(page, {
    type: "deeptrading",
    lead: "deeptrading/deeptrading-team-lead",
    member: "deeptrading/dt-intake",
    category: "finance",
    experts: 9,
  })
  await expect(page.getByRole("button", { name: "分析团队", exact: true })).toBeVisible()
  await expect(page.getByText("9 位", { exact: true })).toBeVisible()
  await expect(page.locator('[data-workbench-message="case-root-a"] time')).toHaveAttribute("datetime", new Date(1500).toISOString())
  await page.locator('button[data-status="completed"]').first().click()
  await expect(page.locator('[data-workbench-message="case-child-a"]').getByRole("button", { name: "复制消息" })).toBeVisible()
  await expect(page.locator('[data-component="expert-duration"]')).toHaveText("用时 2秒")
  await expect(page.locator('[contenteditable="true"]')).toHaveCount(0)
  await expect(page.getByRole("button", { name: "看回放", exact: true })).toBeVisible()
  expect(state.errors).toEqual([])
})

for (const input of cases) {
  test(`${input.category}: dedicated snapshot, files and replay are read-only`, async ({ page }) => {
    test.setTimeout(120000)
    await page.setViewportSize({ width: 1440, height: 900 })
    const state = await prepare(page, input)
    await expect(page.getByRole("button", { name: "分析团队", exact: true })).toBeVisible()
    if (input.category === "deep-research") {
      await expect(page.getByText("信息源", { exact: true }).locator("..").locator("strong")).toHaveText("2 篇")
    } else {
      await expect(page.getByText(`${input.experts} 位`, { exact: true })).toBeVisible()
    }
    await expect(page.locator('[data-workbench-message="case-root-a"] time')).toHaveAttribute(
      "datetime",
      new Date(1500).toISOString(),
    )
    await expect(
      page.locator('[data-workbench-message="case-root-a"]').getByRole("button", { name: "复制消息" }),
    ).toBeVisible()
    await page.locator('button[data-status="completed"]').first().click()
    await expect(page.locator('[data-workbench-message="case-child-a"]')).toContainText("专家分析完成")
    await expect(page.locator('[data-component="expert-duration"]')).toHaveText("用时 2秒")
    if (["government", "inspection"].includes(input.category)) {
      await expect(page.getByText("报告篇幅", { exact: true }).locator("..").locator("strong")).toHaveText("17字")
      await expect(
        page.getByText(input.category === "government" ? "公开来源" : "问题线索", { exact: true }),
      ).toHaveCount(0)
      expect(state.fileRequests.filter((path) => path.endsWith("20-report.md"))).toHaveLength(1)
    }
    if (input.category === "recommendation") {
      const dag = page.locator('section[aria-label="推荐分析 DAG"]')
      await expect(dag.locator("button")).toHaveCount(5)
      const price = dag.getByRole("button", { name: /价格分析师/ })
      const discovery = dag.getByRole("button", { name: /商品发现师/ })
      const reputation = dag.getByRole("button", { name: /口碑分析员/ })
      await expect(price).toHaveAttribute("data-status", "waiting")
      const top = (element: Element) => element.getBoundingClientRect().top
      expect(Math.abs((await price.evaluate(top)) - (await discovery.evaluate(top)))).toBeLessThan(1)
      const left = (element: Element) => element.getBoundingClientRect().left
      expect(await price.evaluate(left)).toBeGreaterThan(await discovery.evaluate(left))
      expect(await price.evaluate(top)).toBeLessThan(await reputation.evaluate(top))
      await price.click()
      await expect(page.getByRole("heading", { name: "阿比", exact: true })).toBeVisible()
    }
    if (["government", "recommendation"].includes(input.category)) {
      await expectRightFold(page, input.experts)
      await page.locator("[data-serial-dag]").screenshot({ path: `e2e/test-results/case-${input.category}-dag.png` })
    }
    await expect(page.locator('[contenteditable="true"], textarea')).toHaveCount(0)
    await page.screenshot({ path: `e2e/test-results/case-${input.category}-desktop.png`, fullPage: true })
    await page.getByRole("button", { name: "文字报告", exact: true }).click()
    await expect(page.getByText("只读快照报告正文。", { exact: true })).toBeVisible()
    await page.getByRole("button", { name: "可视化报告", exact: true }).click()
    if (["government", "inspection"].includes(input.category)) {
      await expect(page.getByText("图表测试正文", { exact: true })).toBeVisible()
      await expect(page.locator("canvas")).toBeVisible()
      await expect
        .poll(() =>
          page.locator("canvas").evaluate((canvas: HTMLCanvasElement) => {
            const data = canvas.getContext("2d")?.getImageData(0, 0, canvas.width, canvas.height).data
            return data?.some((value, index) => index % 4 === 3 && value > 0) ?? false
          }),
        )
        .toBe(true)
      await page.screenshot({ path: `e2e/test-results/case-${input.category}-visual.png`, fullPage: true })
    } else if (input.category === "deep-research") {
      await expect(page.frameLocator('iframe[title="30-report.html"]').getByText("深度研究可视化正文")).toBeVisible()
    } else if (input.category === "science") {
      const report = page.frameLocator('iframe[title="view.html"]')
      await expect(report.getByText("科研可视化测试", { exact: true })).toBeVisible()
      await expect
        .poll(() => report.getByRole("img", { name: "案例图表" }).evaluate((img: HTMLImageElement) => img.naturalWidth))
        .toBeGreaterThan(0)
    } else
      await expect(
        page.getByText(input.category === "science" ? "可视化报告尚未生成" : "可视化报告格式暂未适配", { exact: true }),
      ).toBeVisible()
    await page.getByRole("button", { name: "文件", exact: true }).click()
    if (input.category === "science") {
      await page.getByRole("button", { name: /^writing/ }).click()
      await page.getByRole("button", { name: "paper.md", exact: true }).click()
    } else await page.getByRole("button", { name: "预览", exact: true }).first().click()
    await expect(page.getByRole("button", { name: "返回", exact: true })).toBeVisible()
    const download = page.waitForEvent("download")
    await page.getByRole("button", { name: "下载", exact: true }).click()
    expect((await download).suggestedFilename()).toBeTruthy()
    await page.getByRole("button", { name: "看回放", exact: true }).click()
    await expect(page.getByRole("button", { name: "停止回放", exact: true })).toBeVisible()
    if (["government", "inspection"].includes(input.category)) {
      await expect(page.getByText("报告篇幅", { exact: true }).locator("..").locator("strong")).toHaveText("0字")
    }
    await expect(page.getByRole("button", { name: "做同款", exact: true })).toHaveCount(0)
    await page.getByRole("button", { name: "停止回放", exact: true }).click()
    await expect(page.getByRole("button", { name: "做同款", exact: true })).toBeVisible()
    if (["government", "inspection"].includes(input.category)) {
      await expect(page.getByText("报告篇幅", { exact: true }).locator("..").locator("strong")).toHaveText("17字")
    }
    await page.getByRole("button", { name: "隐藏左栏", exact: true }).click()
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole("button", { name: "分析结果", exact: true }).click()
    await expect(page.getByRole("button", { name: "分析团队", exact: true })).toBeVisible()
    const dag = page.locator('section[aria-label$="DAG"]')
    const overlapping = await dag.evaluate((section) => {
      const rects = [...section.querySelectorAll("button")].map((button) => button.getBoundingClientRect())
      return rects.some((a, index) =>
        rects
          .slice(index + 1)
          .some(
            (b) =>
              Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
              Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1,
          ),
      )
    })
    expect(overlapping).toBe(false)
    if (["government", "recommendation"].includes(input.category)) await expectRightFold(page, input.experts)
    await page.screenshot({ path: `e2e/test-results/case-${input.category}-mobile.png`, fullPage: true })
    expect(state.apiRequests.filter((value) => /\/session\/case-|\/file\//.test(value))).toEqual([])
    expect(state.errors).toEqual([])
  })
}

test("old ordinary conversations in deep-research keep the generic read-only page", async ({ page }) => {
  await prepare(page, { ...cases[4], lead: "build", member: "build" })
  await expect(page.getByRole("button", { name: "分析团队", exact: true })).toHaveCount(0)
  await expect(page.locator('[contenteditable="true"]')).toHaveCount(0)
  await expect(page.getByText("案例总览结论", { exact: true })).toBeVisible()
})

test("deep research case creates a research draft without sending it", async ({ page }) => {
  const input = cases[4]
  const state = await prepare(page, input, { wordReport: true })
  await page.getByRole("button", { name: "文字报告", exact: true }).click()
  await page.getByRole("button", { name: "report.docx", exact: true }).click()
  await expect(page.getByText("案例 Word 正文", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "做同款", exact: true }).click()
  await expect(page).toHaveURL(/\/new-session\?/)
  await expect(page.locator('[contenteditable="true"]')).toContainText("案例原始查询")
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("opencode.global.dat:tabs")))
    .toContain(`"agent":"${input.lead}"`)
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("opencode.global.dat:tabs")))
    .toContain('"expertID":"deepinsight"')
  expect(state.apiRequests.filter((value) => value.startsWith("POST /session"))).toEqual([])
})

async function expectRightFold(page: Page, count: number) {
  const dag = page.locator("[data-serial-dag]")
  await expect(dag.locator("button")).toHaveCount(count)
  await expect(dag.locator("path[data-edge]")).toHaveCount(count - 1)
  await expect
    .poll(() =>
      dag.evaluate((element) => {
        const points = [...element.querySelectorAll("button")].map((node) => node.getBoundingClientRect())
        const split = Math.ceil(points.length / 2)
        const upper = points.slice(0, split)
        const lower = points.slice(split)
        return {
          upperRight: upper.every((point, index) => index === 0 || point.left > upper[index - 1].left),
          lowerLeft: lower.every((point, index) => index === 0 || point.left < lower[index - 1].left),
          twoRows:
            upper.every((point) => Math.abs(point.top - upper[0].top) < 1) &&
            lower.every((point) => Math.abs(point.top - lower[0].top) < 1 && point.top > upper[0].bottom),
          rightTurn: Math.abs(upper[upper.length - 1].right - lower[0].right) < 1,
          textFits: [...element.querySelectorAll("button")].every(
            (button) => button.scrollHeight <= button.clientHeight + 1 && button.scrollWidth <= button.clientWidth + 1,
          ),
        }
      }),
    )
    .toEqual({ upperRight: true, lowerLeft: true, twoRows: true, rightTurn: true, textFits: true })
}

test("snapshot report failure shows an error without repeated fetches", async ({ page }) => {
  const state = await prepare(page, cases[1], { fileError: true })
  await page.getByRole("button", { name: "文字报告", exact: true }).click()
  await expect(page.getByText("文字报告读取失败", { exact: true })).toBeVisible()
  const reads = state.fileRequests.filter((path) => path.endsWith("20-report.md")).length
  expect(reads).toBeGreaterThanOrEqual(1)
  expect(reads).toBeLessThanOrEqual(2) // Metric prefetch and an explicit report-tab open may each attempt a read.
  await page.waitForTimeout(1000)
  expect(state.fileRequests.filter((path) => path.endsWith("20-report.md"))).toHaveLength(reads)
  await page.getByRole("button", { name: "分析团队", exact: true }).click()
  await expect(page.getByText("报告篇幅", { exact: true }).locator("..").locator("strong")).toHaveText("--")
  expect(state.errors).toEqual([])
})

test("science case switches between Markdown and a real DOCX snapshot", async ({ page }) => {
  const state = await prepare(page, cases[3], { wordReport: true })
  await page.getByRole("button", { name: "文字报告", exact: true }).click()
  await page.getByRole("button", { name: "report.docx", exact: true }).click()
  await expect(page.getByText("案例 Word 正文", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "paper.md", exact: true }).click()
  await expect(page.getByText("只读快照报告正文。", { exact: true })).toBeVisible()
  expect(state.fileRequests.filter((path) => path.endsWith("report.docx"))).toHaveLength(1)
  expect(state.apiRequests.filter((value) => /\/session\/case-|\/file\//.test(value))).toEqual([])
  expect(state.errors).toEqual([])
})

test("inspection HTML takes priority over JSON and uses the case preview ticket", async ({ page }) => {
  const state = await prepare(page, cases[0], { inspectionHtml: true })
  await page.getByRole("button", { name: "可视化报告", exact: true }).click()
  await expect(page.frameLocator('iframe[title="inspection.html"]').getByText("巡查 HTML 优先预览")).toBeVisible()
  await expect(page.locator('iframe[title="inspection.html"]')).toHaveAttribute(
    "src",
    /\/api\/dockapi\/case-preview\/inspection\/artifacts\/reports\/inspection.html/,
  )
  expect(state.fileRequests.some((path) => path.endsWith("25-visual-report.json"))).toBe(false)
  expect(state.apiRequests.filter((value) => /\/session\/case-|\/file\//.test(value))).toEqual([])
  expect(state.errors).toEqual([])
})

test("replay catches up, respects manual tabs and restores the completed snapshot", async ({ page }) => {
  const state = await prepare(page, cases[1])
  await page.clock.install()
  await page.getByRole("button", { name: "看回放", exact: true }).click()
  await expect(page.getByText("报告篇幅", { exact: true }).locator("..").locator("strong")).toHaveText("0字")
  await page.getByRole("button", { name: "文件", exact: true }).click()
  await page.clock.fastForward(57000)
  await expect(page.getByRole("button", { name: "文件", exact: true })).toHaveAttribute("data-selected", "")
  await expect(page.getByRole("button", { name: "停止回放", exact: true })).toBeVisible()
  await page.getByRole("button", { name: "分析团队", exact: true }).click()
  await expect(page.getByText("报告篇幅", { exact: true }).locator("..").locator("strong")).toHaveText("17字")
  await page.clock.fastForward(4000)
  await expect(page.getByRole("button", { name: "看回放", exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "做同款", exact: true })).toBeVisible()
  await page.getByRole("button", { name: "文字报告", exact: true }).click()
  await expect(page.getByText("只读快照报告正文。", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "看回放", exact: true }).click()
  await expect(page.getByRole("button", { name: "分析团队", exact: true })).toHaveAttribute("data-selected", "")
  await page.getByRole("button", { name: "返回案例库", exact: true }).click()
  await page.clock.fastForward(65000)
  expect(state.apiRequests.filter((value) => /\/session\/case-|\/file\//.test(value))).toEqual([])
  expect(state.errors).toEqual([])
})

test("science alias creates a draft with the case's original agent and query", async ({ page }) => {
  const input = { ...cases[3], type: "ai-scientist" }
  const state = await prepare(page, input)
  await page.getByRole("button", { name: "做同款", exact: true }).click()
  await expect(page).toHaveURL(/\/new-session\?/)
  await expect(page.locator('[contenteditable="true"]')).toContainText("案例原始查询")
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("opencode.global.dat:tabs")))
    .toContain(`"agent":"${input.lead}"`)
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("opencode.global.dat:tabs")))
    .toContain('"expertID":"ai-scientist"')
  expect(state.apiRequests.filter((value) => value.startsWith("POST /session"))).toEqual([])
})
