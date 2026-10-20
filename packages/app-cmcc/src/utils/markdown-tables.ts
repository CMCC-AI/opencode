export function wrapMarkdownTables(html: string) {
  if (!/<table(?:\s|>)/i.test(html) || typeof document === "undefined") return html
  const template = document.createElement("template")
  template.innerHTML = html
  for (const table of template.content.querySelectorAll("table")) {
    if (table.parentElement?.hasAttribute("data-markdown-table")) continue
    const scroll = document.createElement("div")
    scroll.setAttribute("data-markdown-table", "")
    table.replaceWith(scroll)
    scroll.append(table)
  }
  return template.innerHTML
}
