import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { describe, expect, test } from "bun:test"

const root = new URL("../", import.meta.url)

describe("MobileAI brand assets", () => {
  for (const asset of [
    {
      file: "logo.svg",
      bytes: 2583,
      sha256: "201e9a073762a735bfc9dc72b13b0d88cdd15edea6be0b1223e3fcf074ca09df",
      viewBox: "0 0 37 40",
    },
    {
      file: "mobileai-horizontal.svg",
      bytes: 10868,
      sha256: "9be32a31c6cf2e4bfaaaaf387c6288f704d9399ac876ae7a49ec3093cb603ae6",
      viewBox: "0 0 174.7 63.66",
    },
  ])
    test(`${asset.file} retains the exact supplied SVG`, async () => {
      const bytes = await readFile(new URL(`public/brand/${asset.file}`, root))
      expect(bytes.length).toBe(asset.bytes)
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(asset.sha256)
      expect(bytes.toString("utf8")).toContain(`viewBox="${asset.viewBox}"`)
    })

  test("application entrypoints share the public artwork", async () => {
    for (const file of ["src/components/session/session-new-design-view.tsx", "src/pages/cmcc-deeplens.tsx"])
      expect(await readFile(new URL(file, root), "utf8")).toContain('src="/brand/logo.svg"')
    const layout = await readFile(new URL("src/pages/layout-new.tsx", root), "utf8")
    expect(layout).toContain('src="/brand/mobileai-horizontal.svg"')
    expect(layout).not.toContain("jiutian-sidebar-logo.optimized.webp")
    const index = await readFile(new URL("index.html", root), "utf8")
    expect(index).toContain('rel="icon" type="image/svg+xml" href="/brand/logo.svg"')
    expect(index).toContain('src="/brand/startup-loading.svg"')
    expect(await readFile(new URL("src/components/app-loading.tsx", root), "utf8")).toContain(
      'src="/brand/startup-loading.svg"',
    )
  })

  test("static pages use the same SVG without retaining a cached old logo module", async () => {
    const landing = await readFile(new URL("public/landing/index.html", root), "utf8")
    expect(landing).toContain('rel="icon" type="image/svg+xml" href="/brand/logo.svg"')
    expect(landing).toContain("index-8nu-FAeN.js?v=mobileai-201e9a073762")
    const script = await readFile(new URL("public/landing/assets/index-8nu-FAeN.js", root), "utf8")
    expect(script).toContain('const Bn="/brand/logo.svg"')
    expect(script).not.toContain("jiutian-logo-color-DUfDrg8o.webp")
    expect(script).toContain('style="object-fit:contain" alt="九天智能"')
    const introduction = await readFile(new URL("public/product-intro/index.html", root), "utf8")
    expect(introduction).toContain('class="brand-mark" src="/brand/logo.svg"')
    expect(introduction).not.toContain('src="assets/jiutian-logo.png"')
  })
})
