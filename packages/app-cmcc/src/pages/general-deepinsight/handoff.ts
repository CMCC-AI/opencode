import type { ResearchDetail } from "./model"

let handoff: { userId: number; caseCode: string; detail: ResearchDetail } | undefined
let draft: { userId: number; query: string } | undefined
export function prepareResearchDraft(userId: number, query: string) {
  draft = { userId, query }
}
export function takeResearchDraft(userId: number) {
  const current = draft
  draft = undefined
  return current?.userId === userId ? current.query : undefined
}
export function prepareResearchCase(userId: number, caseCode: string, detail: ResearchDetail) {
  handoff = { userId, caseCode, detail }
}
export function takeResearchCase(userId: number, caseCode: string) {
  const current = handoff
  handoff = undefined
  return current?.userId === userId && current.caseCode === caseCode ? current.detail : undefined
}
