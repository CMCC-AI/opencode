import { expect, test } from "@playwright/test"
import { CMCC_KNOWLEDGE_STORAGE_KEY, cmccKnowledgeRoot } from "../../src/utils/cmcc-knowledge"
import { expectPageBrandBar } from "../utils/expect-page-brand-bar"
import { setupHomePage } from "./home-fixture"

test.use({ locale: "zh-CN" })

for (const width of [1440, 1024, 390, 320]) {
  test(`Wiki home preserves notebook actions and artwork at ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 })
    await setupHomePage(page)
    const root = cmccKnowledgeRoot("C:/OpenCode")
    const now = Date.now()
    const notebooks = Array.from({ length: 13 }, (_, index) => ({
      id: `wiki-artwork-${index}`,
      name: `图像验收笔记 ${index + 1}`,
      description: "测试数据",
      emoji: "",
      directory: `${root}/artwork-${index}`,
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now - index,
    }))
    await page.addInitScript(({ key, notebooks }) => {
      if (window === window.top && !localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(notebooks))
    }, {
      key: CMCC_KNOWLEDGE_STORAGE_KEY, notebooks,
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
    const createdDirectories: string[] = []
    await page.route("**/file/directory*", (route) => {
      const { path } = route.request().postDataJSON() as { path: string }
      if (path !== root) createdDirectories.push(path)
      return route.fulfill({ json: { path } })
    })
    await page.goto("/knowledge")
    const title = page.getByRole("heading", { name: "DeepInsight Wiki", exact: true })
    const subtitle = page.getByText("从原始材料到可对话的知识网络", { exact: true })
    await expect(title).toBeVisible()
    await expect(title).toHaveCSS("font-weight", "700")
    await expect(subtitle).toHaveCSS("color", "rgb(114, 118, 124)")
    if (width < 760) {
      await page.getByRole("button", { name: "隐藏左栏" }).click()
      await expect(page.locator('aside[aria-label="CMCC conversations"]')).toHaveCSS("width", "0px")
    }
    await expectPageBrandBar(page, title)
    const introButton = page.locator(".cmcc-page-brandbar").getByRole("button", { name: "产品介绍", exact: true })
    await expect(introButton).toBeVisible()
    const banner = page.getByRole("region", { name: "AI 知识库" })
    const recent = page.getByRole("region", { name: "最近打开笔记" })
    const bannerCreate = banner.getByRole("button", { name: "创建笔记", exact: true })
    const cardCreate = recent.getByRole("button", { name: "创建笔记", exact: true })
    await expect(bannerCreate).toBeEnabled()
    await expect(cardCreate).toBeEnabled()
    await expect(banner).toContainText("并保留每一条知识的来源和上下文")
    const heading = (await title.boundingBox())!
    expect((await subtitle.boundingBox())!.y - heading.y - heading.height).toBeGreaterThanOrEqual(10)

    const original = banner.locator('img[src*="wiki-banner"]')
    const wide = width === 1440
    if (wide) {
      await expect(original).toBeVisible()
      await expect(bannerCreate).toHaveClass("cmcc-wiki-banner-hotspot")
      const image = (await original.boundingBox())!
      const button = (await bannerCreate.boundingBox())!
      const region = (await banner.boundingBox())!
      const card = (await cardCreate.boundingBox())!
      const scale = image.width / 928
      expect(image.height).toBeCloseTo(199 * scale, 1)
      expect(image.x + 8 * scale).toBeCloseTo(heading.x, 1)
      expect(image.x + 8 * scale).toBeCloseTo(card.x, 1)
      expect(image.x + 920 * scale).toBeCloseTo(region.x + region.width, 1)
      expect(button.x - image.x).toBeCloseTo(739 * scale, 1)
      expect(button.y - image.y).toBeCloseTo(121 * scale, 1)
      expect(button.width).toBeCloseTo(141 * scale, 1)
      expect(button.height).toBeCloseTo(42 * scale, 1)
    } else {
      await expect(original).toBeHidden()
      for (const label of ["导入来源", "llm-wiki 解析", "生成图谱", "知识更新"])
        await expect(banner.getByText(label, { exact: true })).toBeVisible()
    }
    await expect(cardCreate.locator("img")).toHaveAttribute("loading", "eager")
    await expect(page.locator('img[src*="notebook-spec-card"]').nth(2)).toHaveAttribute("loading", "lazy")
    for (const image of [
      wide ? original : bannerCreate.locator("img"),
      cardCreate.locator("img"),
      page.locator('img[src*="notebook-spec-card"]').first(),
      page.locator('img[src*="notebook-qa"]').first(),
    ]) {
      await expect
        .poll(() => image.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0))
        .toBe(true)
    }
    for (const item of [banner, bannerCreate, cardCreate, recent.locator("article").first()]) {
      const box = (await item.boundingBox())!
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(width)
    }
    await expect(recent.locator("article")).toHaveCount(11)
    await page.evaluate(() => document.fonts.ready)
    await page.screenshot({ path: info.outputPath("wiki-home.png"), fullPage: true })

    if (width === 1440) {
      await recent.getByRole("button", { name: /展开全部/ }).click()
      await expect(recent.locator("article")).toHaveCount(notebooks.length)
      await recent.getByRole("button", { name: /收起/ }).click()
      await expect(recent.locator("article")).toHaveCount(11)
      const more = recent.getByRole("button", { name: `更多${notebooks[0].name}`, exact: true })
      await more.click()
      await expect(recent.locator(".cmcc-wiki-note-menu")).toHaveCSS("background-color", "rgb(255, 255, 255)")
      await expect(recent.getByRole("button", { name: "删除", exact: true })).toHaveCSS("background-color", "rgb(255, 255, 255)")
      await recent.getByRole("button", { name: /置顶$/ }).click()
      await expect(recent.getByTitle("已置顶")).toBeVisible()
      await more.click()
      await recent.getByRole("button", { name: "修改标题", exact: true }).click()
      await expect(page.getByRole("textbox", { name: "笔记本标题" })).toHaveValue(notebooks[0].name)
      await page.getByRole("button", { name: "取消", exact: true }).click()
      await more.click()
      await recent.getByRole("button", { name: "删除", exact: true }).click()
      const deletion = page.getByRole("dialog", { name: "删除笔记本", exact: true })
      await expect(deletion).toHaveAttribute("data-cmcc-delete-confirmation", "")
      await expect(deletion).toHaveCSS("background-color", "rgb(255, 255, 255)")
      await expect(deletion).toHaveCSS("border-radius", "14px")
      await expect(deletion.getByRole("button", { name: "确认删除", exact: true })).toHaveCSS("color", "rgb(255, 255, 255)")
      await deletion.screenshot({ path: info.outputPath("wiki-delete-dialog.png") })
      await page.getByRole("button", { name: "取消", exact: true }).click()
      await expect(recent.locator("article")).toHaveCount(11)
    }

    await introButton.click()
    const intro = page.locator('iframe[title="产品介绍"]')
    await expect(intro).toBeVisible()
    await expect(intro).toHaveAttribute("src", "/product-intro/index.html")
    await page.getByRole("button", { name: "关闭", exact: true }).click()
    await expect(intro).toHaveCount(0)

    const [first, second] = width >= 760 ? [cardCreate, bannerCreate] : [bannerCreate, cardCreate]
    const dialogTitle = page.getByRole("heading", { name: "创建笔记本", exact: true })
    if (wide) {
      await bannerCreate.focus()
      await expect(bannerCreate).toBeFocused()
      await page.keyboard.press("Enter")
      await expect(dialogTitle).toBeVisible()
      await page.getByRole("button", { name: "取消", exact: true }).click()
    }
    await first.click()
    await expect(dialogTitle).toBeVisible()
    await page.screenshot({ path: info.outputPath("create-notebook.png") })
    await page.getByRole("button", { name: "取消", exact: true }).click()
    await expect(dialogTitle).toHaveCount(0)
    expect(createdDirectories).toEqual([])
    await second.click()
    await expect(dialogTitle).toBeVisible()
    const name = `验收新笔记 ${width}`
    await page.getByPlaceholder("例如：跨境数据合规研究").fill(name)
    await page.getByRole("button", { name: "创建任务笔记本" }).click()
    await expect(page).toHaveURL(/\/knowledge\/[^/]+$/)
    expect(createdDirectories).toHaveLength(1)
    expect(createdDirectories[0].startsWith(`${root}/`)).toBe(true)
    const id = new URL(page.url()).pathname.split("/").at(-1)
    const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "[]"), CMCC_KNOWLEDGE_STORAGE_KEY)
    expect(saved).toContainEqual(expect.objectContaining({ id, name, directory: createdDirectories[0] }))
  })
}
