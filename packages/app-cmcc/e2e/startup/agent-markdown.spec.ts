import { expect, test, type Locator, type Page } from "@playwright/test"
import { readFile } from "node:fs/promises"
import type { Message, Part, Session } from "@opencode-ai/sdk/v2"
import { base64Encode } from "@opencode-ai/core/util/encode"
import { MSTOCK_LEAD_AGENT, MSTOCK_MEMBERS } from "../../src/pages/session/mstock/config"
import { cmccExpertMembers } from "../../src/utils/cmcc-expert-members"
import { setupGeneralChat } from "./general-chat.fixture"
import { setupHomePage, homeDirectory } from "./home-fixture"
import { fixture } from "../smoke/session-timeline.fixture"
import { mockOpenCodeServer } from "../utils/mock-server"
import { expectTeamPanelResize, expectTeamStatIcons, expectTeamSurfaceColors } from "../utils/workbench-surfaces"
import { previewFiles } from "./preview-files.fixture"
import { htmlReportFixture, htmlReportPreview, serveReportRuntime } from "./html-report.fixture"

test.use({ locale: "zh-CN" })
const baseline = process.env.MARKDOWN_PHASE === "before"
const teams = [
  { id: "deepinsight", lead: "deepinsight/deepinsight-team-lead", member: "deepinsight/di-intent-analyst" },
  { id: "deeptrading", lead: "deeptrading/deeptrading-team-lead", member: "deeptrading/dt-intake" },
  { id: "deepinspect", lead: "deepinspect/deepinspect-team-lead", member: "deepinspect/intent-analyst" },
  { id: "shoppers-pro", lead: "shoppers-pro/shoppers-pro-team-lead", member: "shoppers-pro/need-insight" },
  {
    id: "zhengqi-visit-intel",
    lead: "zhengqi-visit-intel/zhengqi-visit-intel-team-lead",
    member: "zhengqi-visit-intel/sensitive-check-officer",
  },
  { id: "deepgeo", lead: "deepgeo/deepgeo-team-lead", member: "deepgeo/dg-task-governor" },
  {
    id: "ai-for-science-team",
    lead: "ai-for-science-team/ai-for-science-team-team-lead",
    member: "ai-for-science-team/as-intent-router",
  },
  { id: "mstock", lead: MSTOCK_LEAD_AGENT, member: MSTOCK_MEMBERS[0].id },
]
const markdown = [
  "# 内容样式验收",
  "## 研究结论",
  "这段内容仅用于测试，包含 **重点**、`inline_code` 和 [来源](https://example.com/source)。",
  "> 保留引用与证据层级。",
  "### 分析步骤",
  "1. 核对材料\n2. 检查结论\n   - 保留嵌套列表",
  "```python\nprint('markdown style test')\n```",
  "| 指标 | 结果 |\n| --- | --- |\n| 来源 | 已核对 |\n| 证据 | 待复核 |",
  "| " +
    Array.from({ length: 12 }, (_, index) => `完整指标名称${index}`).join(" | ") +
    " |\n| " +
    Array(12).fill("---").join(" | ") +
    " |\n| " +
    Array(12).fill("需要核对的原始结果").join(" | ") +
    " |",
].join("\n\n")

async function styles(content: Locator) {
  await expect(content.locator("table").first()).toBeVisible()
  return content.evaluate((root) => {
    const select = (selector: string, properties: string[]) => {
      const node = selector ? root.querySelector(selector)! : root
      const css = getComputedStyle(node)
      return Object.fromEntries(properties.map((property) => [property, css.getPropertyValue(property)]))
    }
    return {
      body: select("", ["color", "font-size", "line-height"]),
      heading: select("h2", ["color", "font-size", "line-height", "margin-top", "margin-bottom"]),
      paragraph: select("p", ["margin-top", "margin-bottom"]),
      list: select("ol", ["margin-top", "padding-left"]),
      quote: select("blockquote", ["background-color", "border-left-color", "padding-left"]),
      code: select("pre", ["background-color", "font-size", "line-height", "padding-left"]),
      table: select("table", ["border-collapse", "border-top-color", "font-size", "border-radius"]),
      header: select("th", ["color", "background-color", "padding-left", "padding-top"]),
    }
  })
}

let reference: Awaited<ReturnType<typeof styles>>
test.beforeAll(async ({ browser, baseURL }) => {
  const page = await browser.newPage({ locale: "zh-CN" })
  try {
    const data = await setupGeneralChat(page, { turns: 1 })
    await page.goto(data.href(baseURL!))
    reference = await styles(page.locator('[data-timeline-part-id="answer-0-text"] [data-component="markdown"]'))
  } finally {
    await page.close()
  }
})

