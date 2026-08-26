export const CASE_FILE_PANEL_DEFAULT_WIDTH = 420
export const CASE_FILE_PANEL_MIN_WIDTH = 300
export const CASE_FILE_PANEL_MAX_WIDTH = 720

export function caseFilePanelMaxWidth(containerWidth: number) {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) return CASE_FILE_PANEL_MAX_WIDTH
  return Math.max(CASE_FILE_PANEL_MIN_WIDTH, Math.min(CASE_FILE_PANEL_MAX_WIDTH, containerWidth - 360))
}

export function clampCaseFilePanelWidth(value: number, maxWidth = CASE_FILE_PANEL_MAX_WIDTH) {
  if (!Number.isFinite(value)) return CASE_FILE_PANEL_DEFAULT_WIDTH
  return Math.min(Math.max(CASE_FILE_PANEL_MIN_WIDTH, maxWidth), Math.max(CASE_FILE_PANEL_MIN_WIDTH, value))
}

export function caseFilePanelWidthAfterDrag(input: {
  startWidth: number
  startX: number
  currentX: number
  maxWidth: number
}) {
  return clampCaseFilePanelWidth(input.startWidth + input.startX - input.currentX, input.maxWidth)
}
