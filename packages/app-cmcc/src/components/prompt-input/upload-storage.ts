import { ATTACHMENT_UPLOAD_LIMIT, attachmentReferenceUrl } from "@opencode-ai/core/util/attachment-reference"
import { encodeFilePath } from "@/context/file/path"
import { cmccWorkspaceRelativePath } from "@/utils/cmcc-artifact-paths"
import { uuid } from "@/utils/uuid"
import { fileBase64, safeUploadedFilename } from "./word-documents"
import type { AttachmentStorage } from "./attachments"

export function createAttachmentStorage(input: {
  workspace: string
  directory?: string
  prepare: () => Promise<unknown>
  upload: (path: string, content: string) => Promise<unknown>
  remove: (path: string) => Promise<unknown>
}): AttachmentStorage {
  const folderID = uuid()
  const groups = new Set<string>()
  let prepared: Promise<unknown> | undefined
  return {
    store: async (file, _mime, relativePath) => {
      if (file.size > ATTACHMENT_UPLOAD_LIMIT) throw new Error("文件不能超过 30 MB")
      if (!input.directory) throw new Error("当前对话尚未分配上传目录")
      const root = cmccWorkspaceRelativePath(input.workspace, input.directory)
      if (!root) throw new Error("上传目录不属于当前运行工作区")
      if (
        relativePath &&
        relativePath
          .split("/")
          .some((part) => !part || part === "." || part === ".." || /[\\:\u0000-\u001f]/.test(part))
      )
        throw new Error("文件相对路径无效")
      await (prepared ??= input.prepare())
      const group = `${root}/attachments/upload-${relativePath ? folderID : uuid()}`
      groups.add(group)
      const path = `${group}/${relativePath ?? safeUploadedFilename(file.name)}`
      await input.upload(path, await fileBase64(file))
      const absolute = `${input.workspace.replaceAll("\\", "/").replace(/\/+$/, "")}/${path}`
      return { path: absolute, url: attachmentReferenceUrl(`file://${encodeFilePath(absolute)}`) }
    },
    rollback: async () => {
      for (const path of groups) await input.remove(path).catch(() => undefined)
    },
  }
}