async function prepare(page: Page, team: (typeof teams)[number], conversation = false) {
  await setupHomePage(page, { models: true })
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  const directory = "runs/markdown-style"
  const root: Session = {
    id: "ses_markdown_root",
    slug: "markdown-root",
    projectID: fixture.project.id,
    directory: homeDirectory,
    title: "专家正文样式验收",
    agent: team.lead,
    version: "test",
    time: { created: 1000, updated: 3000 },
    metadata: { cmccArtifactDirectory: `${homeDirectory}/${directory}` },
  }
  const child = { ...root, id: "ses_markdown_child", slug: "markdown-child", parentID: root.id, agent: team.member }
  const filename =
    team.id === "mstock"
      ? "20-comparison-report.md"
      : team.id === "deeptrading"
        ? "30-final-report.md"
        : team.id === "deepgeo"
          ? "report.md"
          : team.id === "ai-for-science-team"
            ? "writing/paper.md"
            : "20-report.md"
  const messages = (session: Session): { info: Message; parts: Part[] }[] => {
    const user: Message = {
      id: `${session.id}-u`,
      sessionID: session.id,
      role: "user",
      agent: session.agent!,
      time: { created: 1000 },
      model: { providerID: "test", modelID: "markdown-model" },
    }
    const answer: Message = {
      id: `${session.id}-a`,
      parentID: user.id,
      sessionID: session.id,
      role: "assistant",
      agent: session.agent!,
      mode: "build",
      time: { created: 1500, completed: 3000 },
      providerID: "test",
      modelID: "markdown-model",
      path: { cwd: homeDirectory, root: homeDirectory },
      cost: 0,
      tokens: { input: 10, output: 20, reasoning: 0, cache: { read: 0, write: 0 } },
      finish: "stop",
    }
    const items: { info: Message; parts: Part[] }[] = [
      {
        info: user,
        parts: [
          { id: `${user.id}-text`, sessionID: session.id, messageID: user.id, type: "text", text: "请核对正文样式" },
        ],
      },
      {
        info: answer,
        parts: [
          { id: `${answer.id}-text`, sessionID: session.id, messageID: answer.id, type: "text", text: markdown },
          ...(session.id === root.id
            ? [
                {
                  id: "write-report",
                  sessionID: session.id,
                  messageID: answer.id,
                  type: "tool" as const,
                  tool: "write",
                  callID: "write-report",
                  state: {
                    status: "completed" as const,
                    input: { filePath: `${homeDirectory}/${directory}/${filename}`, content: markdown },
                    title: filename,
                    output: "ok",
                    metadata: {},
                    time: { start: 2000, end: 2500 },
                  },
                },
              ]
            : []),
        ],
      },
    ]
    if (!conversation) return items
    const add = (id: string, text: string, created: number, parentID = user.id, modelID = "markdown-model") => {
      const info = { ...answer, id, parentID, modelID, time: { created, completed: created + 100 } }
      items.push({ info, parts: [{ id: `${id}-text`, sessionID: session.id, messageID: id, type: "text", text }] })
    }
    add(`${session.id}-a2`, "第二段独立分析。", 3100, user.id, "second-model")
    add(`${session.id}-a3`, "第三段分析结论。", 3300)
    if (session.id === root.id) {
      const followup = { ...user, id: `${session.id}-u2`, time: { created: 3500 } }
      items.push({
        info: followup,
        parts: [
          {
            id: `${followup.id}-text`,
            sessionID: session.id,
            messageID: followup.id,
            type: "text",
            text: "请继续核对第二轮。",
          },
        ],
      })
      add(`${session.id}-a4`, "只属于第二轮的回复。", 3600, followup.id)
    }
    return items
  }
  const transcripts = new Map([root, child].map((session) => [session.id, messages(session)]))
  const events: unknown[] = []
  await mockOpenCodeServer(page, {
    ...fixture,
    directory: homeDirectory,
    project: { ...fixture.project, worktree: homeDirectory },
    sessions: [root, child],
    pageMessages: (id) => ({ items: transcripts.get(id) ?? [] }),
    events: () => events.splice(0),
    eventRetry: 50,
  })
  await page.route("**/session/*/children*", (route) =>
    route.fulfill({ json: new URL(route.request().url()).pathname.includes(root.id) ? [child] : [] }),
  )
  await page.route("**/api/dockapi/sessions", (route) =>
    route.fulfill({
      json: {
        code: 200,
        data: [
          {
            id: "business-markdown",
            agentType: team.id,
            query: root.title,
            title: root.title,
            openCodeSessionId: root.id,
            directoryPath: homeDirectory,
            openCodeSession: root,
            openCodeStatus: { type: "idle" },
          },
        ],
      },
    }),
  )
  await page.route("**/file?*", (route) =>
    route.fulfill({
      json: [
        {
          name: filename.split("/").at(-1),
          path: `${directory}/${filename}`,
          absolute: `${homeDirectory}/${directory}/${filename}`,
          type: "file",
          ignored: false,
        },
      ],
    }),
  )
  await page.route("**/file/content?*", (route) => route.fulfill({ json: { type: "text", content: markdown } }))
  await page.route("**/file/download?*", (route) =>
    route.fulfill({ contentType: "text/markdown; charset=utf-8", body: markdown }),
  )
  return { root, child, errors, transcripts, events }
}

async function narrow(page: Page, width: number) {
  if (width >= 760) return
  await page.getByRole("button", { name: "隐藏左栏", exact: true }).click()
  await expect
    .poll(() =>
      page.locator('aside[aria-label="CMCC conversations"]').evaluate((node) => node.getBoundingClientRect().width),
    )
    .toBeLessThanOrEqual(1)
}

async function clipboardText(page: Page) {
  return page.evaluate(async () => (await navigator.clipboard.readText()).replace(/\r\n/g, "\n"))
}

for (const width of [1440, 390]) {
  test(`file type icons do not read file bodies at ${width}`, async ({ page, baseURL }, info) => {
    const before = process.env.MARKDOWN_PHASE === "file-icons-list-before"
    await page.setViewportSize({ width, height: 1000 })
    const data = await prepare(page, teams[0])
    const directory = "runs/markdown-style"
    const files = {
      "附件.PDF": "pdf",
      "材料.docx": "word",
      "表格.csv": "sheet",
      "演示.pptx": "presentation",
      "笔记.md": "markdown",
      "说明.txt": "file",
      "页面.html": "html",
      "数据.json": "json",
      "图片.webp": "image",
      "打包.tar.gz": "archive",
      "未识别.bin": "file",
      说明文件: "file",
    }
    const names = Object.keys(files)
    const requests: string[] = []
    const iconRequests: string[] = []
    page.on("request", (request) => {
      const url = new URL(request.url())
      if (/\/file\/(content|preview|download)$/.test(url.pathname)) {
        const filename = url.searchParams.get("path")?.split("/").at(-1)
        if (filename && names.includes(filename)) requests.push(url.pathname)
      }
      if (/\/artifact-file-icons-[^/]+\.svg$/.test(url.pathname)) iconRequests.push(url.pathname)
    })
    const report = "20-report.md"
    await page.route("**/file?*", (route) =>
      route.fulfill({
        json: new URL(route.request().url()).searchParams.get("path") === directory
          ? [report, ...names].map(name => ({
              name,
              path: `${directory}/${name}`,
              absolute: `${homeDirectory}/${directory}/${name}`,
              type: "file",
              ignored: false,
            }))
          : [],
      }),
    )
    await page.goto(`/server/${base64Encode(baseURL!)}/session/${data.root.id}`)
    await narrow(page, width)
    if (width < 768) await page.getByRole("tab", { name: "分析结果", exact: true }).click()
    expect(iconRequests).toEqual([])
    await page.getByRole("button", { name: "文件", exact: true }).click()
    const results = page.locator(".workbench-results")
    await expect(results.locator("article")).toHaveCount(names.length + 1)
    for (const [name, kind] of Object.entries(files)) {
      const row = results.locator("article").filter({ has: page.getByText(name, { exact: true }) })
      await expect(row).toBeAttached()
      if (before) continue
      const icon = row.locator(`[data-artifact-file-icon="${kind}"]`)
      await expect(icon).toHaveAttribute("aria-hidden", "true")
      await expect.poll(() => icon.locator("use").evaluate((use: SVGUseElement) => use.getBBox().width)).toBeGreaterThan(0)
    }
    await expect(results.locator("article").first()).toBeVisible()
    await results.screenshot({ path: info.outputPath("file-list.png") })
    expect(requests).toEqual([])
    expect(iconRequests).toHaveLength(before ? 0 : 1)
    console.log(`FILE_ICON_REQUESTS ${JSON.stringify({ width, fileCount: names.length + 1, fileBodies: requests.length, iconRequests: iconRequests.length })}`)
    const file = results.getByRole("button", { name: /^说明\.txt/ })
    await file.click()
    await expect(results.getByRole("button", { name: "返回", exact: true })).toBeVisible()
    expect(requests).toEqual(["/file/content"])
    expect(data.errors).toEqual([])
  })
}

