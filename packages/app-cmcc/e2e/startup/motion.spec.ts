import { expect, test, type Locator, type Page } from "@playwright/test"
import { setupHomePage } from "./home-fixture"
import { setupGeneralChat } from "./general-chat.fixture"

test.use({ locale: "zh-CN" })

async function observePageMotion(page: Page) {
  await page.addInitScript(() => {
    const animate = Element.prototype.animate
    Element.prototype.animate = function (keyframes, options) {
      const result = animate.call(this, keyframes, options)
      if (this.classList.contains("cmcc-page-content")) {
        const root = document.documentElement
        root.dataset.motionStarts = String(Number(root.dataset.motionStarts ?? 0) + 1)
        if (result.effect instanceof KeyframeEffect) {
          root.dataset.motionTransforms = JSON.stringify(
            result.effect.getKeyframes().map((frame) => frame.transform ?? "none"),
          )
        }
      }
      return result
    }
  })
}

const starts = (page: Page) => page.evaluate(() => Number(document.documentElement.dataset.motionStarts ?? 0))

async function settled(element: Locator) {
  await element.evaluate((node) =>
    Promise.all(node.getAnimations().map((animation) => animation.finished.catch(() => undefined))),
  )
}

test("page transitions preserve the shell and do not replay for editor or menu changes", async ({ page }) => {
  await observePageMotion(page)
  await setupHomePage(page, { models: true })
  await page.goto("/app")
  const content = page.locator(".cmcc-page-content")
  const editor = page.locator('[data-component="prompt-input"]')
  await expect(editor).toBeVisible()
  await settled(content)
  const node = await content.elementHandle()
  const initial = await starts(page)
  expect(initial).toBeGreaterThan(0)
  expect(await page.evaluate(() => JSON.parse(document.documentElement.dataset.motionTransforms!))).toEqual([
    "none",
    "none",
  ])
  await editor.fill("动画不能清空草稿")
  await page.getByRole("button", { name: "计划", exact: true }).click()
  await page.getByRole("button", { name: "打开更多操作" }).click()
  const menu = page.locator(".home-actions-popover")
  await expect(menu).toHaveCSS("animation-name", "cmcc-menu-enter")
  await expect(menu.locator('[data-component="cmcc-prompt-action-menu"]')).toHaveCSS("border-radius", "12px")
  await page.keyboard.press("Escape")
  await expect(menu).toHaveCount(0)
  expect(await starts(page)).toBe(initial)
  await expect(editor).toHaveText("动画不能清空草稿")
  await page.getByRole("button", { name: "产业洞察", exact: true }).click()
  await expect(page.getByRole("heading", { name: "产业洞察专家团", exact: true })).toBeVisible()
  await settled(content)
  expect(await starts(page)).toBeGreaterThan(initial)
  expect(await page.evaluate(() => JSON.parse(document.documentElement.dataset.motionTransforms!)[0])).not.toBe("none")
  expect(
    await node!.evaluate((element) => element.isConnected && element === document.querySelector(".cmcc-page-content")),
  ).toBe(true)
  await expect(page.getByRole("button", { name: "产业洞察", exact: true })).toHaveCSS(
    "background-color",
    "rgb(233, 236, 241)",
  )
})

for (const reduced of [false, true]) {
  test(`rounded expert dialogs enter, close and reopen (reduced motion=${reduced})`, async ({ page }, info) => {
    await page.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference" })
    await setupHomePage(page)
    await page.goto("/expert")
    const card = page.locator("button:has(h3)").filter({ hasText: "AI + 财经" })
    const dialog = page.locator(".cmcc-expert-dialog")
    const errors: string[] = []
    page.on("pageerror", (error) => errors.push(error.message))
    for (let cycle = 0; cycle < 3; cycle++) {
      await card.click()
      await expect(dialog).toHaveCSS("border-radius", "20px")
      await expect(dialog).not.toHaveCSS("box-shadow", "none")
      await expect(dialog).toHaveCSS("transform", "none")
      await expect(page.locator(".cmcc-modal-overlay")).toHaveCSS("opacity", "1")
      await expect(page.locator(".cmcc-modal-overlay")).toHaveCSS("backdrop-filter", "none")
      if (reduced) await expect(dialog).toHaveCSS("transition-duration", "0s")
      if (cycle === 0) await page.screenshot({ path: info.outputPath("expert-floating-dialog.png") })
      await dialog.getByRole("button", { name: "取消", exact: true }).click()
      await expect(dialog).toHaveCount(0)
      await expect(page.locator(".cmcc-modal-overlay")).toHaveCount(0)
    }
    expect(errors).toEqual([])
  })
}

