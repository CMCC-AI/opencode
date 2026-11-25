import { expect, test, type Page } from "@playwright/test"
import { expectPageBrandBar } from "../utils/expect-page-brand-bar"
import { homeDirectory, homeSession, homeTeam, selectHomeTeam, setupHomePage } from "./home-fixture"

test.use({ locale: "zh-CN" })
const editor = (page: Page) => page.locator('[data-research-home] [data-component="prompt-input"]')
const mode = (page: Page, name: string) =>
  page.getByRole("group", { name: "研究模式" }).getByRole("button", { name, exact: true })

async function setup(page: Page) {
  await setupHomePage(page, { models: true, teams: true })
  const calls: { path: string; body: unknown }[] = []
  const deep: unknown[] = []
  const files: { saved_name: string; original_filename: string }[] = []
  const session = {
    id: "quick-test",
    query: "研究问题",
    title: "研究问题",
    status: "completed",
    elapsedSeconds: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  await page.route("**/api/dockapi/history?*", (route) => route.fulfill({ json: { code: 200, data: [] } }))
  await page.route("**/api/dockapi/token-quota", (route) =>
    route.fulfill({
      json: {
        code: 200,
        data: {
          enabled: false,
          vip: false,
          weeklyLimit: null,
          used: 0,
          reserved: 0,
          remaining: null,
          weekStart: 1,
          resetAt: 2,
          hasUnknownUsage: false,
        },
      },
    }),
  )
  await page.route("**/file/upload*", (route) => {
    deep.push(route.request().postDataJSON())
    return route.fulfill({ json: { path: "ok" } })
  })
  await page.route("**/api/dockapi/general-deepinsight/**", async (route) => {
    const req = route.request()
    const path = new URL(req.url()).pathname
    const form = req.headers()["content-type"]?.includes("multipart")
    const body = form ? req.postData() : req.postDataJSON()
    calls.push({ path, body })
    const json = (data: unknown) => route.fulfill({ json: { code: 200, data } })
    if (path.endsWith("/files")) {
      const name = /filename="([^"]+)"/.exec(String(body))?.[1] ?? "report.docx"
      files.push({ original_filename: name, saved_name: `saved-${files.length}-${name}` })
      return json({ upload_id: "upload-test", files })
    }
    if (path.endsWith("/sessions")) return json(session)
    if (path.endsWith("/stream")) return route.fulfill({ contentType: "text/event-stream", body: "" })
    return json({ session, reportContent: "# 研究报告", conversationData: { steps: [] } })
  })
  return { calls, deep }
}

test("login home and both sidebar entries open independent blank Deep Research drafts", async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await setup(page)
  await page.goto("/app")
  const sidebar = page.getByRole("complementary", { name: "CMCC conversations" }).getByRole("navigation")
  const heading = page.getByRole("heading", { name: "DeepInsight深度洞察", exact: true })
  const composer = page.locator(".cmcc-home-composer")
  const drafts = new Set<string>()
  for (const entry of [undefined, "深度研究"]) {
    if (entry) await sidebar.getByRole("button", { name: entry, exact: true }).click()
    await expect(homeTeam(page)).toHaveAccessibleName("切换专家团，当前：深度研究专家团")
    await expectPageBrandBar(page, heading)
    await expect(mode(page, "深度")).toHaveAttribute("aria-pressed", "true")
    await expect(editor(page)).toHaveText("")
    await expect(heading).toHaveCSS("font-size", "50.688px")
    expect((await composer.boundingBox())!.width).toBeCloseTo(950.4, 1)
    await expect(composer.locator(".cmcc-home-composer-surface")).toHaveCSS("min-height", "190.08px")
    drafts.add(new URL(page.url()).searchParams.get("draftId")!)
    await editor(page).fill("这个问题只属于当前草稿")
  }
  await sidebar.getByRole("button", { name: "新对话", exact: true }).click()
  await expect(homeTeam(page)).toHaveAccessibleName("切换专家团，当前：灵犀")
  await expectPageBrandBar(page, heading)
  await expect(page.getByRole("group", { name: "研究模式" })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "执行", exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "计划", exact: true })).toBeVisible()
  await expect(editor(page)).toHaveText("")
  drafts.add(new URL(page.url()).searchParams.get("draftId")!)
  expect(drafts.size).toBe(3)
  await editor(page).fill("这个问题只属于当前草稿")
  await homeTeam(page).click()
  const menu = page.getByRole("menu", { name: "切换专家团" })
  await expect(menu.getByRole("menuitem")).toHaveCount(7)
  await expect(menu.getByRole("menuitem", { name: "多股对比" })).toHaveCount(0)
  await expect(menu.getByRole("menuitem", { name: "AI for Science 科研专家团", exact: true })).toHaveCount(0)
  for (const [name, asset] of [
    ["深度研究专家团", "deepinsight"],
    ["DeepTrading 财经分析专家团", "deeptrading"],
    ["Shoppers Pro 购买决策专家团", "shoppers-pro"],
    ["DeepInspect 巡察分析专家团", "deepinspect"],
    ["DeepEngage 谈参高拜专家团", "zhengqi-visit-intel"],
    ["DeepGeo 位置决策专家团", "deepgeo"],
    ["灵犀", "draft-lingxi"],
  ]) {
    const avatar = menu.getByRole("menuitem", { name, exact: true }).locator("img")
    await expect(avatar).toHaveAttribute("src", new RegExp(`/${asset}[-.]`))
    await expect.poll(() => avatar.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true)
  }
  await expect(menu).toHaveCSS("opacity", "1")
  await page.screenshot({ path: info.outputPath("team-menu.png") })
  await page.keyboard.press("Escape")
  await selectHomeTeam(page, "灵犀")
  await expect(page.getByRole("button", { name: "执行", exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "计划", exact: true })).toBeVisible()
  await expect(editor(page)).toHaveText("这个问题只属于当前草稿")
})

