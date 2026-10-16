import { ATTACHMENT_UPLOAD_LIMIT } from "@opencode-ai/core/util/attachment-reference"
import { attachmentMime } from "./files"

export async function folderUploadFiles(files: File[]) {
  if (!files.length) throw new Error("所选文件夹中没有文件")
  if (files.reduce((total, file) => total + file.size, 0) > ATTACHMENT_UPLOAD_LIMIT)
    throw new Error("文件夹内容不能超过 30 MB（包含所有子目录）")
  const seen = new Set<string>()
  const result = []
  for (const file of files) {
    const path = file.webkitRelativePath
    const segments = path.split("/")
    if (
      segments.length < 2 ||
      segments.some((segment) => !segment || segment === "." || segment === ".." || /[\\:\u0000-\u001f]/.test(segment))
    )
      throw new Error(`文件相对路径无效：${path || file.name}`)
    const key = path.toLocaleLowerCase()
    if (seen.has(key)) throw new Error(`文件夹存在重复路径：${path}`)
    seen.add(key)
    const mime = await attachmentMime(file)
    if (!mime) throw new Error(`文件夹包含不支持的文件：${path}`)
    result.push({ file, path, mime })
  }
  return result
}
