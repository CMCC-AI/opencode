const DOC_MIME = "application/msword"
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

export function isWordDocument(file: File, mime: string) {
  const extension = file.name.split(".").at(-1)?.toLowerCase()
  return mime === DOC_MIME || mime === DOCX_MIME || extension === "doc" || extension === "docx"
}

export function isDocx(file: File, mime: string) {
  return mime === DOCX_MIME || file.name.toLowerCase().endsWith(".docx")
}

export function safeUploadedFilename(name: string) {
  return name.replace(/[\\/\u0000-\u001f]/g, "_").trim() || "document"
}

export function fileBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener("load", () => {
      const value = String(reader.result)
      const separator = value.indexOf(",")
      if (separator === -1) return reject(new Error(`无法编码 ${file.name}`))
      resolve(value.slice(separator + 1))
    })
    reader.addEventListener("error", () => reject(reader.error ?? new Error(`无法读取 ${file.name}`)))
    reader.readAsDataURL(file)
  })
}

export async function docxText(file: File) {
  const { default: JSZip } = await import("jszip")
  const archive = await JSZip.loadAsync(await file.arrayBuffer())
  const names = Object.keys(archive.files).filter((name) =>
    /^word\/(?:document|footnotes|endnotes|header\d+|footer\d+)\.xml$/.test(name),
  )
  const sections = await Promise.all(
    names.map(async (name) => {
      const entry = archive.file(name)
      if (!entry) return ""
      return wordXmlText(await entry.async("text"))
    }),
  )
  return sections.filter(Boolean).join("\n\n").trim()
}

export async function wordAttachmentText(file: File, mime: string, path: string) {
  if (file.size > 25 * 1024 * 1024) throw new Error("Word 文件不能超过 25 MB")
  if (!isDocx(file, mime))
    return `用户上传的旧版 Word 文档已保存到 ${path}。该格式是二进制 .doc，请使用当前环境可用的 Office 转换工具读取，并优先转换为 DOCX、PDF 或纯文本后再分析。`
  const extracted = await docxText(file).catch(() => "")
  const limit = 120_000
  const content = extracted.slice(0, limit)
  const suffix = extracted.length > limit ? `\n\n[正文过长，已截取前 ${limit} 个字符；完整文件位于上述路径。]` : ""
  return content
    ? `用户上传的 DOCX 文档已保存到 ${path}。以下是从文档中提取的正文：\n\n${content}${suffix}`
    : `用户上传的 DOCX 文档已保存到 ${path}，但未能直接提取正文。请使用当前环境可用的 Office 或 ZIP/XML 工具读取该文件。`
}

function wordXmlText(xml: string) {
  const document = new DOMParser().parseFromString(xml, "application/xml")
  const paragraphs = Array.from(document.getElementsByTagName("*")).filter((node) => node.localName === "p")
  const blocks = paragraphs.map((paragraph) =>
    Array.from(paragraph.getElementsByTagName("*"))
      .filter((node) => node.localName === "t")
      .map((node) => node.textContent ?? "")
      .join(""),
  )
  return blocks.filter(Boolean).join("\n")
}
