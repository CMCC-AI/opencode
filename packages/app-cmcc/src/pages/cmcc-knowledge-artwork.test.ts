import { expect, test } from "bun:test"

const artwork = [
  { file: "wiki-hero.svg", budget: 3 * 1024 * 1024, format: "webp" },
  { file: "create-notebook-card.svg", budget: 2.2 * 1024 * 1024, format: "png" },
  { file: "notebook-spec-card.svg", budget: 3 * 1024 * 1024, format: "webp" },
]

for (const item of artwork) {
  test(`keeps ${item.file} within its lossless artwork budget`, async () => {
    const file = Bun.file(new URL(`../assets/knowledge/${item.file}`, import.meta.url))
    const source = await file.text()
    expect(file.size).toBeLessThan(item.budget)
    expect(source).toContain(`data:image/${item.format};base64,`)
    expect(source.startsWith("<svg ")).toBe(true)
  })
}
