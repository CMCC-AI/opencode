function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

// docx-preview's parsed numbering model is adjusted only for this known legacy Symbol bullet.
export function normalizeDocxSymbolBullets(document: unknown) {
  if (!record(document) || !record(document.numberingPart)) return 0
  const numberings = document.numberingPart.domNumberings
  if (!Array.isArray(numberings)) return 0
  let count = 0
  for (const numbering of numberings) {
    if (!record(numbering) || numbering.format !== "bullet" || numbering.levelText !== "\uf0b7") continue
    if (!record(numbering.rStyle)) continue
    const font = numbering.rStyle["font-family"]
    if (typeof font !== "string" || !/^(?:Symbol|"Symbol"|'Symbol')$/i.test(font.trim())) continue
    numbering.levelText = "\u2022"
    numbering.rStyle["font-family"] = "Arial, sans-serif"
    count++
  }
  return count
}
