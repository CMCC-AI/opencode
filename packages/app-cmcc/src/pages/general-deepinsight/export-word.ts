import { createResearchWord } from "./word-document"

export async function exportResearchWord(element: HTMLElement, filename: string) {
  const url = URL.createObjectURL(await createResearchWord(element))
  const link = element.ownerDocument.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
