import { expect, test } from "@playwright/test"
import { setupGeneralChat } from "./general-chat.fixture"

test.use({ locale: "zh-CN" })
const baseline = process.env.CMCC_CHAT_BASELINE === "1"
const titlePrefix = "整理研究材料与分析步骤吧"

for (const width of [1440, 390]) {
  test(`general chat presentation at ${width}`, async ({ page, baseURL }, info) => {
    await page.setViewportSize({ width, height: 900 })
    const data = await setupGeneralChat(page, { turns: 1 })
    data.session.title = `${titlePrefix}，并核对引用来源`
    await page.goto(data.href(baseURL!))
    await expect(page.locator('[data-component="session-composer"]')).toBeVisible()
    if (width < 760) {
      await page.getByRole("button", { name: "隐藏左栏" }).click()
      await expect
        .poll(() =>
          page.locator('aside[aria-label="CMCC conversations"]').evaluate((el) => el.getBoundingClientRect().width),
        )
        .toBeLessThanOrEqual(1)
    }
    await expect(page.locator('[data-timeline-part-id="answer-0-text"] table')).toBeVisible()
    if (width >= 760) {
      const messageWidths = await page.locator('.cmcc-chat-message[data-speaker="user"]').first().evaluate((element) => {
        const message = element.getBoundingClientRect()
        const sessionTurn = element.parentElement?.getBoundingClientRect()
        return { message: message.width, sessionTurn: sessionTurn?.width ?? 0 }
      })
      expect(messageWidths.message).toBeCloseTo(messageWidths.sessionTurn, 0)
    }
    const scroll = page
      .locator(".scroll-view__viewport")
      .filter({ has: page.locator('[data-timeline-part-id="answer-0-text"]') })
    await scroll.evaluate((node) => {
      node.scrollTop = 0
    })
    const metrics = await page.evaluate(() => ({
      readyMs: performance.getEntriesByName("general-chat-ready")[0]?.startTime,
      nodes: document.querySelectorAll("*").length,
      rows: document.querySelectorAll("[data-timeline-key]").length,
    }))
    console.log(JSON.stringify({ baseline, width, ...metrics }))
    await info.attach("general-chat-metrics", { body: JSON.stringify(metrics), contentType: "application/json" })
    await page.screenshot({ path: info.outputPath(baseline ? "before.png" : "after.png") })
    if (baseline) return
    await expect(page.locator('[data-cmcc-general-chat="true"]')).toHaveCount(1)
    const header = page.locator("[data-session-title]")
    const logo = header.getByAltText("移动智能 MobileAI", { exact: true })
    const title = header.locator('[data-slot="session-title-child"]')
    const more = header.getByRole("button", { name: "更多选项" })
    await expect(header).toHaveCSS("height", "48px")
    const background = await scroll.evaluate((el) => getComputedStyle(el.closest(".bg-v2-background-bg-base")!).backgroundColor)
    await expect(header).toHaveCSS("background-color", background)
    await expect.poll(() => logo.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0)
    await expect(title).toHaveText(`${titlePrefix}...`)
    await expect(title).toHaveAttribute("title", data.session.title)
    await expect(title).toHaveCSS("font-weight", "600")
    await expect(more).toHaveCSS("background-color", "rgb(237, 244, 255)")
    await expect(more).toHaveCSS("color", "rgb(53, 102, 163)")
    const bounds = await header.evaluate((el) => {
      const logo = el.querySelector("img")!.getBoundingClientRect()
      const title = el.querySelector('[data-slot="session-title-child"]')!.getBoundingClientRect()
      const more = el.querySelector("button")!.getBoundingClientRect()
      return { logo: logo.right, titleLeft: title.left, titleRight: title.right, more: more.left }
    })
    expect(bounds.logo).toBeLessThan(bounds.titleLeft)
    expect(bounds.titleRight).toBeLessThan(bounds.more)
    await more.click()
    await expect(page.getByRole("menuitem", { name: "重命名", exact: true })).toBeVisible()
    await page.keyboard.press("Escape")
    await title.click()
    await expect(title).toHaveValue(data.session.title)
    await title.press("Escape")
    await expect(page.getByAltText("灵犀", { exact: true })).toHaveCount(1)
    await expect(page.getByAltText("用户", { exact: true })).toHaveCount(1)
    await expect(page.locator('[data-action="prompt-model-variant"]')).toHaveCount(0)
    await expect(page.getByRole("button", { name: "查看上下文用量" })).toHaveCount(0)
    await expect(page.locator('[data-action="prompt-submit"]')).toHaveCSS("border-radius", "50%")
    expect(data.errors).toEqual([])
  })
}

