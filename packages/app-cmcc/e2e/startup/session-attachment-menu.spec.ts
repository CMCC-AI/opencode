import { expect, test } from "@playwright/test"
import { DEEPINSIGHT_LEAD_AGENT } from "../../src/pages/session/deepinsight/page-selection"
import { setupGeneralChat } from "./general-chat.fixture"

test.use({ locale: "zh-CN" })

for (const { name, width, agent } of [
  { name: "classic chat", width: 1440 },
  { name: "classic chat", width: 390 },
  { name: "expert workbench", width: 1440, agent: DEEPINSIGHT_LEAD_AGENT },
]) {
  test(`${name} attachment menu opens above the button without shifting the conversation at ${width}`, async ({
    page,
    baseURL,
  }, info) => {
    await page.setViewportSize({ width, height: 900 })
    const data = await setupGeneralChat(page, { agent, turns: 2 })
    await page.goto(data.href(baseURL!))

    const composer = page.locator('[data-component="session-composer"]')
    const trigger = composer.getByRole("button", { name: "打开更多操作" })
    const messages = agent
      ? page.locator(".deeptrading-scrollbar").filter({ has: page.locator('[data-component="workbench-query-bubble"]') })
      : page.locator(".scroll-view__viewport").filter({ has: page.locator('[data-timeline-part-id="answer-1-text"]') })
    await expect(messages).toBeVisible()
    if (width < 760) {
      await page.getByRole("button", { name: "隐藏左栏" }).click()
      await expect(page.locator('aside[aria-label="CMCC conversations"]')).toHaveCSS("width", "0px")
    }
    await expect(trigger).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    await page.locator(".cmcc-page-content").evaluate((el) =>
      Promise.all(el.getAnimations().map((animation) => animation.finished.catch(() => undefined))),
    )
    if (agent) {
      await expect(messages.getByRole("heading", { name: "研究结论", exact: true })).toHaveCount(2)
      await messages.evaluate((el) => {
        el.scrollTop = 120
      })
      await expect.poll(() => messages.evaluate((el) => el.scrollTop)).toBe(120)
    }

    const layout = async () => ({
      composer: await composer.boundingBox(),
      messages: await messages.boundingBox(),
      scroll: await messages.evaluate((el) => el.scrollTop),
    })
    const before = await layout()
    await trigger.click()
    const menu = page.locator('[data-component="cmcc-prompt-action-menu"]')
    await expect(menu).toBeVisible()
    await menu.evaluate((el) =>
      Promise.all(el.getAnimations().map((animation) => animation.finished.catch(() => undefined))),
    )
    const after = await layout()
    const anchor = (await trigger.boundingBox())!
    const popup = (await menu.boundingBox())!
    await info.attach("attachment-menu-layout", {
      body: JSON.stringify({ before, after, anchor, popup }),
      contentType: "application/json",
    })
    expect(after).toEqual(before)
    expect(popup.y + popup.height).toBeLessThanOrEqual(anchor.y)
    expect(popup.y).toBeGreaterThanOrEqual(0)
    expect(popup.x).toBeGreaterThanOrEqual(0)
    expect(popup.x + popup.width).toBeLessThanOrEqual(width)
    await page.screenshot({ path: info.outputPath("attachment-menu.png") })

    await page.keyboard.press("Escape")
    await expect(menu).toHaveCount(0)
    expect(await layout()).toEqual(before)
    await trigger.click()
    const chooser = page.waitForEvent("filechooser")
    await menu.getByRole("button", { name: "添加文件和图片" }).click()
    await chooser
    await expect(menu).toHaveCount(0)
    expect(data.errors).toEqual([])
  })
}
