import { describe, expect, test } from "bun:test"
import {
  ATTACHMENT_UPLOAD_LIMIT,
  attachmentReferenceUrl,
  attachmentUploadGroup,
  isAttachmentReference,
} from "@opencode-ai/core/util/attachment-reference"
import { folderUploadFiles } from "./folder-upload"

function file(path: string, content: string | Uint8Array = "正文", type = "text/plain") {
  const result = new File([typeof content === "string" ? content : new Uint8Array(content)], path.split("/").at(-1)!, {
    type,
  })
  Object.defineProperty(result, "webkitRelativePath", { value: path })
  return result
}

describe("folder uploads", () => {
  test("retains nested paths and same-name files from different directories", async () => {
    const files = [file("资料/一/report.docx", Uint8Array.of(0), ""), file("资料/二/report.docx", Uint8Array.of(0), "")]
    const result = await folderUploadFiles(files)
    expect(result.map((item) => item.path)).toEqual(["资料/一/report.docx", "资料/二/report.docx"])
    expect(result.every((item) => item.mime.includes("wordprocessingml"))).toBe(true)
  })

  test("accepts exactly 30 MB but rejects combined content over the limit", async () => {
    const large = file("资料/large.txt", new Uint8Array(ATTACHMENT_UPLOAD_LIMIT).fill(97))
    expect(await folderUploadFiles([large])).toHaveLength(1)
    await expect(folderUploadFiles([large, file("资料/extra.txt", "a")])).rejects.toThrow("30 MB")
  })

  test("rejects unsupported files before any upload", async () => {
    await expect(
      folderUploadFiles([file("资料/bin.exe", Uint8Array.of(0, 255, 1, 2), "application/octet-stream")]),
    ).rejects.toThrow("不支持")
  })

  test("rejects duplicate or escaping paths and empty folders", async () => {
    for (const path of ["../secret.txt", "资料/../secret.txt", "/资料/a.txt", "资料/C:/a.txt", "资料/one\\a.txt"])
      await expect(folderUploadFiles([file(path)])).rejects.toThrow("相对路径")
    await expect(folderUploadFiles([file("资料/a.txt"), file("资料/A.txt")])).rejects.toThrow("重复")
    await expect(folderUploadFiles([])).rejects.toThrow("没有文件")
  })
})

describe("attachment references", () => {
  test("marks only explicit file references, leaving historical attachment URLs unchanged", () => {
    const url = attachmentReferenceUrl("file:///workspace/runs/one/附件%20一.docx")
    expect(isAttachmentReference(url)).toBe(true)
    expect(isAttachmentReference("file:///workspace/old.docx")).toBe(false)
    expect(isAttachmentReference("data:text/plain,正文")).toBe(false)
    expect(isAttachmentReference("https://example.com/?opencode-attachment=reference")).toBe(false)
    expect(() => attachmentReferenceUrl("https://example.com/file.docx")).toThrow()
  })

  test("recognizes only dedicated per-upload directories for server quotas", () => {
    const group = "runs/run-1/attachments/upload-00000000-0000-4000-8000-000000000001"
    expect(attachmentUploadGroup(`${group}/资料/a.docx`)).toBe(group)
    expect(attachmentUploadGroup(`${group}/../a.docx`)).toBeUndefined()
    expect(attachmentUploadGroup("runs/run-1/attachments/old.docx")).toBeUndefined()
  })
})