test("retains native controls outside general chat", async ({ page, baseURL }) => {
  const data = await setupGeneralChat(page, { agentType: "deepcampaign", turns: 1 })
  await page.goto(data.href(baseURL!))
  await expect(page.locator('[data-component="session-composer"]')).toBeVisible()
  await expect(page.locator('[data-cmcc-general-chat="true"]')).toHaveCount(0)
  await expect(page.locator("[data-session-title]")).toHaveCSS("height", "64px")
  await expect(page.locator("[data-session-title] img[src='/brand/mobileai-horizontal.svg']")).toHaveCount(0)
  await expect(page.getByAltText("灵犀", { exact: true })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "查看上下文用量" })).toBeVisible()
  await expect(page.locator('[data-action="prompt-model-variant"]')).toBeVisible()
  await expect(page.locator('[data-action="prompt-submit"]')).toHaveCSS("width", "36px")
})

test("general chat keeps its task plan dock", async ({ page, baseURL }) => {
  const data = await setupGeneralChat(page, { running: true, turns: 1 })
  await page.route("**/session/*/todo*", (route) => route.fulfill({ json: [
    { content: "通用对话任务计划", status: "in_progress", priority: "high" },
  ] }))
  await page.goto(data.href(baseURL!))
  data.events.push({ type: "todo.updated", properties: { sessionID: data.session.id, todos: [
    { content: "通用对话任务计划", status: "in_progress", priority: "high" },
  ] } })
  await expect(page.locator('[data-component="session-todo-dock"]')).toBeVisible()
  await expect(page.getByText("通用对话任务计划", { exact: true }).first()).toBeVisible()
  expect(data.errors).toEqual([])
})

