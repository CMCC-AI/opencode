import { createHash } from "node:crypto"
import { readFile, readdir, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)
const sharp = require(process.env.IMAGE_SHARP_MODULE || "sharp")
const ts = require("typescript")
const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)))
const quality = 92
const svg = new Set([
  "src/assets/knowledge/wiki-hero.svg",
  "src/assets/knowledge/create-notebook-card.svg",
  "src/assets/knowledge/notebook-spec-card.svg",
])
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex")
sharp.concurrency(1)
sharp.cache({ memory: 32 })

async function files(directory) {
  const result = []
  for (const entry of await readdir(path.join(root, directory), { withFileTypes: true })) {
    const name = `${directory}/${entry.name}`
    if (entry.isDirectory()) result.push(...(await files(name)))
    if (entry.isFile()) result.push(name)
  }
  return result
}

const inputs = [
  ...(await files("src/assets")),
  ...(await files("public/landing")),
  ...(await files("public/mstock")),
  ...(await files("public/product-intro")),
].sort()
const images = []
const previous = await readFile(path.join(root, "scripts/image-optimization.json"), "utf8")
  .then(JSON.parse)
  .catch((error) => {
    if (error.code === "ENOENT") return { images: [] }
    throw error
  })
let browser
try {
  for (const source of inputs) {
    if (source.includes(".optimized.") || /qr-code|favicon|apple-touch|manifest-/.test(source)) continue
    if (!svg.has(source) && !/\.(png|jpe?g|gif|webp)$/.test(source)) continue
    const original = await readFile(path.join(root, source))
    if (original.length < 20 * 1024) continue
    // Existing small/lossy WebP assets must not accumulate another lossy encode.
    if (source.endsWith(".webp") && (original.length < 128 * 1024 || !original.includes(Buffer.from("VP8L")))) continue
    const cached = previous.images.find(
      (item) =>
        item.source === source &&
        item.quality === quality &&
        item.originalSha256 === hash(original) &&
        (!svg.has(source) || item.renderer === "chromium"),
    )
    if (cached && hash(await readFile(path.join(root, cached.output))) === cached.optimizedSha256) {
      images.push(cached)
      continue
    }
    const input = { animated: true, ...(svg.has(source) ? { density: 144 } : {}) }
    const before = await sharp(original, input).metadata()
    let raster = original
    if (svg.has(source)) {
      const { chromium } = require("@playwright/test")
      browser ??= await chromium.launch({
        headless: true,
        ...(process.env.IMAGE_CHROME_EXECUTABLE ? { executablePath: process.env.IMAGE_CHROME_EXECUTABLE } : {}),
      })
      const page = await browser.newPage()
      // Chrome matches the shipped SVG masks, filters, and embedded WebP images.
      const rendered = await page.evaluate(
        async ({ uri, width, height }) => {
          const image = new Image()
          image.src = uri
          await image.decode()
          const canvas = document.createElement("canvas")
          canvas.width = width
          canvas.height = height
          canvas.getContext("2d").drawImage(image, 0, 0, width, height)
          return canvas.toDataURL("image/png").split(",")[1]
        },
        { uri: `data:image/svg+xml;base64,${original.toString("base64")}`, width: before.width, height: before.height },
      )
      await page.close()
      raster = Buffer.from(rendered, "base64")
    }
    const result = await sharp(raster, svg.has(source) ? {} : input)
      .webp({ quality, alphaQuality: 100, smartSubsample: true, effort: before.pages ? 4 : 6 })
      .toBuffer()
    if (result.length >= original.length) continue
    const after = await sharp(result, { animated: true }).metadata()
    if (after.width !== before.width || after.height !== before.height || (after.pages || 1) !== (before.pages || 1)) {
      throw new Error(`Image dimensions/frame count changed: ${source}`)
    }
    if (JSON.stringify(after.delay) !== JSON.stringify(before.delay) || after.loop !== before.loop) {
      throw new Error(`Animation timing changed: ${source}`)
    }
    const output = source.replace(/\.[^.]+$/, ".optimized.webp")
    await writeFile(path.join(root, output), result)
    images.push({
      source,
      output,
      quality,
      originalBytes: original.length,
      optimizedBytes: result.length,
      originalSha256: hash(original),
      optimizedSha256: hash(result),
      width: after.width,
      height: after.pageHeight || after.height,
      frames: after.pages || 1,
      ...(svg.has(source) ? { renderer: "chromium" } : {}),
      ...(after.delay ? { delay: after.delay, loop: after.loop } : {}),
    })
    console.log(`${source}: ${original.length} -> ${result.length}`)
  }
} finally {
  await browser?.close()
}

