import { Marked } from "marked"

const parser = new Marked({ async: false })

function citationUrl(element: Element) {
  if (element.closest("pre,code,kbd,samp,script,style,a,[hidden],[aria-hidden='true']")) return
  const text = element.textContent?.trim() ?? ""
  if (!/^https?:\/\/[^\s<>"'`]+$/i.test(text)) return
  try {
    const url = new URL(text)
    if (url.username || url.password) return
    return url.href
  } catch {
    return
  }
}

export function citationNumbers(content: string): ReadonlyMap<string, number> {
  const numbers = new Map<string, number>()
  if (!/<cite\b/i.test(content) || typeof document === "undefined") return numbers
  // A detached template is inert; its nodes are used only to index real cite URLs.
  const template = document.createElement("template")
  template.innerHTML = parser.parse(content, { async: false })
  for (const cite of template.content.querySelectorAll("cite")) {
    const url = citationUrl(cite)
    if (url && !numbers.has(url)) numbers.set(url, numbers.size + 1)
  }
  return numbers
}

export function renderCitations(root: HTMLElement, numbers: ReadonlyMap<string, number>) {
  for (const cite of root.querySelectorAll("cite")) {
    const url = citationUrl(cite)
    const number = url ? numbers.get(url) : undefined
    if (!url || !number) continue
    const sup = root.ownerDocument.createElement("sup")
    sup.className = "gd-report-citation"
    sup.setAttribute("data-research-citation", "true")
    const link = root.ownerDocument.createElement("a")
    link.href = url
    link.title = url
    link.target = "_blank"
    link.rel = "noopener noreferrer"
    link.textContent = String(number)
    sup.appendChild(link)
    cite.replaceWith(sup)
  }
  for (const link of root.querySelectorAll<HTMLAnchorElement>("sup[data-research-citation] > a")) {
    const number = numbers.get(link.href)
    if (number && link.textContent !== String(number)) link.textContent = String(number)
  }
}
