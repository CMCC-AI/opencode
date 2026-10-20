import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { describe, expect, test } from "bun:test"
import manifest from "./image-optimization.json"

const root = path.resolve(import.meta.dir, "..")
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex")

describe("optimized image assets", () => {
  test("keeps every original and supplies a smaller real WebP derivative", async () => {
    expect(manifest.images.length).toBeGreaterThan(30)
    for (const item of manifest.images) {
      const original = await readFile(path.join(root, item.source))
      const optimized = await readFile(path.join(root, item.output))
      expect(hash(original)).toBe(item.originalSha256)
      expect(hash(optimized)).toBe(item.optimizedSha256)
      expect(original.length).toBe(item.originalBytes)
      expect(optimized.length).toBe(item.optimizedBytes)
      expect(optimized.length).toBeLessThan(original.length)
      expect(optimized.toString("ascii", 0, 4)).toBe("RIFF")
      expect(optimized.toString("ascii", 8, 12)).toBe("WEBP")
      expect(item.quality).toBe(92)
    }
  })

  test("retains animated WebP frames and frame timing", async () => {
    const animated = manifest.images.filter((item) => item.frames > 1)
    expect(animated.length).toBeGreaterThan(1)
    for (const item of animated) {
      const bytes = await readFile(path.join(root, item.output))
      const frames: number[] = []
      let offset = 12
      let loop: number | undefined
      while (offset + 8 <= bytes.length) {
        const type = bytes.toString("ascii", offset, offset + 4)
        const size = bytes.readUInt32LE(offset + 4)
        if (type === "ANIM") loop = bytes.readUInt16LE(offset + 12)
        if (type === "ANMF") frames.push(bytes.readUIntLE(offset + 20, 3))
        offset += 8 + size + (size % 2)
      }
      expect(frames.length).toBe(item.frames)
      expect(frames).toEqual(item.delay)
      expect(loop).toBe(item.loop)
    }
  })

  test("preserves original landing bundle and changes its content-hashed entry", async () => {
    const entry = manifest.rewrites.find(
      (item) => item.source.startsWith("public/landing/assets/") && item.source.endsWith(".js"),
    )
    expect(entry).toBeDefined()
    if (!entry) throw new Error("Missing landing entry")
    expect(entry.output).not.toBe(entry.source)
    const html = await readFile(path.join(root, "public/landing/index.html"), "utf8")
    expect(html).toContain(entry.output.slice(6))
    expect(html).not.toContain(entry.source.slice(6))
    expect((await readFile(path.join(root, entry.source))).length).toBeGreaterThan(0)
    const script = await readFile(path.join(root, entry.output), "utf8")
    for (const image of manifest.images.filter((item) => item.source.startsWith("public/landing/"))) {
      if (script.includes(image.source.slice(6))) throw new Error(`Unoptimized landing reference: ${image.source}`)
    }
  })
})