test("switching Quick Research to a different team reconciles files and uses that team's OpenCode lead", async ({ page }) => {
  const data = await setup(page)
  const sent: { agent: string; parts: { type: string; url?: string }[] }[] = []
  const bindings: string[] = []
  await page.route("**/api/dockapi/sessions", (route) => {
    if (route.request().method() !== "POST") return route.fulfill({ json: { code: 200, data: [] } })
    bindings.push(route.request().postDataJSON().agentType)
    return route.fulfill({ json: { code: 200, data: {
      id: "trading-task", agentType: "deeptrading", directoryPath: homeDirectory,
      openCodeSessionId: homeSession.id, openCodeSession: homeSession,
    } } })
  })
  await page.route(`**/session/${homeSession.id}/prompt_async*`, (route) => {
    sent.push(route.request().postDataJSON())
    return route.fulfill({ status: 204 })
  })
  await page.goto("/app")
  await mode(page, "快速").click()
  await editor(page).fill("保留问题，切换到财经分析")
  await page.locator('input[type="file"]').first().setInputFiles({
    name: "report.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: Buffer.from("word-original-content"),
  })
  await expect.poll(() => data.calls.filter((call) => call.path.endsWith("/files")).length).toBe(1)
  const url = page.url()
  await selectHomeTeam(page, "DeepTrading 财经分析专家团")
  await expect(editor(page)).toHaveText("保留问题，切换到财经分析")
  await expect(page.getByRole("group", { name: "研究模式" })).toHaveCount(0)
  await expect(page.getByRole("group", { name: "执行模式" })).toHaveCount(0)
  await expect(page.locator(".cmcc-home-greeting .cmcc-home-team-avatar img")).toHaveAttribute("src", /\/deeptrading[-.]/)
  expect(page.url()).toBe(url)
  expect(data.deep).toHaveLength(1)
  expect(bindings).toEqual([])
  await page.reload()
  await expect(homeTeam(page)).toHaveAccessibleName("切换专家团，当前：DeepTrading 财经分析专家团")
  await page.getByRole("button", { name: "发送", exact: true }).click()
  await expect.poll(() => sent.length).toBe(1)
  expect(bindings).toEqual(["deeptrading"])
  expect(sent[0].agent).toBe("deeptrading/deeptrading-team-lead")
  expect(sent[0].parts).toEqual(expect.arrayContaining([expect.objectContaining({ type: "file", url: expect.stringContaining("report.docx") })]))
  expect(data.deep).toHaveLength(1)
})

test("industry summons keep the example prompt and use the same switchable team header", async ({ page }) => {
  await setup(page)
  await page.goto("/expert")
  await page.getByRole("button").filter({ has: page.getByRole("heading", { name: "AI + 财经", exact: true }) }).click()
  await page.getByRole("button", { name: "召唤产业专家团", exact: true }).click()
  await expect(homeTeam(page)).toHaveAccessibleName("切换专家团，当前：DeepTrading 财经分析专家团")
  await expect(editor(page)).not.toHaveText("")
  const example = await editor(page).innerText()
  const url = page.url()
  await selectHomeTeam(page, "灵犀")
  await expect(editor(page)).toHaveText(example)
  expect(page.url()).toBe(url)
})

