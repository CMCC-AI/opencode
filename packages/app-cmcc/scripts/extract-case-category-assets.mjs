import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"

const sourcePath = process.argv[2]
const outputPath = process.argv[3]

if (!sourcePath || !outputPath) {
  throw new Error("Usage: bun scripts/extract-case-category-assets.mjs <source.svg> <output.svg>")
}

const source = readFileSync(resolve(sourcePath), "utf8")
const titlePath = (gradient) => {
  const pattern = new RegExp(`<path d="[^"]+" fill="url\\(#${gradient}\\)"/>`)
  const value = source.match(pattern)?.[0]
  if (!value) throw new Error(`Missing title path for ${gradient}`)
  return value
}

const output = `<svg xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="gradient-background-deep-research" x1="0" y1="0" x2="0" y2="1">
      <stop stop-color="#EBEFFF" stop-opacity="0.5"/>
      <stop offset="1" stop-color="#FFFFFF" stop-opacity="0.6"/>
    </linearGradient>
    <linearGradient id="gradient-background-government" x1="0" y1="0" x2="0" y2="1">
      <stop stop-color="#E4F3FF" stop-opacity="0.8"/>
      <stop offset="1" stop-color="#E4F3FF" stop-opacity="0.3"/>
    </linearGradient>
    <linearGradient id="gradient-background-inspection" x1="0" y1="0" x2="0" y2="1">
      <stop stop-color="#E5F7F9" stop-opacity="0.8"/>
      <stop offset="1" stop-color="#E5F7F9" stop-opacity="0.3"/>
    </linearGradient>
    <linearGradient id="gradient-background-finance" x1="0" y1="0" x2="0" y2="1">
      <stop stop-color="#FFF9E4" stop-opacity="0.8"/>
      <stop offset="1" stop-color="#FFF8E4" stop-opacity="0.3"/>
    </linearGradient>
    <linearGradient id="gradient-background-recommendation" x1="0" y1="0" x2="0" y2="1">
      <stop stop-color="#EBEFFF" stop-opacity="0.8"/>
      <stop offset="1" stop-color="#EBEFFF" stop-opacity="0.3"/>
    </linearGradient>
    <linearGradient id="gradient-background-science" x1="0" y1="0" x2="0" y2="1">
      <stop stop-color="#E4F3FF" stop-opacity="0.8"/>
      <stop offset="1" stop-color="#E4F3FF" stop-opacity="0.3"/>
    </linearGradient>
    <linearGradient id="gradient-background-marketing" x1="0" y1="0" x2="0" y2="1">
      <stop stop-color="#F7F1FF" stop-opacity="0.8"/>
      <stop offset="1" stop-color="#F7F1FF" stop-opacity="0.3"/>
    </linearGradient>

    <linearGradient id="paint17_linear_786_13459" x1="416" y1="594" x2="480" y2="594" gradientUnits="userSpaceOnUse">
      <stop stop-color="#0099F1"/>
      <stop offset="1" stop-color="#0059E9"/>
    </linearGradient>
    <linearGradient id="paint21_linear_786_13459" x1="884" y1="594" x2="948" y2="594" gradientUnits="userSpaceOnUse">
      <stop stop-color="#0095BB"/>
      <stop offset="1" stop-color="#137A8A"/>
    </linearGradient>
    <linearGradient id="paint25_linear_786_13459" x1="416" y1="848" x2="480" y2="848" gradientUnits="userSpaceOnUse">
      <stop stop-color="#805212"/>
      <stop offset="1" stop-color="#52350C"/>
    </linearGradient>
    <linearGradient id="paint29_linear_786_13459" x1="884" y1="848" x2="948" y2="848" gradientUnits="userSpaceOnUse">
      <stop stop-color="#8800FF"/>
      <stop offset="1" stop-color="#2C5DFF"/>
    </linearGradient>
    <linearGradient id="paint33_linear_786_13459" x1="416" y1="1102" x2="480" y2="1102" gradientUnits="userSpaceOnUse">
      <stop stop-color="#0099F1"/>
      <stop offset="1" stop-color="#0059E9"/>
    </linearGradient>
    <linearGradient id="title-marketing-gradient" x1="0" y1="0" x2="1" y2="0">
      <stop stop-color="#8800FF"/>
      <stop offset="1" stop-color="#A64AA0"/>
    </linearGradient>

    <symbol id="background-deep-research" viewBox="0 0 920 220">
      <rect width="920" height="220" rx="16" fill="url(#gradient-background-deep-research)"/>
    </symbol>
    <symbol id="background-government" viewBox="0 0 420 206">
      <rect width="420" height="206" rx="16" fill="url(#gradient-background-government)"/>
    </symbol>
    <symbol id="background-inspection" viewBox="0 0 420 206">
      <rect width="420" height="206" rx="16" fill="url(#gradient-background-inspection)"/>
    </symbol>
    <symbol id="background-finance" viewBox="0 0 420 206">
      <rect width="420" height="206" rx="16" fill="url(#gradient-background-finance)"/>
    </symbol>
    <symbol id="background-recommendation" viewBox="0 0 420 206">
      <rect width="420" height="206" rx="16" fill="url(#gradient-background-recommendation)"/>
    </symbol>
    <symbol id="background-science" viewBox="0 0 420 206">
      <rect width="420" height="206" rx="16" fill="url(#gradient-background-science)"/>
    </symbol>
    <symbol id="background-marketing" viewBox="0 0 420 206">
      <rect width="420" height="206" rx="16" fill="url(#gradient-background-marketing)"/>
    </symbol>

    <symbol id="title-government" viewBox="416 585 64 18">${titlePath("paint17_linear_786_13459")}</symbol>
    <symbol id="title-inspection" viewBox="884 585 64 18">${titlePath("paint21_linear_786_13459")}</symbol>
    <symbol id="title-finance" viewBox="416 839 64 18">${titlePath("paint25_linear_786_13459")}</symbol>
    <symbol id="title-recommendation" viewBox="884 839 64 18">${titlePath("paint29_linear_786_13459")}</symbol>
    <symbol id="title-science" viewBox="416 1093 64 18">${titlePath("paint33_linear_786_13459")}</symbol>
    <symbol id="title-marketing" viewBox="0 0 64 18">
      <text x="0" y="14" fill="url(#title-marketing-gradient)" font-family="Microsoft YaHei, sans-serif" font-size="16" font-weight="600">AI+营销</text>
    </symbol>
  </defs>
</svg>
`

const target = resolve(outputPath)
mkdirSync(dirname(target), { recursive: true })
writeFileSync(target, output, "utf8")
