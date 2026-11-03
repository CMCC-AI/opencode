import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { describe, expect, test } from "bun:test"

const root = new URL("../", import.meta.url)

describe("startup loading artwork", () => {
  test("retains the supplied vector without embedding a bitmap", async () => {
    const bytes = await readFile(new URL("public/brand/startup-loading.svg", root))
    expect(bytes.length).toBe(9249)
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      "7bd8ece5e10f3186a63e55933cfa20ac40d0b0928d02826a92682e4f1899bca5",
    )
    expect(bytes.toString()).toContain('viewBox="0 0 262 294"')
    expect(bytes.toString()).not.toMatch(/<image\b|<script\b|<animate\b|data:image/i)
  })

  test("both loading stages use the same preloaded vector and native text", async () => {
    const index = await readFile(new URL("index.html", root), "utf8")
    const component = await readFile(new URL("src/components/app-loading.tsx", root), "utf8")
    for (const source of [index, component]) {
      expect(source).toContain('src="/brand/startup-loading.svg"')
      expect(source).toContain('width="262"')
      expect(source).toContain('height="294"')
      expect(source).toContain('fetchpriority="high"')
      expect(source).toContain('class="app-loading-title" aria-label="DeepInsight"')
      expect(source).toContain('class="app-loading-label" aria-label="系统加载中..."')
      expect(source).not.toContain("startup-loading-logo.webp")
      expect(source).not.toContain("startup-loading-logo.optimized.webp")
    }
    expect(index).toContain('rel="preload" as="image" href="/brand/startup-loading.svg"')
    expect(index).toContain('href="/src/assets/auth/startup-loading-background.webp"')
    const css = await readFile(new URL("src/components/app-loading.css", root), "utf8")
    expect(css).toContain('url("../assets/auth/startup-loading-background.webp")')
    expect(css).not.toContain('url("../assets/auth/startup-loading.webp")')
  })

  test("keeps the original artwork available for rollback", async () => {
    for (const file of ["startup-loading.webp", "startup-loading-logo.webp", "startup-loading-logo.optimized.webp"])
      expect((await readFile(new URL(`src/assets/auth/${file}`, root))).length).toBeGreaterThan(0)
    const background = await readFile(new URL("src/assets/auth/startup-loading-background.webp", root))
    expect(background.toString("ascii", 0, 4)).toBe("RIFF")
    expect(background.toString("ascii", 8, 12)).toBe("WEBP")
    expect(background.length).toBeLessThan(20_000)
  })
})
