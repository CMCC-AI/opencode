import { expect, test } from "bun:test"
import { normalizeDocxSymbolBullets } from "./docx-preview"

test("normalizes the known Symbol round bullet and keeps numbering layout", () => {
  const item = {
    id: "7",
    level: 2,
    start: 3,
    format: "bullet",
    levelText: "\uf0b7",
    suff: "tab",
    pStyle: { "margin-left": "18pt", "text-indent": "-9pt" },
    rStyle: { "font-family": '"Symbol"', color: "red" },
  }
  const document = { numberingPart: { domNumberings: [item] } }
  expect(normalizeDocxSymbolBullets(document)).toBe(1)
  expect(item).toEqual({
    id: "7",
    level: 2,
    start: 3,
    format: "bullet",
    levelText: "\u2022",
    suff: "tab",
    pStyle: { "margin-left": "18pt", "text-indent": "-9pt" },
    rStyle: { "font-family": "Arial, sans-serif", color: "red" },
  })
  expect(normalizeDocxSymbolBullets(document)).toBe(0)
})

test("leaves numbering, ordinary bullets, other symbol fonts and unknown structures intact", () => {
  const items = [
    { format: "decimal", levelText: "%1.", rStyle: { "font-family": "Symbol" } },
    { format: "bullet", levelText: "\u2022", rStyle: { "font-family": "Arial" } },
    { format: "bullet", levelText: "\uf0b7", rStyle: { "font-family": "Wingdings" } },
    { format: "bullet", levelText: "\uf0a7", rStyle: { "font-family": "Symbol" } },
    { format: "bullet", levelText: "\uf0b7" },
  ]
  const document = { numberingPart: { domNumberings: items } }
  const before = JSON.stringify(document)
  expect(normalizeDocxSymbolBullets(document)).toBe(0)
  expect(JSON.stringify(document)).toBe(before)
  for (const value of [undefined, null, {}, { numberingPart: null }, { numberingPart: { domNumberings: {} } }]) {
    expect(normalizeDocxSymbolBullets(value)).toBe(0)
  }
})