async function expectCardGeometryUnchanged(page: Page) {
  const result = await page.evaluate(() => {
    const sheet = [...document.styleSheets].find((sheet) =>
      [...sheet.cssRules].some(
        (rule) => rule instanceof CSSStyleRule && rule.selectorText.includes("[data-workbench-stats]"),
      ),
    )
    if (!sheet) throw new Error("Missing workbench card stylesheet")
    const decorations = [...sheet.cssRules]
      .filter((rule): rule is CSSStyleRule => rule instanceof CSSStyleRule && rule.selectorText.startsWith("[") && rule.selectorText.includes("workbench") && !!rule.style.borderRadius)
      .map(rule => ({ rule, selector: rule.selectorText }))
    const elements = [
      ...document.querySelectorAll(
        '[data-component="workbench-response-card"], [data-workbench-stats] > div, [data-workbench-team-panel], [data-workbench-agent-strip], section[aria-label$="DAG"] button',
      ),
    ]
    const measure = () =>
      elements.map((element) => {
        const bounds = element.getBoundingClientRect()
        return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }
      })
    const rounded = measure()
    try {
      for (const { rule } of decorations) rule.selectorText = ":not(*)"
      return { rounded, original: measure() }
    } finally {
      for (const { rule, selector } of decorations) rule.selectorText = selector
    }
  })
  expect(result.rounded).toEqual(result.original)
}

for (const id of ["deepinsight", "deeptrading", "deepinspect", "zhengqi-visit-intel", "mstock"] as const) {
  const team = teams.find((team) => team.id === id)!
  const members = cmccExpertMembers(id).filter((member) => member.role !== "lead")
  const label = {
    deepinsight: "DeepInsight DAG",
    deeptrading: "DeepTrading DAG",
    deepinspect: "DeepInspect DAG",
    "zhengqi-visit-intel": "政企分析 DAG",
    mstock: "多股对比 DAG",
  }[id]
  for (const member of members.filter((member) => ["阿染", "阿墨"].includes(member.name)))
    for (const width of [1440, 390])
      test(`${id} delivery member ${member.name} has an avatar and selectable conversation at ${width}`, async ({
        page,
        baseURL,
      }, info) => {
        await page.setViewportSize({ width, height: 1000 })
        const data = await prepare(page, { ...team, member: member.id })
        await page.goto(`/server/${base64Encode(baseURL!)}/session/${data.root.id}`)
        await narrow(page, width)
        await expect(page.locator('[data-component="workbench-expert-header"] img')).toHaveCount(1)
        if (width < 760) await page.getByRole("tab", { name: "分析结果", exact: true }).click()
        const dag = page.getByRole("region", { name: label, exact: true })
        await expect(dag).toBeVisible()
        if (id !== "deepinsight") await expect(page.getByText(`${members.length} 位`, { exact: true })).toBeVisible()
        await expect(dag.getByRole("button")).toHaveCount(members.length)
        await expect(dag.getByText("阿稿", { exact: true })).toHaveCount(0)
        await expect(dag.locator("img")).toHaveCount(members.length)
        await expect
          .poll(() =>
            dag
              .locator("img")
              .evaluateAll((images) => images.every((image) => image.complete && image.naturalWidth > 0)),
          )
          .toBe(true)
        for (const expected of members)
          await expect(
            dag.getByRole("button", { name: new RegExp(`${expected.profession}.*${expected.name}`) }),
          ).toHaveCount(1)
        const bounds = await dag.getByRole("button").evaluateAll((buttons) =>
          buttons.map((button) => {
            const rect = button.getBoundingClientRect()
            return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }
          }),
        )
        for (let index = 0; index < bounds.length; index++)
          for (const other of bounds.slice(index + 1)) {
            const current = bounds[index]
            expect(
              current.right <= other.left ||
                other.right <= current.left ||
                current.bottom <= other.top ||
                other.bottom <= current.top,
            ).toBe(true)
          }
        const delivery = dag.getByRole("button", { name: new RegExp(`${member.profession}.*${member.name}`) })
        await expect(delivery).toHaveAttribute("data-status", "completed")
        await delivery.click()
        await expect(delivery).toHaveAttribute("data-selected", "")
        await page.screenshot({ path: info.outputPath("delivery-team.png") })
        if (width < 760) await page.getByRole("tab", { name: "分析内容", exact: true }).press("Enter")
        const response = page
          .locator('[data-component="workbench-response"]')
          .filter({ has: page.locator(`[data-workbench-message="${data.child.id}-a"]`) })
        await expect(response).toBeVisible()
        await expect(response.locator('[data-component="workbench-expert-header"]')).toContainText(member.name)
        await expect(response.locator('[data-component="workbench-expert-header"] img')).toHaveCount(1)
        await expect(response.getByRole("button", { name: "复制全部回复", exact: true })).toBeVisible()
        await page.reload()
        await expect(page.locator('[data-component="session-composer"]')).toBeVisible()
        if (width < 760) await page.getByRole("tab", { name: "分析结果", exact: true }).click()
        await expect(dag.getByRole("button")).toHaveCount(members.length)
        expect(data.errors).toEqual([])
      })
}

