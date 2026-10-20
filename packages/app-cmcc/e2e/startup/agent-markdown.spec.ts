import { expect, test, type Locator, type Page } from "@playwright/test"
import type { Message, Part, Session } from "@opencode-ai/sdk/v2"
import { base64Encode } from "@opencode-ai/core/util/encode"
import { MSTOCK_LEAD_AGENT, MSTOCK_MEMBERS } from "../../src/pages/session/mstock/config"
import { setupGeneralChat } from "./general-chat.fixture"
import { setupHomePage, homeDirectory } from "./home-fixture"
import { fixture } from "../smoke/session-timeline.fixture"
import { mockOpenCodeServer } from "../utils/mock-server"

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
  for (const team of teams) {
    test(`${team.id} Markdown in overview, expert and report at ${width}`, async ({ page, baseURL }, info) => {
      await page.setViewportSize({ width, height: 1000 })
      const data = await prepare(page, team)
      const started = performance.now()
      await page.goto(`/server/${base64Encode(baseURL!)}/session/${data.root.id}`)
      await narrow(page, width)
      const root = page.locator(`[data-workbench-message="${data.root.id}-a"]`)
      const content = root.locator('[data-component="markdown"]')
      const rootStyles = await styles(content)
      await info.attach("render-metrics", {
        body: JSON.stringify({ readyMs: performance.now() - started, styles: rootStyles }),
        contentType: "application/json",
      })
      if (!baseline) expect(rootStyles).toEqual(reference)
      const response = page.locator('[data-component="workbench-response"]').filter({ has: root })
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
    await footer.getByRole("button", { name: "复制全部回复", exact: true }).click()
    expect(await clipboardText(page)).toBe(`${markdown}\n\n第二段独立分析。\n\n第三段分析结论。`)
    await footer.evaluate((node) => node.scrollIntoView({ block: "center" }))
    await page.screenshot({ path: info.outputPath("overview-footer.png") })
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

test("streamed expert replies keep a single current copy footer", async ({ page, context, baseURL }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"])
  const data = await prepare(page, teams[2], true)
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
  const copy = response.getByRole("button", { name: "复制全部回复", exact: true })
  await expect(copy).toHaveCount(1)
  part.text += "\n\n后续流式补充结论。"
  data.events.push({ type: "message.part.updated", properties: { part } })
  await expect(response).toContainText("后续流式补充结论。")
  message.info.time.completed = 4000
  message.info.finish = "stop"
  running = false
  data.events.push(
    { type: "message.updated", properties: { info: message.info } },
    { type: "session.status", properties: { sessionID: data.root.id, status: { type: "idle" } } },
  )
  await expect(response.getByText("已完成", { exact: true })).toBeVisible()
  await expect(response.locator("footer")).toHaveCount(1)
  await copy.click()
  expect(await clipboardText(page)).toBe(part.text)
  expect(data.errors).toEqual([])
})
