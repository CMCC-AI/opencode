import { describe, expect, test } from "bun:test"
import { isWordDocument, safeUploadedFilename } from "./word-documents"

describe("Word document attachments", () => {
  test("recognizes DOC and DOCX without extracting body text in the browser", () => {
    expect(isWordDocument(new File([""], "report.docx"), "")).toBe(true)
    expect(isWordDocument(new File([""], "report.doc"), "")).toBe(true)
    expect(isWordDocument(new File([""], "report.txt"), "text/plain")).toBe(false)
  })

  test("removes path separators from uploaded filenames", () => {
    expect(safeUploadedFilename("../项目\\报告.docx")).toBe(".._项目_报告.docx")
  })
})
