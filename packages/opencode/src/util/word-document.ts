import { ATTACHMENT_UPLOAD_LIMIT } from "@opencode-ai/core/util/attachment-reference"

export function isWordPath(filepath: string) {
  return /\.docx?$/i.test(filepath)
}

export async function readWordDocument(bytes: Uint8Array) {
  if (bytes.byteLength > ATTACHMENT_UPLOAD_LIMIT) throw new Error("Word 文件不能超过 30 MB")
  if (bytes.byteLength < 512) throw new Error("Word 文件不完整或格式无效")
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const { ZipReader, Uint8ArrayReader } = await import("@zip.js/zip.js")
    // zip.js uses slice().buffer internally; a Node Buffer slice retains its original byte offset.
    const reader = new ZipReader(new Uint8ArrayReader(new Uint8Array(bytes)), { useWebWorkers: false })
    try {
      const entries = await reader.getEntries()
      if (
        entries.length > 10_000 ||
        entries.reduce((total, entry) => total + entry.uncompressedSize, 0) > 128 * 1024 * 1024
      )
        throw new Error("Word 文件解压后过大，无法安全解析")
      if (entries.some((entry) => entry.encrypted)) throw new Error("请先解除 Word 文件密码后再上传")
    } finally {
      await reader.close()
    }
  }
  const { default: WordExtractor } = await import("word-extractor")
  const document = await new WordExtractor().extract(Buffer.from(bytes)).catch((error: unknown) => {
    throw new Error(
      `无法解析 Word 文件，请检查文件是否损坏或加密：${error instanceof Error ? error.message : String(error)}`,
    )
  })
  const sections = [
    document.getBody(),
    document.getFootnotes(),
    document.getEndnotes(),
    document.getHeaders(),
    document.getTextboxes(),
  ].filter((text) => text.trim())
  const text = sections.join("\n\n").replaceAll("\r\n", "\n").replaceAll("\r", "\n").trim()
  if (!text) throw new Error("Word 文件未包含可读取的文字；扫描件或图片内容需要 OCR")
  return text
}
