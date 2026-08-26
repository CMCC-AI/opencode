import { describe, expect, test } from "bun:test"
import {
  CASE_FILE_PANEL_DEFAULT_WIDTH,
  CASE_FILE_PANEL_MAX_WIDTH,
  CASE_FILE_PANEL_MIN_WIDTH,
  caseFilePanelMaxWidth,
  caseFilePanelWidthAfterDrag,
  clampCaseFilePanelWidth,
} from "./file-panel-layout"

describe("case file panel layout", () => {
  test("clamps persisted widths", () => {
    expect(clampCaseFilePanelWidth(Number.NaN)).toBe(CASE_FILE_PANEL_DEFAULT_WIDTH)
    expect(clampCaseFilePanelWidth(100)).toBe(CASE_FILE_PANEL_MIN_WIDTH)
    expect(clampCaseFilePanelWidth(900)).toBe(CASE_FILE_PANEL_MAX_WIDTH)
  })

  test("keeps enough room for the conversation", () => {
    expect(caseFilePanelMaxWidth(500)).toBe(CASE_FILE_PANEL_MIN_WIDTH)
    expect(caseFilePanelMaxWidth(900)).toBe(540)
    expect(caseFilePanelMaxWidth(1600)).toBe(CASE_FILE_PANEL_MAX_WIDTH)
  })

  test("grows when the left edge moves left", () => {
    expect(caseFilePanelWidthAfterDrag({ startWidth: 420, startX: 900, currentX: 800, maxWidth: 600 })).toBe(520)
    expect(caseFilePanelWidthAfterDrag({ startWidth: 420, startX: 900, currentX: 1100, maxWidth: 600 })).toBe(300)
  })
})