for (const team of teams) {
  for (const width of team.id === "deepinspect" ? [1440, 390] : [1440]) {
    test(`${team.id} discovers script reports at completion and after refresh at ${width}`, async ({
      page,
      baseURL,
    }, info) => {
      await page.setViewportSize({ width, height: 1000 })
      const data = await prepare(page, team)
      const root = "runs/markdown-style"
      const directory = `${root}/tmp/report-output`
      const write = data.transcripts.get(data.root.id)![1].parts.find((part) => part.type === "tool")!
      if (write.type !== "tool" || write.state.status !== "completed") throw new Error("Missing report write fixture")
      const textPath = `${directory}/${String(write.state.input.filePath).split("/").at(-1)}`
      write.state.input.filePath = `${homeDirectory}/${textPath}`
      const htmlPath = `${directory}/30-report.html`
      const pdfPath = `${directory}/35-report.pdf`
      const uploadPath = `${root}/attachments/upload-12345678-1234-1234-1234-123456789abc/uploaded.html`
      const supplemented = ["deepinspect", "deeptrading", "zhengqi-visit-intel", "shoppers-pro"].includes(team.id)
      const sourcePaths = supplemented
        ? [`${root}/inputs/history/old/source.pdf`, `${directory}/assets/example.html`]
        : []
      const pdf = (await previewFiles())["report.pdf"].bytes
      const listed: string[] = []
      const previews: string[] = []
      let completed = false
      await page.route("**/session/status*", (route) =>
        route.fulfill({ json: { [data.root.id]: { type: completed ? "idle" : "busy" } } }),
      )
      await page.route("**/file?*", (route) => {
        const path = new URL(route.request().url()).searchParams.get("path") ?? ""
        listed.push(path)
        const prefix = `${path}/`
        const paths = [textPath, uploadPath, ...sourcePaths, ...(completed ? [htmlPath, pdfPath] : [])]
        const nodes = new Map(
          paths
            .filter((file) => file.startsWith(prefix))
            .map((file) => {
              const name = file.slice(prefix.length).split("/")[0]
              const child = `${prefix}${name}`
              return [
                child,
                {
                  path: child,
                  name,
                  absolute: `${homeDirectory}/${child}`,
                  type: child === file ? "file" : "directory",
                  ignored: false,
                },
              ]
            }),
        )
        return route.fulfill({ json: [...nodes.values()] })
      })
      await page.route("**/file/preview?*", (route) => {
        const path = new URL(route.request().url()).searchParams.get("path") ?? ""
        previews.push(path)
        if (path === pdfPath) return route.fulfill({ contentType: "application/pdf", body: pdf })
        if (path !== htmlPath) return route.fulfill({ status: 404, body: "Unexpected report path" })
        return route.fulfill({
          contentType: "text/html; charset=utf-8",
          body: '<!doctype html><html lang="zh"><meta charset="utf-8"><h1>脚本生成的可视化报告</h1><p>报告目录扫描验收</p></html>',
        })
      })
      await page.route("**/file/download?*", (route) => {
        const path = new URL(route.request().url()).searchParams.get("path") ?? ""
        previews.push(path)
        return path === pdfPath
          ? route.fulfill({ contentType: "application/pdf", body: pdf })
          : route.fulfill({ status: 404, body: "Unexpected report path" })
      })
      await page.goto(`/server/${base64Encode(baseURL!)}/session/${data.root.id}`)
      await narrow(page, width)
      if (width < 760) await page.getByRole("tab", { name: "分析结果", exact: true }).click()
      await page.getByRole("button", { name: "可视化报告", exact: true }).click()
      await expect(page.getByText("可视化报告尚未生成", { exact: true })).toBeVisible()
      completed = true
      data.events.push({ type: "session.status", properties: { sessionID: data.root.id, status: { type: "idle" } } })
      await expect(page.getByRole("button", { name: "30-report.html", exact: true })).toHaveCount(1)
      await expect(page.frameLocator("iframe").getByRole("heading", { name: "脚本生成的可视化报告" })).toBeVisible()
      await expect(page.getByRole("button", { name: "35-report.pdf", exact: true })).toHaveCount(1)
      for (const name of ["uploaded.html", "source.pdf", "example.html"])
        await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0)
      await page.screenshot({ path: info.outputPath("scanned-html-report.png") })
      await page.getByRole("button", { name: "35-report.pdf", exact: true }).click()
      await expect(page.locator("[data-cmcc-pdf-preview]")).toHaveAttribute("data-ready", "true")
      await page.reload()
      if (width < 760) await page.getByRole("tab", { name: "分析结果", exact: true }).click()
      await page.getByRole("button", { name: "可视化报告", exact: true }).click()
      await expect(page.frameLocator("iframe").getByRole("heading", { name: "脚本生成的可视化报告" })).toBeVisible()
      expect(previews.every((path) => path === htmlPath || path === pdfPath)).toBe(true)
      expect(listed.every((path) => path === root || path.startsWith(`${root}/`))).toBe(true)
      expect(data.errors).toEqual([])
    })
  }
}

test("deepinspect restores a scanned JSON visual report without HTML or PDF", async ({ page, baseURL }) => {
  const team = teams.find((team) => team.id === "deepinspect")!
  const data = await prepare(page, team)
  const directory = "runs/markdown-style"
  const report = {
    layout_version: 2,
    title: "扫描发现的巡察报告",
    sections: [
      { id: "summary", heading: "问题摘要", blocks: [{ type: "markdown", content: "仅有 JSON 的可视化内容" }] },
    ],
  }
  await page.route("**/file?*", (route) =>
    route.fulfill({
      json: ["20-report.md", "25-visual-report.json"].map((name) => ({
        name,
        path: `${directory}/${name}`,
        absolute: `${homeDirectory}/${directory}/${name}`,
        type: "file",
        ignored: false,
      })),
    }),
  )
  await page.route("**/file/content?*", (route) =>
    route.fulfill({
      json: {
        type: "text",
        content: new URL(route.request().url()).searchParams.get("path")?.endsWith("25-visual-report.json")
          ? JSON.stringify(report)
          : markdown,
      },
    }),
  )
  await page.goto(`/server/${base64Encode(baseURL!)}/session/${data.root.id}`)
  await page.getByRole("button", { name: "可视化报告", exact: true }).click()
  await expect(page.getByText("仅有 JSON 的可视化内容", { exact: true })).toBeVisible()
  await expect(page.getByText("可视化报告尚未生成", { exact: true })).toHaveCount(0)
  expect(data.errors).toEqual([])
})

