import { describe, expect, test } from "bun:test"
import { parseExcelPreview } from "./excel-preview"

describe("excel preview", () => {
  test("decodes BOM-less UTF-8 CSV and preserves codes, dates and decimal precision", async () => {
    const data = new TextEncoder().encode(
      'Code,Name,Date,Price,Note\r\n000001,平安银行,2026-09-21,11.70,"包含逗号,和换行\n第二行"\r\n600519,贵州茅台,2026-09-21,1259.00,"引号""测试"',
    ).buffer
    const result = await parseExcelPreview(data, "stocks.CSV")
    expect(result.sheets[0].rows[1].slice(0, 5).map((cell) => cell.value)).toEqual([
      "000001",
      "平安银行",
      "2026-09-21",
      "11.70",
      "包含逗号,和换行\n第二行",
    ])
    expect(result.sheets[0].rows[2][1].value).toBe("贵州茅台")
    expect(result.sheets[0].rows[2][4].value).toBe('引号"测试')
  })

  test("recognizes UTF-8 and UTF-16 BOMs", async () => {
    const text = "代码,名称\r\n000001,平安银行"
    const utf8 = new TextEncoder().encode("\ufeff" + text).buffer
    const utf16 = (littleEndian: boolean) => {
      const bytes = new Uint8Array((text.length + 1) * 2)
      const view = new DataView(bytes.buffer)
      view.setUint16(0, 0xfeff, littleEndian)
      for (let i = 0; i < text.length; i++) view.setUint16((i + 1) * 2, text.charCodeAt(i), littleEndian)
      return bytes.buffer
    }
    for (const data of [utf8, utf16(true), utf16(false)]) {
      const result = await parseExcelPreview(data, "data.csv")
      expect(result.sheets[0].rows[0][0].value).toBe("代码")
      expect(result.sheets[0].rows[1][0].value).toBe("000001")
      expect(result.sheets[0].rows[1][1].value).toBe("平安银行")
    }
  })

  test("reports unsupported text encoding instead of silently showing mojibake", async () => {
    await expect(parseExcelPreview(new Uint8Array([0xc4, 0xe3, 0xba, 0xc3]).buffer, "data.csv")).rejects.toThrow(
      "CSV 文本编码无法识别",
    )
  })

  test("does not misread BOM-less UTF-16 as ASCII with NUL characters", async () => {
    await expect(parseExcelPreview(new Uint8Array([65, 0, 44, 0, 66, 0]).buffer, "data.csv")).rejects.toThrow(
      "CSV 文本编码无法识别",
    )
  })

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
