export function exportResearchWord(element: HTMLElement, filename: string) {
  const cloned = element.cloneNode(true) as HTMLElement
  const originals = element.querySelectorAll("canvas")
  const copies = cloned.querySelectorAll("canvas")
  originals.forEach((canvas, index) => {
    const image = document.createElement("img")
    image.src = canvas.toDataURL("image/png")
    image.style.maxWidth = "100%"
    image.style.height = "auto"
    copies[index]?.replaceWith(image)
  })
  cloned.querySelectorAll("button").forEach((button) => button.remove())
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:"Microsoft YaHei",Arial,sans-serif;line-height:1.7;color:#333}img{max-width:100%;height:auto}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:6px 8px}pre{white-space:pre-wrap;background:#f5f5f5;padding:8px}</style></head><body>${cloned.innerHTML}</body></html>`
  const url = URL.createObjectURL(new Blob(["\ufeff", html], { type: "application/msword;charset=utf-8" }))
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