for (const team of teams) {
  for (const width of team.id === "deepinsight" ? [1440, 390] : [1440]) {
    test(`${team.id} renders isolated HTML headings, tables, formulas and charts without CDN at ${width}`, async ({
      page,
      baseURL,
    }, info) => {
      await page.setViewportSize({ width, height: 1000 })
      const data = await prepare(page, team)
      const html = await htmlReportFixture()
      const answer = data.transcripts.get(data.root.id)![1]
      const write = answer.parts.find((part) => part.type === "tool")!
      if (write.type !== "tool" || write.state.status !== "completed") throw new Error("Missing report write fixture")
      answer.parts.push({
        ...write,
        id: "write-html",
        callID: "write-html",
        state: {
          ...write.state,
          input: { filePath: `${homeDirectory}/runs/markdown-style/report.html`, content: html },
        },
      })
      const runtimeRequests: string[] = []
      const externalRequests: string[] = []
      const runtimeDiagnostics: string[] = []
      page.on("console", (message) => {
        if (message.type() === "error") runtimeDiagnostics.push(message.text())
      })
      page.on("requestfailed", (request) =>
        runtimeDiagnostics.push(`${request.url()}: ${request.failure()?.errorText}`),
      )
      page.on("response", (response) => {
        if (response.url().includes("/assets/report-runtime-"))
          runtimeDiagnostics.push(`${response.status()}: ${response.headers()["content-type"]}`)
      })
      page.on("request", (request) => {
        if (/\/assets\/report-runtime-/.test(request.url())) runtimeRequests.push(request.url())
        if (/cdn\.jsdelivr\.net|cdnjs|unpkg/.test(request.url())) externalRequests.push(request.url())
      })
      await serveReportRuntime(page)
      await page.route("**/file/preview?*", (route) => route.fulfill(htmlReportPreview(html, route.request().url())))
      await page.route("**/file/download?*", (route) =>
        route.fulfill({ contentType: "application/octet-stream", body: html }),
      )
      await page.goto(`/server/${base64Encode(baseURL!)}/session/${data.root.id}`)
      await narrow(page, width)
      if (width < 760) await page.getByRole("tab", { name: "分析结果", exact: true }).click()
      await expect(page.getByRole("button", { name: "可视化报告", exact: true })).toBeVisible()
      expect(runtimeRequests).toEqual([])
      await page.getByRole("button", { name: "可视化报告", exact: true }).click()
      const report = page.frameLocator("iframe")
      const heading = report.getByRole("heading", { name: /^1\.1 / }).first()
      await expect(heading)
        .toBeVisible()
        .catch(async (error) => {
          await info.attach("html-report-diagnostics", {
            body: JSON.stringify({ errors: data.errors, runtimeRequests, runtimeDiagnostics }),
            contentType: "application/json",
          })
          throw error
        })
      await expect.poll(() => report.locator(".katex").count()).toBeGreaterThan(1)
      await expect.poll(() => report.locator(".block-markdown table").count()).toBeGreaterThan(0)
      await expect(report.locator(".chart-canvas svg").first()).toBeVisible()
      await expect(page.locator("iframe")).toHaveAttribute("sandbox", "allow-scripts")
      expect(externalRequests).toEqual([])
      expect(runtimeRequests.length).toBeGreaterThan(0)
      if (!process.env.CMCC_HTML_REPORT_FIXTURE) {
        await expect(report.locator(".block-markdown pre code")).toContainText("$$not-a-formula$$")
        await expect(report.locator(".block-markdown pre .katex")).toHaveCount(0)
        await expect(report.locator(".block-markdown")).toContainText("Cost $100-$200")
      }
      await heading.scrollIntoViewIfNeeded()
      await page.screenshot({ path: info.outputPath("html-report-math.png") })
      await report.locator(".katex").first().scrollIntoViewIfNeeded()
      await expect(report.locator(".katex").first()).toBeVisible()
      await page.screenshot({ path: info.outputPath("html-report-formula.png") })
      const download = page.waitForEvent("download")
      await page.getByRole("button", { name: "下载", exact: true }).click()
      expect(await readFile((await (await download).path())!, "utf8")).toBe(html)
      expect(data.errors).toEqual([])
    })
  }

  test(`${team.id} separates text reports from HTML and PDF reports`, async ({ page, baseURL }, info) => {
    const data = await prepare(page, team)
    const answer = data.transcripts.get(data.root.id)![1]
    const write = answer.parts.find((part) => part.type === "tool")!
    if (write.type !== "tool" || write.state.status !== "completed") throw new Error("Missing report write fixture")
    const files: Record<string, { mime: string; bytes: Buffer }> = await previewFiles()
    files["report.pdf"].bytes = await readFile(new URL("./fixtures/preview-chinese-multipage.pdf", import.meta.url))
    files["report.html"] = { mime: "text/html", bytes: Buffer.from('<meta charset="utf-8"><h1>分类验收 HTML</h1>') }
    for (const name of ["report.pdf", "report.html", "report.docx"]) {
      answer.parts.push({
        ...write,
        id: `format-${name}`,
        callID: `format-${name}`,
        state: {
          ...write.state,
          input: { filePath: `${homeDirectory}/runs/markdown-style/${name}`, content: "" },
        },
      })
    }
    await page.route("**/file/content?*", (route) => {
      const path = new URL(route.request().url()).searchParams.get("path") ?? ""
      const file = files[path.split("/").at(-1) ?? ""]
      return route.fulfill({ json: file
        ? { type: "binary", content: file.bytes.toString("base64"), encoding: "base64", mimeType: file.mime }
        : { type: "text", content: markdown } })
    })
    await page.route("**/file/preview?*", (route) => {
      const file = files[new URL(route.request().url()).searchParams.get("path")?.split("/").at(-1) ?? ""]
      return route.fulfill({ contentType: file.mime, body: file.bytes })
    })
    await page.goto(`/server/${base64Encode(baseURL!)}/session/${data.root.id}`)
    await page.getByRole("button", { name: "文字报告", exact: true }).click()
    const buttons = page.locator("button[title]")
    await expect(buttons.filter({ hasText: /^report.docx$/ })).toHaveCount(1)
    await expect(buttons.filter({ hasText: /^report.pdf$|^report.html$/ })).toHaveCount(0)
    await page.getByRole("button", { name: "report.docx", exact: true }).click()
    await expect(page.locator('[data-cmcc-office-preview="docx"]')).toBeVisible()
    await page.getByRole("button", { name: "可视化报告", exact: true }).click()
    await expect(buttons.filter({ hasText: /\.md$|\.docx$/ })).toHaveCount(0)
    await page.getByRole("button", { name: "report.html", exact: true }).click()
    await expect(page.frameLocator("iframe").getByRole("heading", { name: "分类验收 HTML" })).toBeVisible()
    await page.getByRole("button", { name: "report.pdf", exact: true }).click()
    await expect(page.locator("[data-cmcc-pdf-preview]")).toHaveAttribute("data-ready", "true")
    await expect(page.locator("iframe")).toHaveCount(0)
    await page.screenshot({ path: info.outputPath("visual-report.png") })
    expect(data.errors).toEqual([])
  })
}

