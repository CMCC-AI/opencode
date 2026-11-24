import { expect, test, type Page } from "@playwright/test"
import { homeDirectory, homeSession, setupHomePage } from "./home-fixture"
import { QUICK_PRESETS_BY_TEAM } from "../../src/utils/quick-presets"

test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, locale: "zh-CN" })

const finance = "deeptrading/deeptrading-quick"
const quickQA = "deeptrading/deeptrading-lite-quick"
const research = "deepinsight/deepinsight-team-lead"
const quickResearch = "deepinsight/deepinsight-quick"
const lens = "deeplens/deeplens-quick"

async function setup(page: Page, options: { skills?: boolean; vision?: boolean } = {}) {
  await setupHomePage(page, { models: true, teams: true, vision: options.vision })
  const now = Date.now()
  const sessions: (typeof homeSession & { metadata?: Record<string, string> })[] = [
    { ...homeSession, id: "ses_mobile_chat", title: "手机通用历史", agent: "build" },
    { ...homeSession, id: "ses_mobile_finance", title: "财经快速历史", agent: finance },
    { ...homeSession, id: "ses_mobile_expert", title: "不支持的财经专家团", agent: "deeptrading/deeptrading-team-lead" },
    { ...homeSession, id: "ses_mobile_research", title: "OpenCode 深度研究", agent: research },
  ].map((session, i) => ({ ...session, time: { created: now - 60_000, updated: now - i * 1000 } }))
  const graph = {
    id: "ses_mobile_research", sourceId: "ses_mobile_research", source: "langgraph", productType: "general-deepinsight",
    title: "LangGraph 深度研究", query: "只读历史", status: "interrupted",
    createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString(),
    elapsedSeconds: 15, tokenCount: null, sourcesCount: null, reportLength: null,
    capabilities: { open: true, rename: false, delete: true },
  }
  const removed = new Set<string>()
  const captured = {
    agents: [] as string[], researchWrites: [] as string[], strangers: [] as string[], uploads: [] as string[],
    promptRequests: [] as Array<{ system?: string; model: { modelID: string }; parts: Array<{ type: string; mime?: string; url?: string }> }>,
    queries: [] as Array<{ agentType: string; query: string }>,
    failDelete: false,
  }
  const events: object[] = []
  const messages = new Map<string, { info: object; parts: object[] }[]>()
  await page.route("**/event?*", (route) => route.fulfill({
    contentType: "text/event-stream",
    body: `retry: 100\n\n${events.splice(0).map((event) => `data: ${JSON.stringify(event)}\n\n`).join("")}`,
  }))
  await page.route("**/file/directory*", (route) => route.fulfill({ json: {} }))
  await page.route("**/file/upload*", (route) => {
    const { path } = route.request().postDataJSON()
    captured.uploads.push(path)
    return route.fulfill({ json: { path } })
  })
  await page.route("**/file?*", (route) => {
    const path = new URL(route.request().url()).searchParams.get("path")
    const files = captured.agents.at(-1) === quickResearch ? ["10-requirements.md", "50-report.md"] : ["finance-report.md"]
    return route.fulfill({ json: path?.startsWith("runs/") ? files.map((name) => ({
      path: `${path}/${name}`, name, type: "file", ignored: false,
    })) : [] })
  })
  await page.route("**/file/download?*", (route) => route.fulfill({ contentType: "text/markdown", body: "# 财经测试报告" }))
  const binding = (session: typeof sessions[number], includeInfo = false) => ({
    id: `business-${session.id}`, directoryPath: homeDirectory,
    agentType: session.agent.split("/")[1] ? session.agent.split("/")[0] : "deepinsight",
    query: session.title, title: session.title, openCodeSessionId: session.id,
    openCodeSession: includeInfo ? session : null, openCodeStatus: null,
    createdAt: new Date(session.time.created).toISOString(), updatedAt: new Date(session.time.updated).toISOString(),
  })
  await page.route(/\/session(\?|$)/, (route) => route.fulfill({ json: sessions.filter((session) => !removed.has(session.id)) }))
  await page.route("**/agent?*", (route) => route.fulfill({
    json: ["build", "plan", finance, quickQA, research, "shoppers-pro/shoppers-pro-quick", ...(options.skills ? [quickResearch, lens] : [])]
      .map((name) => ({ name, mode: "primary" })),
  }))
  await page.route("**/api/dockapi/sessions", async (route) => {
    if (route.request().method() !== "POST")
      return route.fulfill({ json: { code: 200, data: sessions.filter((session) => !removed.has(session.id)).map((session) => binding(session)) } })
    const body = route.request().postDataJSON()
    captured.queries.push(body)
    const session = {
      ...homeSession, id: "ses_mobile_created", agent: "", title: body.query, time: { created: now, updated: now },
      metadata: { cmccArtifactDirectory: body.artifactDirectory },
    }
    sessions.push(session)
    const row = { ...binding(session, true), agentType: body.agentType }
    return route.fulfill({ json: { code: 200, data: row } })
  })
  await page.route("**/api/dockapi/sessions/*", (route) => {
    const id = new URL(route.request().url()).pathname.split("/").at(-1)!.replace(/^business-/, "")
    if (route.request().method() === "DELETE") {
      if (captured.failDelete) return route.fulfill({ status: 500, json: { code: 500, message: "test error" } })
      removed.add(id)
    }
    return route.fulfill({ json: { code: 200, data: null } })
  })
  await page.route(/\/session\/ses_[^/?]+(?:\?|$)/, (route) => {
    const id = new URL(route.request().url()).pathname.split("/").at(-1)!
    const session = sessions.find((item) => item.id === id)
    if (!session) {
      captured.strangers.push(id)
      return route.fulfill({ status: 404, json: {} })
    }
    return route.fulfill({ json: session })
  })
  await page.route(/\/session\/ses_[^/]+\/message(?:\?|$)/, (route) => {
    const id = new URL(route.request().url()).pathname.split("/").at(-2)!
    return route.fulfill({ json: messages.get(id) ?? [] })
  })
  await page.route(/\/session\/ses_[^/]+\/prompt_async(?:\?|$)/, async (route) => {
    const body = route.request().postDataJSON()
    captured.agents.push(body.agent)
    captured.promptRequests.push(body)
    const id = new URL(route.request().url()).pathname.split("/").at(-2)!
    const session = sessions.find((item) => item.id === id)
    if (session) session.agent = body.agent
    await route.fulfill({ status: 204 })
    const user = {
      id: body.messageID, role: "user", sessionID: id, time: { created: Date.now() }, agent: body.agent, model: body.model,
    }
    const assistant = {
      id: `${user.id}_answer`, role: "assistant", parentID: user.id, sessionID: id,
      time: { created: Date.now(), completed: Date.now() }, agent: body.agent,
      modelID: body.model.modelID, providerID: body.model.providerID, finish: "stop",
    }
    const part = { id: `${assistant.id}_text`, type: "text", messageID: assistant.id, sessionID: id, text: "这是手机端流式回复测试。" }
    messages.set(id, [
      ...(messages.get(id) ?? []),
      { info: user, parts: body.parts.map((item: object) => ({ ...item, messageID: user.id, sessionID: id })) },
      { info: assistant, parts: [part] },
    ])
    events.push(
      { type: "message.updated", properties: { info: assistant } },
      { type: "message.part.updated", properties: { part } },
      { type: "session.status", properties: { sessionID: id, status: { type: "idle" } } },
    )
  })
  await page.route("**/api/dockapi/history?*", (route) => route.fulfill({ json: { code: 200, data: [graph] } }))
  await page.route("**/api/dockapi/general-deepinsight/**", (route) => {
    const method = route.request().method()
    if (method !== "GET") captured.researchWrites.push(new URL(route.request().url()).pathname)
    return route.fulfill({ json: { code: 200, data: {
      session: graph, conversationData: { steps: [], pendingInterrupt: { type: "plan_confirmation" } },
      reportContent: "# 已有研究材料", dataVersion: "test",
    } } })
  })
  return captured
}

