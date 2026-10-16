import { BlobReader, Uint8ArrayWriter, ZipWriter } from "@zip.js/zip.js"

export async function wordFixture(paragraphs = ["第一段：巡察材料内容。", "第二段：整改建议。"], extras = true) {
  const writer = new ZipWriter(new Uint8ArrayWriter())
  const types = "http://schemas.openxmlformats.org/package/2006/content-types"
  const main = "application/vnd.openxmlformats-officedocument.wordprocessingml"
  const entries = {
    "[Content_Types].xml": `<Types xmlns="${types}"><Override PartName="/word/document.xml" ContentType="${main}.document.main+xml"/><Override PartName="/word/header1.xml" ContentType="${main}.header+xml"/><Override PartName="/word/footnotes.xml" ContentType="${main}.footnotes+xml"/></Types>`,
    "word/document.xml": `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs.map((text) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`).join("")}${extras ? "<w:tbl><w:tr><w:tc><w:p><w:r><w:t>检查项</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>安全出口</w:t></w:r></w:p></w:tc></w:tr></w:tbl>" : ""}</w:body></w:document>`,
    "word/header1.xml":
      '<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>巡察附件页眉</w:t></w:r></w:p></w:hdr>',
    "word/footnotes.xml":
      '<w:footnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:footnote w:id="1"><w:p><w:r><w:t>脚注补充说明</w:t></w:r></w:p></w:footnote></w:footnotes>',
  }
  for (const [name, text] of Object.entries(entries))
    await writer.add(name, new BlobReader(new Blob([text])), { useWebWorkers: false })
  return writer.close()
}