test("reduced motion disables page, menu and quota dialog animations while keeping their appearance", async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await observePageMotion(page)
  await setupHomePage(page, { models: true })
  await page.route("**/api/dockapi/token-quota", (route) =>
    route.fulfill({
      json: {
        code: 200,
        data: {
          enabled: false,
          vip: false,
          used: 0,
          reserved: 0,
          remaining: null,
          weeklyLimit: null,
          weekStart: 1,
          resetAt: 2,
          hasUnknownUsage: false,
        },
      },
    }),
  )
  await page.goto("/app")
  await page.locator('[data-action="prompt-model"]').click()
  const menu = page.locator(".home-model-menu")
  await expect(menu).toHaveCSS("animation-name", "none")
  await expect(menu).toHaveCSS("border-radius", "12px")
  await expect(menu).not.toHaveCSS("box-shadow", "none")
  await page.getByRole("menuitem", { name: "DeepSeek", exact: true }).hover()
  await expect(page.locator(".home-model-submenu")).toHaveCSS("animation-name", "none")
  await page.screenshot({ path: info.outputPath("model-menu.png") })
  await page.keyboard.press("Escape")
  await page.locator(".cmcc-account-trigger").click()
  await page.getByRole("menuitem", { name: "Token 额度", exact: true }).click()
  const container = page.locator('[data-component="dialog-v2"] [data-slot="dialog-container"]')
  await expect(container).toBeVisible()
  await expect(container).toHaveCSS("animation-name", "none")
  await expect(container).toHaveCSS("border-radius", "20px")
  await expect(container).not.toHaveCSS("box-shadow", "none")
  await page.getByRole("button", { name: "关闭", exact: true }).click()
  await expect(container).toHaveCount(0)
  expect(await starts(page)).toBe(0)
})

test("streaming does not restart page motion, replace the editor or reset manual scrolling", async ({
  page,
  baseURL,
}) => {
  await observePageMotion(page)
  const data = await setupGeneralChat(page, { turns: 3, running: true })
  await page.goto(data.href(baseURL!))
  const editor = page.locator('[data-component="prompt-input"]')
  await expect(editor).toBeVisible()
  await settled(page.locator(".cmcc-page-content"))
  const original = await editor.elementHandle()
  const initial = await starts(page)
  await editor.fill("保留我的后续问题")
  const scroll = page
    .locator(".scroll-view__viewport")
    .filter({ has: page.locator('[data-timeline-row="AssistantPart"]') })
  await scroll.hover()
  await page.mouse.wheel(0, -5000)
  await expect.poll(() => scroll.evaluate((node) => node.scrollTop)).toBeLessThan(80)
  const height = await scroll.evaluate((node) => node.scrollHeight)
  const part = data.messages.at(-1)!.parts.find((part) => part.type === "text")!
  if (!("text" in part) || typeof part.text !== "string") throw new Error("Missing fixture text")
  part.text += "\n\n" + Array(20).fill("后续流式内容，不应触发页面入场动画。\n\n").join("")
  data.events.push({ type: "message.part.updated", properties: { part } })
  await expect.poll(() => scroll.evaluate((node) => node.scrollHeight)).toBeGreaterThan(height)
  expect(await scroll.evaluate((node) => node.scrollTop)).toBeLessThan(80)
  expect(await starts(page)).toBe(initial)
  expect(await original!.evaluate((node) => node.isConnected)).toBe(true)
  await expect(editor).toHaveText("保留我的后续问题")
  expect(data.errors).toEqual([])
})

test("opening the right panel animates its contents without remounting the conversation", async ({ page, baseURL }) => {
  const data = await setupGeneralChat(page, { turns: 1 })
  await page.goto(data.href(baseURL!))
  const editor = page.locator('[data-component="prompt-input"]')
  await expect(editor).toBeVisible()
  const original = await editor.elementHandle()
  await editor.fill("面板开合不丢失草稿")
  const hide = page.getByRole("button", { name: "隐藏右栏", exact: true })
  if (await hide.isVisible()) await hide.click()
  await page.getByRole("button", { name: "展开右栏", exact: true }).click()
  await expect(page.locator("[data-cmcc-side-panel]")).toHaveCSS("animation-name", "cmcc-panel-enter")
  await expect(editor).toHaveText("面板开合不丢失草稿")
  expect(await original!.evaluate((node) => node.isConnected)).toBe(true)
  expect(data.errors).toEqual([])
})
