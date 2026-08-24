import { describe, expect, test } from "bun:test"
import { DEEPLENS_SCENES, isDeepLensPath } from "./cmcc-deeplens"

describe("CMCC DeepLens page", () => {
  test("matches only the dedicated DeepLens route", () => {
    expect(isDeepLensPath("/deeplens")).toBe(true)
    expect(isDeepLensPath("/DeepLens/")).toBe(true)
    expect(isDeepLensPath("/deeplens/session")).toBe(false)
  })

  test("contains the complete eight-scene product walkthrough", () => {
    expect(DEEPLENS_SCENES).toHaveLength(8)
    expect(DEEPLENS_SCENES.map((scene) => scene.phase)).toEqual([0, 1, 1, 2, 2, 2, 2, 2])
    expect(DEEPLENS_SCENES.flatMap((scene) => (scene.capability ? [scene.capability] : []))).toEqual([
      "qa",
      "table",
      "questions",
      "research",
    ])
  })
})
