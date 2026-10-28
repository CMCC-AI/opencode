import { describe, expect, test } from "bun:test"
import type { Rollup } from "vite"
import { homePrefetchTags } from "./home-prefetch"

function bundle() {
  return {
    "assets/entry.js": {
      type: "chunk",
      fileName: "assets/entry.js",
      isEntry: true,
      imports: ["assets/shared.js"],
      viteMetadata: { importedCss: new Set(["assets/main.css"]) },
    },
    "assets/shared.js": { type: "chunk", fileName: "assets/shared.js", imports: [] },
    "assets/home.js": {
      type: "chunk",
      fileName: "assets/home.js",
      facadeModuleId: "C:\\app\\src\\pages\\new-session.tsx",
      imports: ["assets/entry.js", "assets/composer.js"],
      dynamicImports: ["assets/pdf.js"],
      viteMetadata: { importedCss: new Set(["assets/home.css"]) },
    },
    "assets/composer.js": {
      type: "chunk",
      fileName: "assets/composer.js",
      imports: ["assets/shared.js", "assets/home.js"],
      viteMetadata: { importedCss: new Set(["assets/main.css", "assets/composer.css"]) },
    },
    "assets/pdf.js": { type: "chunk", fileName: "assets/pdf.js", imports: [] },
  } as unknown as Rollup.OutputBundle
}

describe("homepage resource hints", () => {
  test("deduplicates static dependencies and excludes entry code and optional viewers", () => {
    const tags = homePrefetchTags(bundle(), "/")
    expect(tags.map((tag) => tag.attrs?.content)).toEqual([
      "/assets/home.js",
      "/assets/composer.js",
      "/assets/composer.css",
      "/assets/home.css",
    ])
    expect(tags.every((tag) => tag.tag === "meta" && tag.attrs?.name === "cmcc-home-prefetch")).toBe(true)
  })

  test("respects the deployment base URL", () => {
    expect(homePrefetchTags(bundle(), "/deepinsight/")[0].attrs?.content).toBe("/deepinsight/assets/home.js")
    expect(homePrefetchTags(bundle(), "./")[0].attrs?.content).toBe("./assets/home.js")
  })

  test("fails the build instead of silently using a stale or missing route path", () => {
    expect(() => homePrefetchTags({}, "/")).toThrow("Homepage chunk is missing")
  })
})