for (const width of [1440, 390]) {
  for (const team of teams) {
    test(`${team.id} rounded workbench surfaces preserve layout at ${width}`, async ({ page, baseURL }, info) => {
      await page.setViewportSize({ width, height: 1000 })
      const data = await prepare(page, team)
      const started = performance.now()
      await page.goto(`/server/${base64Encode(baseURL!)}/session/${data.root.id}`)
      await narrow(page, width)
      const response = page.locator('[data-component="workbench-response-card"]').first()
      const strip = page.locator("nav.deeptrading-scrollbar")
      await expect(response).toBeVisible()
      await expect(strip).toBeVisible()
      await expect(response.locator("[data-markdown-table]")).toHaveCount(2)
      await page.evaluate(() => document.fonts.ready)
      await page
        .locator(".cmcc-page-content")
        .evaluate((element) =>
          Promise.all(element.getAnimations().map((animation) => animation.finished.catch(() => undefined))),
        )
      await page
        .locator(".deeptrading-scrollbar")
        .filter({ has: response })
        .evaluate((element) => {
          element.scrollTop = 0
        })
      const metrics = (element: Element) => {
        const bounds = element.getBoundingClientRect()
        const css = getComputedStyle(element)
        return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, radius: css.borderRadius }
      }
      const conversation = { response: await response.evaluate(metrics), strip: await strip.evaluate(metrics) }
      const readyMs = performance.now() - started
      await expect(strip.locator("../..")).toHaveCSS("background-color", "rgb(252, 252, 253)")
      if (process.env.CMCC_CARD_BASELINE !== "1") {
        await expect(response).toHaveCSS("border-radius", "20px")
        await expect(strip).toHaveCSS("border-radius", "20px")
        await expect(strip.getByRole("button").first()).toHaveCSS("border-radius", "12px")
        await expectCardGeometryUnchanged(page)
      }
      await expect
        .poll(() =>
          strip.locator("img").evaluateAll((images) => images.every((image) => image.complete && image.naturalWidth > 0)),
        )
        .toBe(true)
      await page.screenshot({ path: info.outputPath("rounded-workbench.png") })
      if (width < 760) await page.getByRole("tab", { name: "分析结果", exact: true }).click()
      const stats = page.locator('section[aria-label$="统计"]')
      const panel = page.locator('section[aria-label$="统计"] + div')
      const dag = page.locator('section[aria-label$="DAG"]')
      const results = page.locator(".workbench-results")
      await expect(results).toHaveCSS("background-color", "rgb(252, 252, 253)")
      const body = results.locator(":scope > nav + div")
      await expect(body).toHaveCSS("padding-bottom", "0px")
      const area = (await results.boundingBox())!
      const teamArea = (await body.locator(":scope > div").first().boundingBox())!
      expect(teamArea.y + teamArea.height).toBeCloseTo(area.y + area.height, 0)
      await expect(stats.locator(":scope > div")).toHaveCount(4)
      await expect(dag).toBeVisible()
      await expect
        .poll(() =>
          dag.locator("img").evaluateAll((images) => images.every((image) => image.complete && image.naturalWidth > 0)),
        )
        .toBe(true)
      if (process.env.CMCC_CARD_BASELINE !== "1") {
        await expectTeamSurfaceColors(page)
        await expectTeamStatIcons(page)
        await expect(stats.locator(":scope > div").first()).toHaveCSS("border-radius", "16px")
        await expect(panel).toHaveCSS("border-radius", "20px")
        await expectCardGeometryUnchanged(page)
      }
      const result = {
        team: team.id,
        width,
        readyMs,
        ...conversation,
        stats: await stats.locator(":scope > div").evaluateAll((elements) =>
          elements.map((element) => {
            const bounds = element.getBoundingClientRect()
            return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }
          }),
        ),
        panel: await panel.evaluate(metrics),
        nodes: await dag.getByRole("button").evaluateAll((elements) =>
          elements.map((element) => {
            const bounds = element.getBoundingClientRect()
            return {
              x: bounds.x,
              y: bounds.y,
              width: bounds.width,
              height: bounds.height,
              radius: getComputedStyle(element).borderRadius,
            }
          }),
        ),
      }
      console.log(`CARD_METRICS ${JSON.stringify(result)}`)
      await info.attach("card-metrics", { body: JSON.stringify(result, null, 2), contentType: "application/json" })
      await page.screenshot({ path: info.outputPath("rounded-team.png") })
      await expectTeamPanelResize(page)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
      expect(data.errors).toEqual([])
    })

    test(`${team.id} Markdown in overview, expert and report at ${width}`, async ({ page, baseURL }, info) => {
      await page.setViewportSize({ width, height: 1000 })
      const data = await prepare(page, team)
      const started = performance.now()
      await page.goto(`/server/${base64Encode(baseURL!)}/session/${data.root.id}`)
      await narrow(page, width)
      await expect(page.locator('[data-component="session-composer"]')).toBeVisible()
      await expect(page.locator('[data-action="prompt-agent"]')).toHaveCount(0)
      await expect(page.getByRole("group", { name: "执行模式", exact: true })).toHaveCount(0)
      await expect(page.locator('[data-action="prompt-model"]')).toBeVisible()
      const root = page.locator(`[data-workbench-message="${data.root.id}-a"]`)
      const content = root.locator('[data-component="markdown"]')
      const rootStyles = await styles(content)
      await info.attach("render-metrics", {
        body: JSON.stringify({ readyMs: performance.now() - started, styles: rootStyles }),
        contentType: "application/json",
      })
      if (!baseline) expect(rootStyles).toEqual(reference)
      const response = page.locator('[data-component="workbench-response"]').filter({ has: root })
      await expect(page.locator('[data-component="workbench-expert-header"]')).toHaveCount(1)
      await expect(page.locator('[data-component="workbench-response-card"]')).toHaveCount(1)
      await expect(response.getByRole("button", { name: "复制全部回复", exact: true })).toHaveCount(1)
      await expect(response.locator("time")).toHaveAttribute("datetime", new Date(1500).toISOString())
      await expect(response).toContainText("markdown-model")
      const question = page.locator(`[data-workbench-message="${data.root.id}-u"]`)
      const header = response.locator('[data-component="workbench-expert-header"]')
      const questionBox = await question.boundingBox()
      const headerBox = await header.boundingBox()
      expect(questionBox!.y + questionBox!.height).toBeLessThanOrEqual(headerBox!.y)
      expect(
        await question.evaluate(
          (node, next) => !!(node.compareDocumentPosition(next!) & Node.DOCUMENT_POSITION_FOLLOWING),
          await header.elementHandle(),
        ),
      ).toBe(true)
      const wide = content.locator("[data-markdown-table]").last()
      if (!baseline) {
        const headingX = await content.locator("h2").evaluate((node) => node.getBoundingClientRect().x)
        const bounds = await wide.evaluate((node) => ({ client: node.clientWidth, scroll: node.scrollWidth }))
        expect(bounds.scroll).toBeGreaterThan(bounds.client)
        await wide.evaluate((node) => {
          node.scrollLeft = 100
        })
        expect(await wide.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0)
        expect(await content.locator("h2").evaluate((node) => node.getBoundingClientRect().x)).toBe(headingX)
        await wide.evaluate((node) => {
          node.scrollLeft = 0
        })
      }
      await page.screenshot({ path: info.outputPath("overview.png") })
      const expert = page
        .locator("nav button")
        .filter({ has: page.locator('[data-status="completed"]') })
        .last()
      await expert.click()
      const child = page.locator(`[data-workbench-message="${data.child.id}-a"] [data-component="markdown"]`)
      if (!baseline) expect(await styles(child)).toEqual(reference)
      await expect(page.locator('[data-component="workbench-expert-header"]')).toHaveCount(1)
      await expect(page.locator('[data-component="workbench-response-card"]')).toHaveCount(1)
      await expect(page.locator('[data-component="expert-duration"]')).toBeVisible()
      await page.screenshot({ path: info.outputPath("expert.png") })
      if (width < 760) await page.getByRole("tab", { name: "分析结果", exact: true }).click()
      await page.getByRole("button", { name: "文字报告", exact: true }).click()
      const report = page
        .locator('[data-component="markdown"]')
        .filter({ has: page.locator("h1") })
        .last()
      if (!baseline) expect(await styles(report)).toEqual(reference)
      await expect(page.getByRole("button", { name: "下载", exact: true })).toBeVisible()
      await page.screenshot({ path: info.outputPath("report.png") })
      expect(data.errors).toEqual([])
    })
  }
  test(`groups complete replies and copies only the selected expert at ${width}`, async ({
    page,
    context,
    baseURL,
  }, info) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"])
    await page.setViewportSize({ width, height: 1000 })
    const data = await prepare(page, teams[1], true)
    await page.goto(`/server/${base64Encode(baseURL!)}/session/${data.root.id}`)
    await narrow(page, width)
    const turns = page.locator("[data-workbench-turn]")
    await expect(turns).toHaveCount(2)
    const first = turns.first()
    const second = turns.last()
    await expect(first.locator('[data-role="assistant"]')).toHaveCount(3)
    await expect(first.locator('[data-component="workbench-response-card"]')).toHaveCount(1)
    await expect(first.locator('[data-component="workbench-response-card"] [data-role="assistant"]')).toHaveCount(3)
    await expect(first.locator('[data-role="assistant"] footer')).toHaveCount(0)
    const footer = first.locator('[data-component="workbench-response"] footer')
    await expect(footer).toHaveCount(1)
    await expect(footer.locator("time")).toHaveCount(1)
    await expect(footer.locator("span", { hasText: /^markdown-model$/ })).toHaveCount(1)
    await expect(footer.locator("span", { hasText: /^second-model$/ })).toHaveCount(1)
    await first.getByText("第三段分析结论。", { exact: true }).hover()
    await footer.getByRole("button", { name: "复制全部回复", exact: true }).click()
    expect(await clipboardText(page)).toBe(`${markdown}\n\n第二段独立分析。\n\n第三段分析结论。`)
    await footer.evaluate((node) => node.scrollIntoView({ block: "center" }))
    await page.screenshot({ path: info.outputPath("overview-footer.png") })
    await second.getByText("只属于第二轮的回复。", { exact: true }).hover()
    await second.getByRole("button", { name: "复制全部回复", exact: true }).click()
    expect(await clipboardText(page)).toBe("只属于第二轮的回复。")
    const firstHeader = first.locator('[data-component="workbench-expert-header"]')
    await firstHeader.scrollIntoViewIfNeeded()
    await page.screenshot({ path: info.outputPath("overview-group.png") })
    const avatarSize = await firstHeader
      .locator("img")
      .evaluate((node) => ({ width: node.clientWidth, height: node.clientHeight }))
    const teamNav = page.getByRole("navigation", { name: "DeepTrading 分析团队", exact: true })
    const selectExpert = () =>
      teamNav
        .locator("button")
        .filter({ has: page.locator('[data-status="completed"]') })
        .last()
        .click()
    await selectExpert()
    const expert = page.locator('[data-component="workbench-response"]')
    await expect(expert).toHaveCount(1)
    await expect(expert.locator('[data-role="assistant"]')).toHaveCount(3)
    await expect(expert.locator('[data-component="workbench-response-card"]')).toHaveCount(1)
    await expect(expert.locator('[data-component="workbench-response-card"] [data-role="assistant"]')).toHaveCount(3)
    expect(
      await expert.locator("header img").evaluate((node) => ({ width: node.clientWidth, height: node.clientHeight })),
    ).toEqual(avatarSize)
    await expert.getByText("第三段分析结论。", { exact: true }).hover()
    await expert.getByRole("button", { name: "复制全部回复", exact: true }).click()
    expect(await clipboardText(page)).toBe(`${markdown}\n\n第二段独立分析。\n\n第三段分析结论。`)
    await expect(expert.getByRole("button", { name: "已复制", exact: true })).toBeVisible()
    await expect(page.locator('[data-component="expert-duration"]')).toBeVisible()
    await page.screenshot({ path: info.outputPath("expert-footer.png") })
    await expert.locator("header").scrollIntoViewIfNeeded()
    await page.screenshot({ path: info.outputPath("expert-group.png") })
    await teamNav.getByRole("button").first().click()
    await expect(turns).toHaveCount(2)
    await expect(turns.getByRole("button", { name: "已复制", exact: true })).toHaveCount(0)
    expect(data.errors).toEqual([])
  })
  test(`native sub-agent Markdown at ${width}`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width, height: 1000 })
    const data = await setupGeneralChat(page, {
      parentID: "ses_parent",
      agent: "deepinspect/material-researcher",
      turns: 1,
    })
    await page.goto(data.href(baseURL!))
    await narrow(page, width)
    const content = page.locator('[data-timeline-part-id="answer-0-text"] [data-component="markdown"]')
    if (!baseline) expect(await styles(content)).toEqual(reference)
    await expect(page.locator('[data-cmcc-general-chat="true"]')).toHaveCount(0)
    expect(data.errors).toEqual([])
  })
}