test("AI for Science can still be summoned from industry insights", async ({ page }) => {
  await setup(page)
  await page.goto("/expert")
  await page.getByRole("button").filter({ has: page.getByRole("heading", { name: "AI + 科研", exact: true }) }).click()
  await page.getByRole("button", { name: "召唤产业专家团", exact: true }).click()
  await expect(homeTeam(page)).toHaveAccessibleName("切换专家团，当前：AI for Science 科研专家团")
  await expect(editor(page)).not.toHaveText("")
})

for (const width of [1440, 390]) {
  test(`unifies research modes and preserves the draft at ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 })
    await setup(page)
    await page.goto("/app")
    await page.getByRole("button", { name: "深度研究", exact: true }).click()
    await expect(editor(page)).toBeVisible()
    const url = page.url()
    const heading = page.getByRole("heading", { name: "DeepInsight深度洞察", exact: true })
    if (width === 390) {
      await page.getByRole("button", { name: "隐藏左栏", exact: true }).click()
      await expect(heading).toHaveCSS("font-size", "28px")
      await expect(page.locator(".cmcc-home-composer-surface")).toHaveCSS("min-height", "200px")
    }
    await expectPageBrandBar(page, heading)
    await expect(mode(page, "深度")).toHaveAttribute("aria-pressed", "true")
    await expect(page.getByRole("button", { name: "通用深度洞察", exact: true })).toHaveCount(0)
    await expect(page.getByRole("button", { name: "计划", exact: true })).toHaveCount(0)
    await expect(page.getByRole("region", { name: "精选案例" })).toHaveCount(0)
    await editor(page).fill("这段研究问题不能丢失")
    await page.getByRole("button", { name: "打开更多操作" }).click()
    await expect(page.getByRole("button", { name: "添加文件夹", exact: true })).toBeVisible()
    await expect(page.getByRole("button", { name: "专家团", exact: true })).toHaveCount(0)
    await page.keyboard.press("Escape")
    await mode(page, "快速").click()
    await expect(page.locator('[data-action="prompt-model"]')).toHaveCount(0)
    await expect(editor(page)).toHaveValue("这段研究问题不能丢失")
    expect(page.url()).toBe(url)
    await page.getByRole("button", { name: "打开更多操作" }).click()
    await expect(page.getByRole("button", { name: "上传文档" })).toBeVisible()
    await expect(page.getByRole("button", { name: "添加文件夹", exact: true })).toHaveCount(0)
    await page.keyboard.press("Escape")
    await mode(page, "深度").click()
    await expect(page.locator('[data-action="prompt-model"]')).toBeVisible()
    await expect(editor(page)).toHaveText("这段研究问题不能丢失")
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
    await page.screenshot({ path: info.outputPath("research-home.png") })
  })
}

test("quick mode works with held model catalogs and never creates an OpenCode session", async ({ page }) => {
  const value = await setup(page)
  const gate = Promise.withResolvers<void>()
  let openCode = 0
  await page.route(/\/(provider|agent)(\?|$)/, async (route) => {
    await gate.promise
    await route.fallback()
  })
  await page.route("**/api/dockapi/sessions", (route) => {
    if (route.request().method() === "POST") openCode++
    return route.fulfill({ json: { code: 200, data: [] } })
  })
  try {
    await page.goto("/general-deepinsight")
    await expect(editor(page)).toBeVisible()
    await expect(mode(page, "快速")).toHaveAttribute("aria-pressed", "true")
    await editor(page).fill("独立的快速研究")
    await page.getByRole("button", { name: "发送", exact: true }).click()
    await expect(page).toHaveURL(/general-deepinsight\/session\/quick-test/)
    expect(value.calls.filter((call) => call.path.endsWith("/sessions"))).toHaveLength(1)
    expect(openCode).toBe(0)
  } finally {
    gate.resolve()
  }
})

test("Word uploads keep independent receipts across switches and refresh requires missing originals", async ({
  page,
}) => {
  const value = await setup(page)
  await page.goto("/app")
  await page.getByRole("button", { name: "深度研究", exact: true }).click()
  await expect(editor(page)).toBeVisible()
  await page
    .locator('input[type="file"]')
    .filter({ hasNot: page.locator("[webkitdirectory]") })
    .first()
    .setInputFiles({
      name: "report.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer: Buffer.from("word-original-content"),
    })
  await expect.poll(() => value.deep.length).toBe(1)
  await mode(page, "快速").click()
  await expect.poll(() => value.calls.filter((call) => call.path.endsWith("/files")).length).toBe(1)
  await mode(page, "深度").click()
  await mode(page, "快速").click()
  expect(value.deep).toHaveLength(1)
  expect(value.calls.filter((call) => call.path.endsWith("/files"))).toHaveLength(1)
  await page.reload()
  await expect(editor(page)).toBeVisible()
  await mode(page, "深度").click()
  await expect(page.getByRole("alert")).toHaveCount(0)
  expect(value.deep).toHaveLength(1)
})

test("incompatible images remain visible and prevent quick submission", async ({ page }) => {
  await setup(page)
  await page.goto("/app")
  await page.getByRole("button", { name: "深度研究", exact: true }).click()
  await expect(editor(page)).toBeVisible()
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: Buffer.from("image") })
  await mode(page, "快速").click()
  await expect(page.getByRole("alert")).toContainText("不支持")
  await expect(page.getByRole("button", { name: "发送", exact: true })).toBeDisabled()
  await expect(page.getByAltText("photo.png")).toHaveCount(1)
})

test("deep mode submits the fixed expert with the selected model once", async ({ page }) => {
  await setup(page)
  let created = 0
  const sent: { agent: string; model: { modelID: string } }[] = []
  await page.route("**/api/dockapi/sessions", (route) => {
    if (route.request().method() !== "POST") return route.fulfill({ json: { code: 200, data: [] } })
    created++
    expect(route.request().postDataJSON().agentType).toBe("deepinsight")
    return route.fulfill({
      json: {
        code: 200,
        data: {
          id: "deep-task",
          agentType: "deepinsight",
          directoryPath: homeDirectory,
          openCodeSessionId: homeSession.id,
          openCodeSession: homeSession,
        },
      },
    })
  })
  await page.route(`**/session/${homeSession.id}*`, (route) =>
    new URL(route.request().url()).pathname === `/session/${homeSession.id}`
      ? route.fulfill({ json: homeSession })
      : route.fallback(),
  )
  await page.route(`**/session/${homeSession.id}/prompt_async*`, (route) => {
    sent.push(route.request().postDataJSON())
    return route.fulfill({ status: 204 })
  })
  await page.goto("/app")
  await page.getByRole("button", { name: "深度研究", exact: true }).click()
  await expect(editor(page)).toBeVisible()
  await page.locator('[data-action="prompt-model"]').click()
  await page.getByRole("menuitem", { name: "Kimi", exact: true }).hover()
  await page.getByRole("menuitemradio", { name: /Kimi 测试模型/ }).click()
  await mode(page, "快速").click()
  await mode(page, "深度").click()
  await editor(page).fill("深度模式首次发送")
  await page.getByRole("button", { name: "发送", exact: true }).click()
  await expect.poll(() => sent.length).toBe(1)
  expect(created).toBe(1)
  expect(sent[0].agent).toBe("deepinsight/deepinsight-team-lead")
  expect(sent[0].model.modelID).toBe("kimi-k2.6")
})

test("quick quota failures keep the question without creating any task", async ({ page }) => {
  const value = await setup(page)
  await page.route("**/api/dockapi/token-quota", (route) =>
    route.fulfill({ status: 503, json: { code: 503, message: "测试额度服务不可用", data: null } }),
  )
  await page.goto("/general-deepinsight")
  await editor(page).fill("失败后保留研究问题")
  await page.getByRole("button", { name: "发送", exact: true }).click()
  await expect(page.getByText("测试额度服务不可用", { exact: true })).toBeVisible()
  await expect(editor(page)).toHaveValue("失败后保留研究问题")
  expect(value.calls.some((call) => call.path.endsWith("/sessions"))).toBe(false)
  await expect(mode(page, "快速")).toHaveAttribute("aria-pressed", "true")
})

test("refresh asks for the original before uploading to a previously unused engine", async ({ page }) => {
  const value = await setup(page)
  await page.goto("/general-deepinsight")
  await expect(editor(page)).toBeVisible()
  await page
    .locator('input[type="file"]')
    .setInputFiles({
      name: "report.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer: Buffer.from("word-original"),
    })
  await expect.poll(() => value.calls.filter((call) => call.path.endsWith("/files")).length).toBe(1)
  await page.reload()
  await expect(editor(page)).toBeVisible()
  await mode(page, "深度").click()
  await expect(page.getByRole("alert")).toContainText("缺少原文件")
  await expect(page.getByRole("button", { name: "发送", exact: true })).toBeDisabled()
  expect(value.deep).toHaveLength(0)
})
