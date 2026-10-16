const DOC_MIME = "application/msword"
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

export function isWordDocument(file: File, mime: string) {
  const extension = file.name.split(".").at(-1)?.toLowerCase()
  return mime === DOC_MIME || mime === DOCX_MIME || extension === "doc" || extension === "docx"
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