test("code copy and wide table scrolling keep the conversation within its panel", async ({
  page,
  context,
  baseURL,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"])
  const data = await setupGeneralChat(page, { turns: 1 })
  const part = data.messages.at(-1)!.parts.find((item) => item.type === "text")!
  if (!("text" in part) || typeof part.text !== "string") throw new Error("Missing test text")
  part.text +=
    "\n\n| " +
    Array.from({ length: 12 }, (_, i) => `完整指标名称${i}`).join(" | ") +
    " |\n| " +
    Array(12).fill("---").join(" | ") +
    " |\n| " +
    Array(12).fill("需要核对的原始结果").join(" | ") +
    " |"
  await page.goto(data.href(baseURL!))
  const report = page.locator('[data-timeline-part-id="answer-0-text"]')
  await expect(report.locator("table")).toHaveCount(2)
  const table = report.locator("[data-markdown-table]").last()
  await table.scrollIntoViewIfNeeded()
  const sizes = await table.evaluate((el) => ({ client: el.clientWidth, scroll: el.scrollWidth }))
  expect(sizes.scroll).toBeGreaterThan(sizes.client)
  await table.evaluate((el) => {
    el.scrollLeft = 100
  })
  expect(await table.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0)
  const code = report.locator('[data-component="markdown-code"]')
  await code.scrollIntoViewIfNeeded()
  await code.hover()
  await code.locator('[data-slot="markdown-copy-button"]').click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("print(sum(rows))")
  const scroll = page.locator(".scroll-view__viewport").filter({ has: report })
  expect(await scroll.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1)
  expect(data.errors).toEqual([])
})

test("streaming preserves manual scroll position and the stop button still aborts", async ({ page, baseURL }) => {
  const data = await setupGeneralChat(page, { turns: 3, running: true })
  await page.goto(data.href(baseURL!))
  const stop = page.locator('[data-action="prompt-submit"]')
  await expect(stop).toHaveAttribute("data-send-mode", "stop")
  const region = page
    .locator(".scroll-view__viewport")
    .filter({ has: page.locator('[data-timeline-row="AssistantPart"]') })
  await region.hover()
  await page.mouse.wheel(0, -5000)
  await expect.poll(() => region.evaluate((el) => el.scrollTop)).toBeLessThan(80)
  const part = data.messages.at(-1)!.parts.find((item) => item.type === "text")!
  if (!("text" in part) || typeof part.text !== "string") throw new Error("Missing test text")
  const before = await region.evaluate((el) => el.scrollHeight)
  part.text += "\n\n" + Array(20).fill("这是后续流式追加的内容。\n\n").join("")
  data.events.push({ type: "message.part.updated", properties: { part } })
  await expect.poll(() => region.evaluate((el) => el.scrollHeight)).toBeGreaterThan(before)
  expect(await region.evaluate((el) => el.scrollTop)).toBeLessThan(80)
  await stop.click()
  await expect.poll(data.aborts).toBe(1)
  await expect(stop).toHaveAttribute("data-send-mode", "send")
  await expect(stop).toBeDisabled()
  expect(data.errors).toEqual([])
})

test("sending preserves the configured reasoning variant even when its selector is hidden", async ({
  page,
  baseURL,
}) => {
  const data = await setupGeneralChat(page, { turns: 1 })
  let submitted: Record<string, unknown> | undefined
  await page.route(`**/session/${data.session.id}/prompt_async*`, async (route) => {
    submitted = route.request().postDataJSON()
    await route.fulfill({ status: 204 })
  })
  await page.goto(data.href(baseURL!))
  await expect(page.locator('[data-action="prompt-model-variant"]')).toHaveCount(0)
  const send = page.locator('[data-action="prompt-submit"]')
  await expect(send).toBeDisabled()
  await page.locator('[data-component="prompt-input"]').fill("保留已有推理配置")
  await expect(send).toBeEnabled()
  await send.click()
  await expect.poll(() => submitted?.variant).toBe("high")
  expect(submitted?.agent).toBe("build")
  expect(JSON.stringify(submitted?.parts)).toContain("保留已有推理配置")
})

test("large histories remain virtualized", async ({ page, baseURL }, info) => {
  const data = await setupGeneralChat(page, { turns: 100 })
  await page.goto(data.href(baseURL!))
  await expect(page.locator('[data-timeline-part-id="answer-99-text"]')).toBeVisible()
  const metrics = await page.evaluate(() => ({
    nodes: document.querySelectorAll("*").length,
    rows: document.querySelectorAll("[data-timeline-key]").length,
  }))
  expect(metrics.rows).toBeLessThan(50)
  await info.attach("large-history-metrics", { body: JSON.stringify(metrics), contentType: "application/json" })
  expect(data.errors).toEqual([])
})

test("a linked message lands below the compact header and a 12-character title stays intact", async ({ page, baseURL }) => {
  const data = await setupGeneralChat(page, { turns: 5 })
  data.session.title = titlePrefix
  const target = "message-msg_chat_1_user"
  await page.goto(`${data.href(baseURL!)}#${target}`)
  const header = page.locator("[data-session-title]")
  await expect(header.getByRole("heading")).toHaveText(titlePrefix)
  await expect.poll(() => header.evaluate((el, id) => {
    const message = document.getElementById(id)?.getBoundingClientRect()
    const viewport = el.closest(".scroll-view__viewport")?.getBoundingClientRect()
    return !!message && !!viewport && message.top >= el.getBoundingClientRect().bottom && message.bottom <= viewport.bottom
  }, target)).toBe(true)
})

test("tool records retain details and the right panel stays usable", async ({ page, baseURL }, info) => {
  const data = await setupGeneralChat(page, { turns: 1 })
  await page.goto(data.href(baseURL!))
  const tool = page.locator('[data-timeline-part-id="answer-0-tool"]')
  await tool.scrollIntoViewIfNeeded()
  const trigger = tool.locator('[data-slot="collapsible-trigger"]')
  if (await trigger.getAttribute("aria-expanded") !== "true") await trigger.click()
  await expect(tool.locator('[data-slot="bash-pre"]')).toContainText("检查完成")
  await expect(tool.locator('.tool-collapsible')).toHaveCSS("border-radius", "8px")
  const toggle = page.getByRole("button", { name: "展开右栏" })
  if (await toggle.isVisible()) await toggle.click()
  await expect(page.getByRole("button", { name: "隐藏右栏" })).toBeVisible()
  await page.screenshot({ path: info.outputPath("tools-and-panels.png") })
  expect(data.errors).toEqual([])
})

test("desktop classic conversations fold the process, not the final answer", async ({ page, baseURL }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const data = await setupGeneralChat(page, { turns: 1 })
  const parts = data.messages.at(-1)!.parts
  const tool = parts[0]!
  const answer = parts[1]!
  parts.splice(
    0, parts.length,
    { ...answer, id: "part-01", text: "先检查输入材料。" },
    { ...tool, id: "part-02" },
    { ...answer, id: "part-03", text: "工作目录已建好，开始核对。" },
    { ...tool, id: "part-04", callID: "call-next" },
    { ...answer, id: "part-05", text: "## 研究结论\n\n这是保留在思考区之外的正式回答。" },
  )
  await page.goto(data.href(baseURL!))
  const thinking = page.getByRole("button", { name: "已完成思考" })
  const body = page.locator(".cmcc-chat-progress-body")
  const finalAnswer = page.locator('[data-timeline-part-id="part-05"]')
  await expect(thinking).toHaveAttribute("aria-expanded", "true")
  await expect(body.getByText("工作目录已建好，开始核对。")).toBeVisible()
  await expect(body.locator(".tool-collapsible").first()).toHaveCSS("background-color", "rgb(245, 245, 246)")
  await expect(body.locator('[data-timeline-part-id="part-05"]')).toHaveCount(0)
  await page.screenshot({ path: info.outputPath("classic-progress.png") })
  await thinking.click()
  await expect(thinking).toHaveAttribute("aria-expanded", "false")
  await expect(body).toHaveCount(0)
  await expect(finalAnswer.getByText("研究结论")).toBeVisible()
  await thinking.click()
  await expect(body.getByText("先检查输入材料。")).toBeVisible()
  expect(data.errors).toEqual([])
})

for (const [agentType, agent, name] of [
  ["deeptrading", "deeptrading/deeptrading-lite-quick", "DeepTrading 财经分析专家团"],
  ["deeptrading", "deeptrading/deeptrading-quick", "DeepTrading 财经分析专家团"],
  ["shoppers-pro", "shoppers-pro/shoppers-pro-quick", "Shoppers Pro 购买决策专家团"],
  ["deepinspect", "deepinspect/deepinspect-quick", "DeepInspect 巡察分析专家团"],
  ["zhengqi-visit-intel", "zhengqi-visit-intel/zhengqi-visit-intel-quick", "DeepEngage 谈参高拜专家团"],
  ["deepgeo", "deepgeo/deepgeo-quick", "DeepGeo 位置决策专家团"],
  ["ai-for-science-team", "ai-for-science-team/ai-for-science-team-quick", "AI for Science 科研专家团"],
] as const) {
  test(`desktop classic layout keeps ${agent} for follow-up`, async ({ page, baseURL }) => {
    const data = await setupGeneralChat(page, { agentType, agent, turns: 1 })
    let submitted: string | undefined
    await page.route(`**/session/${data.session.id}/prompt_async*`, async (route) => {
      submitted = route.request().postDataJSON().agent
      await route.fulfill({ status: 204 })
    })
    await page.goto(data.href(baseURL!))
    await expect(page.locator('[data-cmcc-general-chat="true"]')).toHaveCount(1)
    const avatar = page.getByAltText(name, { exact: true })
    await expect.poll(() => avatar.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0)
    await expect(avatar).toHaveAttribute("src", /(?:\/assets\/team-|^data:image\/png;base64,)/)
    await expect(page.getByAltText("灵犀", { exact: true })).toHaveCount(0)
    await page.locator('[data-component="prompt-input"]').fill("继续分析")
    await page.locator('[data-action="prompt-submit"]').click()
    await expect.poll(() => submitted).toBe(agent)
    expect(data.errors).toEqual([])
  })
}
