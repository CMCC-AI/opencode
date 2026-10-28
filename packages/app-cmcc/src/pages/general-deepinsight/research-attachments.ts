import { createStore } from "solid-js/store"
import { onCleanup } from "solid-js"
import type { ImageAttachmentPart, usePrompt } from "@/context/prompt"
import type { AttachmentStorage } from "@/components/prompt-input/attachments"
import { attachmentMime } from "@/components/prompt-input/files"
import { fileBase64 } from "@/components/prompt-input/word-documents"
import { ATTACHMENT_UPLOAD_LIMIT } from "@opencode-ai/core/util/attachment-reference"
import { uuid } from "@/utils/uuid"

export type ResearchMode = "quick" | "deep"
export const RESEARCH_FILE_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.txt,.md,.json"

export function researchAttachmentIssue(item: ImageAttachmentPart, mode: ResearchMode, items: ImageAttachmentPart[]) {
  const meta = item.research
  if (!meta) return "请重新选择原文件"
  if (mode === "deep") {
    if (meta.size > ATTACHMENT_UPLOAD_LIMIT) return "文件不能超过 30 MB"
    if (item.mime === "application/octet-stream") return "深度模式不支持此文件格式"
    return ""
  }
  if (meta.relativePath) return "快速模式不支持文件夹，请切回深度或移除后选择单个文档"
  const ext = item.filename.split(".").at(-1)?.toLowerCase()
  if (!ext || !RESEARCH_FILE_ACCEPT.split(",").includes(`.${ext}`)) return "快速模式不支持此文件格式"
  if (meta.size === 0 || meta.size > 32 * 1024 * 1024) return "资料不能为空且单份不能超过 32 MiB"
  if (items.some((other) => other.id !== item.id && other.filename === item.filename)) return "快速模式不能使用重名资料"
  return ""
}

export function createResearchAttachments(input: {
  prompt: Pick<ReturnType<typeof usePrompt>, "current" | "set">
  mode: () => ResearchMode
  valid: () => boolean
  storage: () => AttachmentStorage
  removeDeep: (path: string) => Promise<unknown>
  request: <T>(path: string, init?: RequestInit) => Promise<T>
}) {
  const originals = new Map<string, File>()
  const [state, setState] = createStore({ pending: false })
  let alive = true
  onCleanup(() => {
    alive = false
    originals.clear()
  })
  const valid = () => alive && input.valid()
  const check = () => {
    if (!valid()) throw new Error("研究草稿已切换，请在当前草稿重新操作")
  }
  const items = () => input.prompt.current().filter((part): part is ImageAttachmentPart => part.type === "image")
  const update = (item: ImageAttachmentPart) => {
    check()
    input.prompt.set(input.prompt.current().map((part) => (part.type === "image" && part.id === item.id ? item : part)))
  }
  const prepare = async (item: ImageAttachmentPart, mode: ResearchMode): Promise<ImageAttachmentPart> => {
    check()
    const meta = item.research
    const issue = researchAttachmentIssue(item, mode, items())
    const copy: ImageAttachmentPart = {
      ...item,
      referenceUrl: undefined,
      sourcePath: undefined,
      research: meta && { ...meta, error: undefined },
    }
    if (!meta || !copy.research) return copy
    if (issue) return { ...copy, research: { ...meta, error: issue } }
    try {
      if (!meta[mode]) {
        const file = originals.get(item.id)
        if (!file) throw new Error("缺少原文件，请重新选择后上传到当前模式")
        if (mode === "deep") {
          const stored = await input.storage().store(file, item.mime, meta.relativePath)
          copy.research.deep = { ...stored, mime: item.mime }
        } else {
          const form = new FormData()
          form.append("files", file)
          const uploadId = items().find((part) => part.research?.quick)?.research?.quick?.uploadId
          if (uploadId) form.append("uploadId", uploadId)
          const result = await input.request<{
            upload_id: string
            files: { saved_name: string; original_filename: string }[]
          }>("/files", { method: "POST", body: form })
          const saved = result.files.filter((entry) => entry.original_filename === file.name).at(-1)
          if (!result.upload_id || !saved?.saved_name || (uploadId && result.upload_id !== uploadId))
            throw new Error("研究资料上传响应不完整")
          copy.research.quick = { uploadId: result.upload_id, savedName: saved.saved_name }
        }
      }
      check()
      if (mode === "deep" && copy.research.deep) {
        copy.referenceUrl = copy.research.deep.url
        copy.sourcePath = copy.research.deep.path
      }
      return copy
    } catch (error) {
      check()
      return { ...copy, research: { ...copy.research, error: error instanceof Error ? error.message : String(error) } }
    }
  }
  return {
    state,
    items,
    issues: () =>
      items().flatMap((item) => {
        const issue = researchAttachmentIssue(item, input.mode(), items()) || item.research?.error
        return issue ? [`${item.filename}：${issue}`] : []
      }),
    uploadId: () => items().find((item) => item.research?.quick)?.research?.quick?.uploadId,
    async read(file: File, relativePath?: string) {
      check()
      const filename = relativePath ?? file.name
      const previous = items().find(
        (item) =>
          item.filename === filename &&
          item.research?.size === file.size &&
          item.research.modified === file.lastModified &&
          !originals.has(item.id),
      )
      const mime = (await attachmentMime(file)) ?? "application/octet-stream"
      const item: ImageAttachmentPart = previous ?? {
        type: "image",
        id: uuid(),
        filename,
        mime,
        dataUrl: mime.startsWith("image/") ? `data:${mime};base64,${await fileBase64(file)}` : "",
        research: { size: file.size, modified: file.lastModified, relativePath },
      }
      check()
      originals.set(item.id, file)
      return prepare(item, input.mode())
    },
    async prepareAll() {
      if (state.pending) return false
      setState("pending", true)
      try {
        const mode = input.mode()
        for (const item of items()) update(await prepare(item, mode))
        return items().every(
          (item) => !researchAttachmentIssue(item, mode, items()) && !item.research?.error && !!item.research?.[mode],
        )
      } finally {
        if (valid()) setState("pending", false)
      }
    },
    async remove(id: string) {
      if (state.pending) return
      const item = items().find((part) => part.id === id)
      if (!item) return
      setState("pending", true)
      try {
        if (item.research?.quick) {
          const receipt = item.research.quick
          await input.request(
            `/files?uploadId=${encodeURIComponent(receipt.uploadId)}&filename=${encodeURIComponent(receipt.savedName)}`,
            { method: "DELETE" },
          )
          check()
          update({ ...item, research: { ...item.research, quick: undefined } })
        }
        if (item.research?.deep) await input.removeDeep(item.research.deep.path)
        check()
        originals.delete(id)
        input.prompt.set(input.prompt.current().filter((part) => part.type !== "image" || part.id !== id))
      } finally {
        if (valid()) setState("pending", false)
      }
    },
  }
}
