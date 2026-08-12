import { describe, expect, test } from "bun:test"
import { parseExcelPreview } from "./excel-preview"

describe("excel preview", () => {
  test("parses sheets, formatted values, and merged cells", async () => {
    const { utils, write } = await import("xlsx")
    const workbook = utils.book_new()
    const summary = utils.aoa_to_sheet([
      ["企业经营概览", undefined],
      ["月份", "营业收入"],
      ["2025-01", 1200],
    ])
    summary["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }]
    utils.book_append_sheet(workbook, summary, "数据概览")
    utils.book_append_sheet(workbook, utils.aoa_to_sheet([["行业", "制造业"]]), "企业数据")

    const result = await parseExcelPreview(write(workbook, { type: "array", bookType: "xlsx" }))

    expect(result.sheets.map((sheet) => sheet.name)).toEqual(["数据概览", "企业数据"])
    expect(result.sheets[0]?.rows[0]?.[0]).toMatchObject({ value: "企业经营概览", colSpan: 2, rowSpan: 1 })
    expect(result.sheets[0]?.rows[0]?.[1]?.hidden).toBe(true)
    expect(result.sheets[0]?.rows[2]?.[1]?.value).toBe("1200")
    expect(result.sheets[0]?.rows).toHaveLength(20)
    expect(result.sheets[0]?.columnWidths).toHaveLength(12)
  })

  test("limits oversized worksheets for responsive previews", async () => {
    const { utils, write } = await import("xlsx")
    const workbook = utils.book_new()
    const sheet = utils.aoa_to_sheet([["start"]])
    sheet["!ref"] = "A1:CW1001"
    utils.book_append_sheet(workbook, sheet, "large")

    const result = await parseExcelPreview(write(workbook, { type: "array", bookType: "xlsx" }))

    expect(result.sheets[0]?.rows).toHaveLength(1_000)
    expect(result.sheets[0]?.columnWidths).toHaveLength(100)
    expect(result.sheets[0]?.truncated).toBe(true)
  })
})
