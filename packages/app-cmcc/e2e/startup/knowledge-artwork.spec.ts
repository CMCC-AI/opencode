import { expect, test } from "@playwright/test"
import { CMCC_KNOWLEDGE_STORAGE_KEY, cmccKnowledgeRoot } from "../../src/utils/cmcc-knowledge"
import { setupHomePage } from "./home-fixture"

test.use({ locale: "zh-CN" })

for (const width of [1440, 390]) {
  test(`Wiki home artwork loads clearly with stable dimensions at ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 })
    await setupHomePage(page)
    const root = cmccKnowledgeRoot("C:/OpenCode")
    const now = Date.now()
    const notebooks = Array.from({ length: 8 }, (_, index) => ({
      id: `wiki-artwork-${index}`,
      name: `图像验收笔记 ${index + 1}`,
      description: "测试数据",
      emoji: "",
      directory: `${root}/artwork-${index}`,
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now - index,
    }))
    await page.addInitScript(({ key, notebooks }) => localStorage.setItem(key, JSON.stringify(notebooks)), {
      key: CMCC_KNOWLEDGE_STORAGE_KEY,
      notebooks,
    })
    await page.route("**/file?*", (route) => {
      const url = new URL(route.request().url())
      const directory =
        url.searchParams.get("directory") ?? decodeURIComponent(route.request().headers()["x-opencode-directory"] ?? "")
      return route.fulfill({
        json:
          directory === root
            ? notebooks.map((notebook, index) => ({
                name: `artwork-${index}`,
                path: `artwork-${index}`,
                absolute: notebook.directory,
                type: "directory",
              }))
            : [],
      })
    })
    await page.goto("/knowledge")
    await expect(page.getByRole("heading", { name: "DeepInsight Wiki", exact: true })).toBeVisible()
    if (width < 760) await page.getByRole("button", { name: "隐藏左栏" }).click()
    const create = page.getByRole("button", { name: "创建笔记", exact: true })
    await expect(create).toBeEnabled()
    const hero = page.locator('img[src*="wiki-hero"]')
    await expect(hero).toHaveAttribute("fetchpriority", "high")
    await expect(hero).toHaveAttribute("decoding", "async")
    await expect(create.locator("img")).toHaveAttribute("loading", "eager")
    await expect(page.locator('img[src*="notebook-spec-card"]').nth(2)).toHaveAttribute("loading", "lazy")
    for (const source of ["wiki-hero", "create-notebook-card", "notebook-spec-card", "notebook-qa"]) {
      const image = page.locator(`img[src*="${source}"]`).first()
      await expect
        .poll(() => image.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0))
        .toBe(true)
    }
    await page.evaluate(() => document.fonts.ready)
    await page.screenshot({ path: info.outputPath("wiki-home.png"), fullPage: true })
    await create.click()
    await expect(page.getByRole("heading", { name: "创建笔记本", exact: true })).toBeVisible()
    await page.screenshot({ path: info.outputPath("create-notebook.png") })
  })
}