for (const touch of [false, true]) {
  test.describe(`feedback actions with ${touch ? "touch" : "mouse"}`, () => {
    test.use({ hasTouch: touch, viewport: { width: touch ? 390 : 1440, height: 1000 } })
    test("reveal one reply footer and independently toggle its vote", async ({ page, baseURL }, info) => {
      const data = await prepare(page, teams[1], true)
      await page.goto(`/server/${base64Encode(baseURL!)}/session/${data.root.id}`)
      await narrow(page, touch ? 390 : 1440)
      const turns = page.locator("[data-workbench-turn]")
      await expect(turns).toHaveCount(2)
      const reply = turns.last().locator('[data-component="workbench-response"] .workbench-message-group')
      const card = reply.locator('[data-component="workbench-response-card"]')
      const footer = reply.locator("footer")
      const up = footer.getByRole("button", { name: "点赞", exact: true })
      const down = footer.getByRole("button", { name: "点踩", exact: true })
      const copy = footer.getByRole("button", { name: "复制全部回复" })
      const question = turns.last().locator('[data-role="user"]')
      const bubble = question.locator('[data-component="workbench-query-bubble"]')
      const user = question.locator("footer")
      await expect(user.getByRole("button")).toHaveCount(1)
      const copyQuestion = user.getByRole("button", { name: "复制消息" })
      await expect(copyQuestion).toHaveAttribute("data-variant", "ghost")
      await expect(user.locator("time")).toHaveCount(1)
      await expect(user).not.toContainText("markdown-model")
      await page.mouse.move(0, 0)
      await expect(user).toHaveCSS("opacity", "0")
      if (touch) await bubble.tap()
      else await bubble.hover()
      await expect(user).toHaveCSS("opacity", "1")
      await expect(copyQuestion).toHaveCSS("box-shadow", "none")
      await question.screenshot({ path: info.outputPath("question-footer.png") })
      if (touch) await copyQuestion.tap()
      else await copyQuestion.click()
      await expect(user.getByRole("button", { name: "已复制" })).toBeVisible()
      await card.scrollIntoViewIfNeeded()
      await page.mouse.move(0, 0)
      await expect(footer).toHaveCSS("opacity", "0")
      const height = await reply.evaluate(el => el.offsetHeight)
      if (touch) await card.tap()
      else await card.hover()
      await expect(footer).toHaveCSS("opacity", "1")
      await expect(user).toHaveCSS("opacity", "0")
      await expect(copy).toHaveCSS("box-shadow", "none")
      expect(await footer.getByRole("button").evaluateAll(buttons => buttons.map(button => button.getAttribute("aria-label"))))
        .toEqual(["点赞", "点踩", "复制全部回复"])
      const press = (button: Locator) => touch ? button.tap() : button.click()
      await press(up)
      await expect(up).toHaveAttribute("aria-pressed", "true")
      await expect(up.locator("svg")).toHaveCSS("fill", "rgb(85, 94, 107)")
      await expect(turns.first().getByRole("button", { name: "点赞", exact: true })).toHaveAttribute("aria-pressed", "false")
      await page.screenshot({ path: info.outputPath("feedback.png") })
      await press(down)
      await expect(up).toHaveAttribute("aria-pressed", "false")
      await expect(down).toHaveAttribute("aria-pressed", "true")
      await press(down)
      await expect(down).toHaveAttribute("aria-pressed", "false")
      if (touch) await bubble.tap()
      else await page.mouse.move(0, 0)
      await expect(footer).toHaveCSS("opacity", "0")
      expect(await reply.evaluate(el => el.offsetHeight)).toBe(height)
      if (!touch) {
        await card.focus()
        await page.keyboard.press("Tab")
        await expect(footer).toHaveCSS("opacity", "1")
        await expect(up).toBeFocused()
        await page.keyboard.press("Space")
        await expect(up).toHaveAttribute("aria-pressed", "true")
      }
      expect(data.errors).toEqual([])
    })
  })
}

