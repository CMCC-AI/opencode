import { expect, type Locator, type Page } from "@playwright/test"

export async function expectPageBrandBar(page: Page, title: Locator) {
  const bar = page.locator(".cmcc-page-brandbar")
  const logo = bar.getByRole("img", { name: "移动智能 MobileAI", exact: true })
  await expect(bar).toHaveCount(1)
  await expect(bar).toHaveCSS("height", "56px")
  await expect(logo).toHaveAttribute("src", "/brand/mobileai-horizontal.svg")
  await expect
    .poll(() => logo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0))
    .toBe(true)

  const [barBounds, logoBounds, titleBounds] = await Promise.all([bar.boundingBox(), logo.boundingBox(), title.boundingBox()])
  expect(titleBounds!.y).toBeGreaterThanOrEqual(barBounds!.y + barBounds!.height)
  if (page.viewportSize()!.width < 768) {
    expect(barBounds!.x + barBounds!.width - logoBounds!.x - logoBounds!.width).toBeCloseTo(4, 0)
  } else {
    expect(logoBounds!.x - barBounds!.x).toBeCloseTo(4, 0)
  }
}