const menu = (page: Page) => page.getByRole("button", { name: "打开导航" })

test("mobile design, supported assistants and mutually exclusive finance selections", async ({ page }, info) => {
  const calls = await setup(page)
  await page.goto("/mobile")
  const input = page.getByRole("textbox", { name: "请输入您想知道的内容" })
  await expect(input).toBeVisible()
  const model = page.getByRole("button", { name: "选择模型" })
  await expect(model).toBeEnabled()
  await model.click()
  await expect(page.getByRole("searchbox", { name: "搜索模型" })).toBeVisible()
  await page.getByRole("heading", { level: 1 }).click()
  await expect(page.getByRole("searchbox", { name: "搜索模型" })).toBeHidden()
  await expect(page.getByRole("button", { name: "执行", exact: true })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "计划", exact: true })).toHaveCount(0)
  await page.screenshot({ path: info.outputPath("mobile-new.png") })

  await page.getByRole("button", { name: "选择助手" }).click()
  await expect(page.getByRole("menuitem", { name: /深度洞察/ })).toHaveAttribute("aria-disabled", "true")
  await page.getByRole("menuitem", { name: "财经专家" }).click()
  const quick = page.getByRole("button", { name: "快速问答" })
  await expect(quick).toHaveAttribute("aria-pressed", "true")
  const category = page.getByRole("combobox", { name: "财经分析分类" })
  await category.selectOption(QUICK_PRESETS_BY_TEAM.deeptrading.groups.find((entry) => entry.label === "行业分析")!.id)
  await expect(quick).toHaveAttribute("aria-pressed", "false")
  await page.getByRole("button", { name: "行业趋势", exact: true }).click()
  await page.getByRole("button", { name: "板块分析", exact: true }).click()
  await expect(page.getByRole("group", { name: "财经分析小类" }).locator('[aria-pressed="true"]')).toHaveText("板块分析")
  await expect(input).toContainText("未来6个月")
  expect(calls.agents).toEqual([])
  await expect(page.getByRole("heading", { level: 1 })).toBeInViewport()
  await page.screenshot({ path: info.outputPath("mobile-finance.png") })
  await page.setViewportSize({ width: 320, height: 568 })
  expect(await page.locator(".di-mobile").evaluate((el) => el.scrollWidth)).toBeLessThanOrEqual(320)
  await page.setViewportSize({ width: 375, height: 812 })
  await input.fill("分析一次")
  await page.locator('input[type="file"][accept]').setInputFiles({
    name: "测试材料.txt", mimeType: "text/plain", buffer: Buffer.from("手机端附件"),
  })
  await expect.poll(() => calls.uploads.length).toBe(1)
  await page.getByRole("button", { name: "发送", exact: true }).click()
  await expect.poll(() => calls.agents).toEqual([finance])
  await expect(page).toHaveURL(/\/mobile\/history\/opencode\/ses_mobile_created$/)
  await expect(page.getByRole("button", { name: "选择助手" })).toHaveCount(0)
  await expect(page.getByText("这是手机端流式回复测试。")).toBeVisible()
  const downloadEvent = page.waitForEvent("download")
  await page.getByRole("button", { name: "finance-report.md" }).click()
  expect((await downloadEvent).suggestedFilename()).toBe("finance-report.md")
  await page.screenshot({ path: info.outputPath("mobile-conversation.png") })
  await expect(page.getByRole("textbox", { name: "请输入您想知道的内容" })).toBeVisible()
  await page.getByRole("textbox", { name: "请输入您想知道的内容" }).fill("继续分析")
  await page.getByRole("button", { name: "发送", exact: true }).click()
  await expect.poll(() => calls.agents).toEqual([finance, finance])
  await page.reload()
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("分析一次")
})

