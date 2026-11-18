import { expect, type Page } from "@playwright/test"

const statSymbols: Record<string, string> = {
  思考时间: "elapsed",
  "消耗 token": "tokens",
  深度分析: "analysis",
  专家团: "experts",
  报告篇幅: "report-length",
  可视化图表: "charts",
  信息源: "sources",
  推荐商品: "products",
  科研产物: "artifacts",
}

export async function expectTeamStatIcons(page: Page) {
  const cards = page.locator("[data-workbench-stats] > div")
  await expect(cards).toHaveCount(4)
  for (const card of await cards.all()) {
    const label = await card.locator("strong").locator("../span").innerText()
    const use = card.locator("svg use")
    await expect(use).toHaveAttribute("href", new RegExp(`#${statSymbols[label.trim()]}$`))
    await expect.poll(() => use.evaluate(el => (el as SVGUseElement).getBBox().width)).toBeGreaterThan(0)
    await expect(card).toHaveCSS("min-height", "64px")
  }
}

export async function expectTeamSurfaceColors(page: Page) {
  const panel = page.locator("[data-workbench-team-panel]")
  const details = panel.locator(":scope > section:last-child")
  const color = await details.evaluate((section) => {
    const background = getComputedStyle(section).backgroundColor
    return background === "rgba(0, 0, 0, 0)" ? getComputedStyle(section.parentElement!).backgroundColor : background
  })
  const cards = page.locator("[data-workbench-stats] > div")
  await expect(cards).toHaveCount(4)
  for (const card of await cards.all()) await expect(card).toHaveCSS("background-color", color)
  await expect(panel.locator('section[aria-label$="DAG"]')).toHaveCSS("background-color", color)
}

export async function expectTeamPanelResize(page: Page) {
  const panel = page.locator("[data-workbench-team-panel]")
  const separator = panel.getByRole("separator", { name: "调整图谱和详情高度" })
  if (page.viewportSize()!.width < 768) {
    await expect(separator).toBeHidden()
    await expect(panel).not.toHaveAttribute("data-team-panel-sized")
    return
  }

  const dag = panel.locator('section[aria-label$="DAG"]')
  const details = panel.locator(":scope > section:last-child")
  const detailsHeight = () => details.evaluate((element) => element.clientHeight)
  const dagHeight = () => dag.evaluate((element) => element.clientHeight)
  const baseline = await detailsHeight()
  const baselineDag = await dagHeight()
  const size = (await separator.boundingBox())!
  const x = size.x + size.width / 2
  const y = size.y + size.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  try {
    await page.mouse.move(x, y - 72, { steps: 4 })
    await expect.poll(detailsHeight).toBeGreaterThan(baseline + 12)
    await expect.poll(dagHeight).toBeLessThan(baselineDag - 12)
    await page.mouse.move(x, y + 72, { steps: 4 })
    await expect.poll(detailsHeight).toBeLessThan(baseline)
    await expect.poll(dagHeight).toBeGreaterThan(baselineDag)
  } finally {
    await page.mouse.up()
  }
  await expect(panel).toHaveAttribute("data-team-panel-sized", "")
  const shrunk = await detailsHeight()
  await separator.press("ArrowUp")
  await expect.poll(detailsHeight).toBeGreaterThan(shrunk)
}
