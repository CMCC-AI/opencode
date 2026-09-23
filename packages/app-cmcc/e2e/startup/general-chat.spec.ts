import { expect, test } from "@playwright/test"
import { setupGeneralChat } from "./general-chat.fixture"

test.use({ locale: "zh-CN" })
const baseline = process.env.CMCC_CHAT_BASELINE === "1"

for (const width of [1440, 390]) {
  test(`general chat presentation at ${width}`, async ({ page, baseURL }, info) => {
    await page.setViewportSize({ width, height: 900 })
    const data = await setupGeneralChat(page, { turns: 1 })
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
  await expect(page.getByAltText("灵犀", { exact: true })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "查看上下文用量" })).toBeVisible()
  await expect(page.locator('[data-action="prompt-model-variant"]')).toBeVisible()
  await expect(page.locator('[data-action="prompt-submit"]')).toHaveCSS("width", "36px")
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
  const table = report.locator("[data-markdown-block]:has(> table)").last()
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