for (const team of teams) {
  test(`${team.id} streamed expert replies keep a single current copy footer`, async ({ page, context, baseURL }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"])
    const data = await prepare(page, team, true)
    const message = data.transcripts.get(data.root.id)!.at(-1)!
    if (message.info.role !== "assistant") throw new Error("Missing assistant test message")
    message.info.time.completed = undefined
    message.info.finish = undefined
    const part = message.parts[0]
    if (part.type !== "text") throw new Error("Missing text test part")
    let running = true
    await page.route("**/session/status*", (route) =>
      route.fulfill({ json: running ? { [data.root.id]: { type: "busy" } } : {} }),
    )
    await page.goto(`/server/${base64Encode(baseURL!)}/session/${data.root.id}`)
    const response = page.locator("[data-workbench-turn]").last().locator('[data-component="workbench-response"]')
    await expect(response.getByText("分析中", { exact: true })).toBeVisible()
    await expect(page.locator("[data-workbench-turn]")).toHaveCount(2)
    await expect(page.locator('[data-component="workbench-response-card"]')).toHaveCount(2)
    await expect(page.locator('[data-component="workbench-expert-header"]')).toHaveCount(2)
    const copy = response.getByRole("button", { name: "复制全部回复", exact: true })
    await expect(copy).toHaveCount(1)
    part.text += "\n\n后续流式补充结论。"
    data.events.push({ type: "message.part.updated", properties: { part } })
    await expect(response).toContainText("后续流式补充结论。")
    await expect(response.locator('[data-component="workbench-response-card"]')).toHaveCount(1)
    await expect(response.locator('[data-component="workbench-expert-header"]')).toHaveCount(1)
    message.info.time.completed = 4000
    message.info.finish = "stop"
    running = false
    data.events.push(
      { type: "message.updated", properties: { info: message.info } },
      { type: "session.status", properties: { sessionID: data.root.id, status: { type: "idle" } } },
    )
    await expect(response.getByText("已完成", { exact: true })).toBeVisible()
    await expect(response.locator("footer")).toHaveCount(1)
    await response.getByText("后续流式补充结论。", { exact: true }).hover()
    await copy.click()
    expect(await clipboardText(page)).toBe(part.text)
    expect(data.errors).toEqual([])
  })
}

for (const team of teams) {
  for (const width of team.id === "deeptrading" ? [1440, 390] : [1440]) {
    test(`${team.id} accumulates active rounds without overnight idle time at ${width}`, async ({
      page,
      baseURL,
    }, info) => {
      const day = 86_400_000
      const today = Date.parse("2026-10-20T09:00:00+08:00")
      const yesterday = today - day
      const next = today + day
      await page.clock.setFixedTime(new Date(next + 10_000))
      await page.setViewportSize({ width, height: 1000 })
      const data = await prepare(page, team)
      for (const [id, entries] of data.transcripts) {
        const root = id === data.root.id
        entries[0].info.time = { created: yesterday + (root ? 0 : 120_000) }
        entries[1].info.time = {
          created: yesterday + (root ? 60_000 : 180_000),
          completed: yesterday + (root ? 600_000 : 540_000),
        }
        for (const part of entries[1].parts) {
          if (part.type === "tool" && part.state.status === "completed")
            part.state.time = { start: yesterday + 120_000, end: yesterday + 180_000 }
        }
      }
      const history = data.transcripts.get(data.root.id)!
      const originalUser = history[0].info
      const originalReply = history[1].info
      if (originalUser.role !== "user" || originalReply.role !== "assistant") throw new Error("Missing elapsed fixture")
      const question = (id: string, created: number) => ({
        info: { ...originalUser, id, time: { created } },
        parts: [
          { id: `${id}-text`, messageID: id, sessionID: data.root.id, type: "text" as const, text: "补充研究问题" },
        ],
      })
      const answer = (id: string, parentID: string, created: number, completed?: number) => ({
        info: {
          ...originalReply,
          id,
          parentID,
          time: { created, completed },
          finish: completed === undefined ? undefined : "stop",
        },
        parts: [
          { id: `${id}-text`, messageID: id, sessionID: data.root.id, type: "text" as const, text: "补充分析结论" },
        ],
      })
      history.push(
        question(`${data.root.id}-u2`, today),
        answer(`${data.root.id}-a2`, `${data.root.id}-u2`, today + 100, today + 60_000),
      )
      let running = false
      await page.route("**/session/status*", (route) =>
        route.fulfill({ json: running ? { [data.root.id]: { type: "busy" } } : {} }),
      )
      await page.goto(`/server/${base64Encode(baseURL!)}/session/${data.root.id}`)
      await narrow(page, width)
      if (width < 760) await page.getByRole("tab", { name: "分析结果", exact: true }).click()
      const elapsed = page.getByText("思考时间", { exact: true }).locator("..").locator("strong")
      await expect(elapsed).toHaveText("11分0秒")
      const thirdQuestion = question(`${data.root.id}-u3`, next)
      const thirdAnswer = answer(`${data.root.id}-a3`, thirdQuestion.info.id, next + 100)
      history.push(thirdQuestion, thirdAnswer)
      running = true
      data.events.push(
        { type: "message.updated", properties: { info: thirdQuestion.info } },
        { type: "message.part.updated", properties: { part: thirdQuestion.parts[0] } },
        { type: "message.updated", properties: { info: thirdAnswer.info } },
        { type: "message.part.updated", properties: { part: thirdAnswer.parts[0] } },
        { type: "session.status", properties: { sessionID: data.root.id, status: { type: "busy" } } },
      )
      await expect(elapsed).toHaveText("11分10秒")
      await page.clock.setFixedTime(new Date(next + 30_000))
      await expect(elapsed).toHaveText("11分30秒")
      await page.clock.setFixedTime(new Date(next + 60_000))
      thirdAnswer.info.time.completed = next + 60_000
      thirdAnswer.info.finish = "stop"
      running = false
      data.events.push(
        { type: "message.updated", properties: { info: thirdAnswer.info } },
        { type: "session.status", properties: { sessionID: data.root.id, status: { type: "idle" } } },
      )
      await expect(elapsed).toHaveText("12分0秒")
      await page.clock.setFixedTime(new Date(next + day))
      await page.reload()
      if (width < 760) await page.getByRole("tab", { name: "分析结果", exact: true }).click()
      await expect(elapsed).toHaveText("12分0秒")
      await page.screenshot({ path: info.outputPath("elapsed-followup.png") })
      expect(data.errors).toEqual([])
    })
  }
}