test("mobile history shares ownership and deletion, and opens both research sources read-only", async ({ page }, info) => {
  const calls = await setup(page)
  await page.goto("/mobile")
  await menu(page).click()
  const nav = page.getByRole("dialog", { name: "导航" })
  await expect(nav.getByText(/DeepLens/)).toHaveCount(0)
  await expect(nav.getByText("财经快速历史")).toBeVisible()
  await expect(nav.getByText("不支持的财经专家团")).toHaveCount(0)
  await expect(nav.getByText("OpenCode 深度研究")).toBeVisible()
  await page.screenshot({ path: info.outputPath("mobile-navigation.png") })
  await nav.getByText("OpenCode 深度研究").click()
  await expect(page.getByRole("button", { name: "研究结果" })).toBeVisible()
  await page.getByRole("button", { name: "研究结果" }).click()
  await expect(page.getByRole("button", { name: "做同款" })).toHaveCount(0)
  await expect(page.getByRole("textbox")).toHaveCount(0)
  await menu(page).click()
  await nav.getByText("LangGraph 深度研究").click()
  await expect(page.getByRole("button", { name: "研究结果" })).toBeVisible()
  await expect(page.getByRole("button", { name: "停止执行" })).toHaveCount(0)
  expect(calls.researchWrites).toEqual([])
  await menu(page).click()
  await nav.getByRole("button", { name: "删除 手机通用历史" }).click()
  await expect(page.getByText("删除后，该会话也会从 PC 版历史中移除。")).toBeVisible()
  calls.failDelete = true
  await page.getByRole("button", { name: "确认删除" }).click()
  await expect(page.getByRole("alert")).toContainText("历史记录没有删除")
  calls.failDelete = false
  await page.getByRole("button", { name: "确认删除" }).click()
  await expect(page.getByText("删除后，该会话也会从 PC 版历史中移除。")).toHaveCount(0)
  await menu(page).click()
  await expect(nav.getByText("手机通用历史")).toHaveCount(0)
  await page.goto("/mobile/history/opencode/ses_unknown_owner")
  await expect(page.getByText("该历史记录不可用")).toBeVisible()
  expect(calls.strangers).toEqual([])
})

