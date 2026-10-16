import { base64Encode } from "@opencode-ai/core/util/encode"
import { setupHomePage, homeSession } from "../../startup/home-fixture"
import { benchmark, expect } from "../benchmark"

benchmark.use({ locale: "zh-CN" })

benchmark("measures attachment menus on home and conversation", async ({ page, report, baseURL }) => {
  await setupHomePage(page, { models: true, history: true })
  const measurements = []
  for (const url of ["/app", `/server/${base64Encode(baseURL!)}/session/${homeSession.id}`]) {
    await page.goto(url)
    const editor = page.locator('[data-component="prompt-input"]').last()
    await expect(editor).toBeVisible()
    const before = await editor.boundingBox()
    const start = await page.evaluate(() => performance.now())
    await page.getByRole("button", { name: "打开更多操作" }).click()
    await expect(page.locator('[data-component="cmcc-prompt-action-menu"]')).toBeVisible()
    const after = await editor.boundingBox()
    measurements.push({ url, menuMs: (await page.evaluate(() => performance.now())) - start, before, after })
    if (url === "/app") expect(after).toEqual(before)
    await page.keyboard.press("Escape")
  }
  report({ measurements })
})