const outputs = new Map(images.map((item) => [item.source, item.output]))
function reference(value, filename) {
  const suffix = value.match(/[?#].*$/)?.[0] || ""
  const resource = value.slice(0, value.length - suffix.length)
  const source = resource.startsWith("@/")
    ? `src/${resource.slice(2)}`
    : resource.startsWith("/")
      ? `public${resource}`
      : resource.startsWith(".") || filename.startsWith("public/")
        ? path.posix.normalize(path.posix.join(path.posix.dirname(filename), resource))
        : ""
  const output = outputs.get(source)
  if (!output) return value
  if (resource.startsWith("@/")) return `@/${output.slice(4)}${suffix}`
  if (resource.startsWith("/")) return `${output.slice(6)}${suffix}`
  const relative = path.posix.relative(path.posix.dirname(filename), output)
  return `${resource.startsWith(".") && !relative.startsWith(".") ? "./" : ""}${relative}${suffix}`
}

function scriptReferences(text, filename) {
  const source = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true)
  const edits = []
  function visit(node) {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const next = reference(node.text, filename)
      if (next !== node.text) edits.push({ start: node.getStart(source), end: node.end, next: JSON.stringify(next) })
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return edits
    .sort((a, b) => b.start - a.start)
    .reduce((value, edit) => value.slice(0, edit.start) + edit.next + value.slice(edit.end), text)
}

function markupReferences(text, filename) {
  return text
    .replace(
      /\b(src|href)=(['"])([^'"\s]+)\2/g,
      (all, name, quote, value) => `${name}=${quote}${reference(value, filename)}${quote}`,
    )
    .replace(
      /url\(\s*(['"]?)([^'"\s)]+)\1\s*\)/g,
      (all, quote, value) => `url(${quote}${reference(value, filename)}${quote})`,
    )
    .replace(/<link\b[^>]*>/g, (tag) =>
      tag.includes('rel="icon"') && tag.includes(".optimized.webp")
        ? tag.replace('type="image/png"', 'type="image/webp"')
        : tag,
    )
}

const rewrites = previous.rewrites || []
for (const filename of [...(await files("src")), ...inputs]) {
  if (!/\.(tsx?|jsx?|css|html)$/.test(filename)) continue
  if (filename.includes(".test.") || filename.includes("/index-images-")) continue
  const original = await readFile(path.join(root, filename), "utf8")
  const next = /\.[jt]sx?$/.test(filename) ? scriptReferences(original, filename) : markupReferences(original, filename)
  if (next === original) continue
  // Public landing bundles already have immutable content-hashed names.
  if (filename.startsWith("public/landing/assets/") && /\.(js|css)$/.test(filename)) {
    const target = `public/landing/assets/index-images-${hash(next).slice(0, 12)}${path.extname(filename)}`
    await writeFile(path.join(root, target), next)
    const index = path.join(root, "public/landing/index.html")
    const html = await readFile(index, "utf8")
    await writeFile(index, html.replaceAll(filename.slice(6), target.slice(6)))
    if (!rewrites.some((item) => item.source === filename && item.output === target))
      rewrites.push({ source: filename, output: target })
    continue
  }
  await writeFile(path.join(root, filename), next)
  if (!rewrites.some((item) => item.source === filename)) rewrites.push({ source: filename, output: filename })
}

await writeFile(
  path.join(root, "scripts/image-optimization.json"),
  JSON.stringify({ images, rewrites }, null, 2) + "\n",
)
const total = images.reduce(
  (sum, item) => ({ before: sum.before + item.originalBytes, after: sum.after + item.optimizedBytes }),
  { before: 0, after: 0 },
)
console.log(
  JSON.stringify({
    images: images.length,
    ...total,
    savedPercent: (100 * (1 - total.after / total.before)).toFixed(1),
  }),
)