for (const [name, agent] of [["灵犀", "build"], ["AI+推荐", "shoppers-pro/shoppers-pro-quick"]]) {
  test(`mobile sends with the existing ${name} agent`, async ({ page }) => {
    const calls = await setup(page)
    await page.goto("/mobile")
    const input = page.getByRole("textbox", { name: "请输入您想知道的内容" })
    await expect(input).toBeVisible()
    if (name !== "灵犀") {
      await page.getByRole("button", { name: "选择助手" }).click()
      await page.getByRole("menuitem", { name, exact: true }).click()
    }
    await input.fill("检查手机助手路由")
    await page.getByRole("button", { name: "发送", exact: true }).click()
    await expect.poll(() => calls.agents).toEqual([agent])
  })
}

test("DeepLens accepts an image-only first message and keeps its agent for follow-ups", async ({ page }) => {
  const calls = await setup(page, { skills: true, vision: true })
  await page.goto("/mobile")
  await page.getByRole("button", { name: "选择助手" }).click()
  await page.getByRole("menuitem", { name: "DeepLens 拍照即懂" }).click()
  const input = page.getByRole("textbox", { name: "上传图片开始解读" })
  await input.fill("先检查空图片状态")
  await expect(page.getByText("请先添加图片")).toBeVisible()
  const send = page.getByRole("button", { name: "发送", exact: true })
  await expect(send).toBeDisabled()
  await expect(page.getByRole("button", { name: "选择模型" })).toContainText("视觉测试模型")
  const file = page.locator('input[type="file"][accept]')
  await file.setInputFiles({ name: "not-an-image.pdf", mimeType: "application/pdf", buffer: Buffer.from("test") })
  await expect(page.getByText("not-an-image.pdf")).toHaveCount(0)
  await input.fill("")
  await file.setInputFiles({
    name: "photo.png", mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aPVkAAAAASUVORK5CYII=", "base64"),
  })
  await expect(send).toBeEnabled()
  await send.click()
  await expect.poll(() => calls.agents).toEqual([lens])
  expect(calls.queries[0]).toMatchObject({ agentType: "deeplens", query: "请解读上传的图片" })
  expect(calls.uploads).toHaveLength(1)
  expect(calls.promptRequests[0].model.modelID).toBe("vision-test")
  expect(calls.promptRequests[0].system).toContain("deeplens-brief 安装目录只读")
  expect(calls.promptRequests[0].parts).toContainEqual(expect.objectContaining({ type: "file", mime: "image/png" }))
  await expect(page.getByText("这是手机端流式回复测试。")).toBeVisible()
  await expect(page.locator(".di-mobile-download")).toHaveCount(0)
  await page.getByRole("textbox", { name: "请输入您想知道的内容" }).fill("把表格单独列一下")
  await send.click()
  await expect.poll(() => calls.agents).toEqual([lens, lens])
})

test("mobile quick research uses OpenCode and only shows its deliverable reports", async ({ page }) => {
  const calls = await setup(page, { skills: true })
  await page.goto("/mobile")
  await page.getByRole("button", { name: "选择助手" }).click()
  await page.getByRole("menuitem", { name: "深度洞察", exact: true }).click()
  await page.getByRole("textbox", { name: "请输入您想知道的内容" }).fill("研究移动通信行业")
  await page.getByRole("button", { name: "发送", exact: true }).click()
  await expect.poll(() => calls.agents).toEqual([quickResearch])
  expect(calls.promptRequests[0].system).toContain("deepinsight-brief 安装目录只读")
  await expect(page.getByRole("button", { name: "50-report.md" })).toBeVisible()
  await expect(page.getByRole("button", { name: "10-requirements.md" })).toHaveCount(0)
  expect(calls.researchWrites).toEqual([])
})
