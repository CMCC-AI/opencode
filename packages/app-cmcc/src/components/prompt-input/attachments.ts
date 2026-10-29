import { onCleanup, onMount } from "solid-js"
import { createStore } from "solid-js/store"
import { makeEventListener } from "@solid-primitives/event-listener"
import { showToast } from "@/utils/toast"
import { type ContentPart, type ImageAttachmentPart, type usePrompt } from "@/context/prompt"
import { useLanguage } from "@/context/language"
import { uuid } from "@/utils/uuid"
import { getCursorPosition } from "./editor-dom"
import { attachmentMime } from "./files"
import { normalizePaste, pasteMode } from "./paste"
import { folderUploadFiles } from "./folder-upload"

export type AttachmentStorage = {
  store: (file: File, mime: string, relativePath?: string) => Promise<{ path: string; url: string }>
  rollback: () => Promise<void>
}

function dataUrl(file: File, mime: string) {
  return new Promise<string>((resolve) => {
    const reader = new FileReader()
    reader.addEventListener("error", () => resolve(""))
    reader.addEventListener("load", () => {
      const value = typeof reader.result === "string" ? reader.result : ""
      const idx = value.indexOf(",")
      if (idx === -1) {
        resolve(value)
        return
      }
      resolve(`data:${mime};base64,${value.slice(idx + 1)}`)
    })
    reader.readAsDataURL(file)
  })
}

type PromptTarget = Pick<ReturnType<ReturnType<typeof usePrompt>["capture"]>, "current" | "cursor" | "set">
type AttachmentReader = (file: File, relativePath?: string) => Promise<ImageAttachmentPart>
type AttachmentTarget = { prompt: PromptTarget; cursor: number | undefined; storage?: AttachmentStorage; read?: AttachmentReader }

type PromptAttachmentsCoreInput = {
  disabled?: () => boolean
  read?: AttachmentReader
  capture: () => PromptTarget
  editor: () => HTMLDivElement | undefined
  focusEditor?: () => void
  addPart?: (part: ContentPart) => boolean
  warn?: () => void
  readClipboardImage?: () => Promise<File | null>
  getPathForFile?: (file: File) => string
  storage?: () => AttachmentStorage
  onStoreError?: (error: unknown) => void
}

type PromptAttachmentsInput = {
  disabled?: () => boolean
  read?: AttachmentReader
  prompt: ReturnType<typeof usePrompt>
  editor: () => HTMLDivElement | undefined
  dropTarget: () => HTMLElement | undefined
  isDialogActive: () => boolean
  setDraggingType: (type: "image" | "@mention" | null) => void
  focusEditor: () => void
  addPart: (part: ContentPart) => boolean
  readClipboardImage?: () => Promise<File | null>
  getPathForFile?: (file: File) => string
  storage?: () => AttachmentStorage
  onStoreError?: (error: unknown) => void
}

export function createPromptAttachmentsCore(input: PromptAttachmentsCoreInput) {
  const [uploadStatus, setUploadStatus] = createStore({ pending: 0, completed: 0, total: 0 })
  const capture = (): AttachmentTarget | undefined => {
    if (input.disabled?.()) return
    const prompt = input.capture()
    const editor = input.editor()
    if (!editor) return
    return { prompt, cursor: prompt.cursor() ?? getCursorPosition(editor), storage: input.storage?.(), read: input.read }
  }

  const read = async (file: File, target: AttachmentTarget, relativePath?: string, knownMime?: string) => {
    if (target.read) return target.read(file, relativePath)
    const mime = knownMime ?? (await attachmentMime(file))
    if (!mime) return
    const stored = await target.storage?.store(file, mime, relativePath)
    const url = stored && !mime.startsWith("image/") ? "" : await dataUrl(file, mime)
    if (!stored && !url) return
    return {
      type: "image",
      id: uuid(),
      filename: relativePath ?? file.name,
      sourcePath: stored?.path ?? (input.getPathForFile?.(file) || undefined),
      mime,
      dataUrl: url,
      ...(stored ? { referenceUrl: stored.url } : {}),
    } satisfies ImageAttachmentPart
  }

  const track = async (total: number, work: () => Promise<boolean>) => {
    if (!uploadStatus.pending) setUploadStatus({ completed: 0, total: 0 })
    setUploadStatus({ pending: uploadStatus.pending + 1, total: uploadStatus.total + total })
    try {
      return await work()
    } catch (error) {
      input.onStoreError?.(error)
      return false
    } finally {
      setUploadStatus("pending", (count) => count - 1)
    }
  }

  const add = async (file: File, toast = true, target = capture()) => {
    if (!target) return false
    const attachment = await read(file, target)
    setUploadStatus("completed", (count) => count + 1)
    if (!attachment) {
      if (toast) input.warn?.()
      return false
    }
    target.prompt.set([...target.prompt.current().filter((part) => part.type !== "image" || part.id !== attachment.id), attachment], target.cursor)
    return true
  }

  const addAttachment = (file: File) => track(1, () => add(file))

  const addAttachments = (files: File[], toast = true, target = capture()) =>
    track(files.length, async () => {
      let found = false

      for (const file of files) {
        const ok = await add(file, false, target)
        if (ok) found = true
      }

      if (!found && files.length > 0 && toast) input.warn?.()
      return found
    })

  const addFolder = (files: File[], target = capture()) =>
    track(files.length, async () => {
      if (!target?.storage) throw new Error("当前对话尚未分配上传目录")
      const selected = await folderUploadFiles(files)
      const attachments: ImageAttachmentPart[] = []
      try {
        for (const item of selected) {
          const attachment = await read(item.file, target, item.path, item.mime)
          if (!attachment) throw new Error(`上传失败：${item.path}`)
          attachments.push(attachment)
          setUploadStatus("completed", (count) => count + 1)
        }
      } catch (error) {
        await target.storage.rollback()
        throw error
      }
      target.prompt.set([...target.prompt.current(), ...attachments], target.cursor)
      return true
    })

  const addClipboardAttachment = async (pending: Promise<File | null>, target = capture()) => {
    const file = await pending
    if (!file) return false
    return track(1, () => add(file, true, target))
  }

  const removeAttachment = (id: string) => {
    const target = input.capture()
    const current = target.current()
    const next = current.filter((part) => part.type !== "image" || part.id !== id)
    target.set(next, target.cursor())
  }

  const handlePaste = async (event: ClipboardEvent) => {
    const clipboardData = event.clipboardData
    if (!clipboardData) return
    const target = capture()
    if (!target) return

    event.preventDefault()
    event.stopPropagation()

    const files = Array.from(clipboardData.items).flatMap((item) => {
      if (item.kind !== "file") return []
      const file = item.getAsFile()
      return file ? [file] : []
    })

    if (files.length > 0) {
      await addAttachments(files, true, target)
      return
    }

    const plainText = clipboardData.getData("text/plain") ?? ""

    // Desktop: Browser clipboard has no images and no text, try platform's native clipboard for images
    if (input.readClipboardImage && !plainText) {
      if (await addClipboardAttachment(input.readClipboardImage(), target)) return
    }

    if (!plainText) return

    const text = normalizePaste(plainText)

    const put = () => {
      if (input.addPart?.({ type: "text", content: text, start: 0, end: 0 })) return true
      input.focusEditor?.()
      return input.addPart?.({ type: "text", content: text, start: 0, end: 0 }) ?? false
    }

    if (pasteMode(text) === "manual") {
      put()
      return
    }

    const inserted = typeof document.execCommand === "function" && document.execCommand("insertText", false, text)
    if (inserted) return

    put()
  }

  return {
    addAttachment,
    addAttachments,
    addFolder,
    uploadStatus,
    addClipboardAttachment,
    removeAttachment,
    handlePaste,
  }
}

export function createPromptAttachments(input: PromptAttachmentsInput) {
  const language = useLanguage()
  const attachments = createPromptAttachmentsCore({
    ...input,
    capture: input.prompt.capture,
    warn: () => {
      showToast({
        title: language.t("prompt.toast.pasteUnsupported.title"),
        description: language.t("prompt.toast.pasteUnsupported.description"),
      })
    },
  })
  createPromptAttachmentDrop(input, attachments.addAttachments)
  return attachments
}

export function createPromptAttachmentDrop(
  input: Pick<
    PromptAttachmentsInput,
    "editor" | "dropTarget" | "disabled" | "isDialogActive" | "setDraggingType" | "focusEditor" | "addPart"
  >,
  addAttachments: (files: File[]) => Promise<boolean>,
) {
  let disposed = false
  const active = () => {
    if (disposed || input.disabled?.() || input.isDialogActive()) return false
    const editor = input.editor()
    const target = input.dropTarget()
    if (!editor?.isConnected || !target?.contains(editor) || !editor.getClientRects().length) return false
    if (editor.closest('[hidden], [inert], [aria-hidden="true"]')) return false
    return (
      editor.checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true }) ??
      getComputedStyle(editor).visibility === "visible"
    )
  }

  const handleDragOver = (event: DragEvent) => {
    if (event.defaultPrevented || !active()) return

    const hasFiles = event.dataTransfer?.types.includes("Files")
    const hasText = event.dataTransfer?.types.includes("text/plain")
    if (!hasFiles && !hasText) return
    event.preventDefault()
    event.stopPropagation()
    if (hasFiles) {
      input.setDraggingType("image")
    } else if (hasText) {
      input.setDraggingType("@mention")
    }
  }

  const handleDragLeave = (event: DragEvent) => {
    if (event.relatedTarget instanceof Node && input.dropTarget()?.contains(event.relatedTarget)) return
    input.setDraggingType(null)
  }

  const handleDrop = async (event: DragEvent) => {
    if (event.defaultPrevented || !active()) return

    event.preventDefault()
    event.stopPropagation()
    input.setDraggingType(null)

    const plainText = event.dataTransfer?.getData("text/plain")
    const filePrefix = "file:"
    if (plainText?.startsWith(filePrefix)) {
      const filePath = plainText.slice(filePrefix.length)
      input.focusEditor()
      input.addPart({ type: "file", path: filePath, content: "@" + filePath, start: 0, end: 0 })
      return
    }

    const dropped = event.dataTransfer?.files
    if (!dropped) return

    await addAttachments(Array.from(dropped))
  }

  onCleanup(() => {
    disposed = true
  })
  onMount(() => {
    // A retained composer must never receive another conversation's page-wide drop.
    const target = input.dropTarget()
    if (!target) return
    makeEventListener(target, "dragover", handleDragOver)
    makeEventListener(target, "dragleave", handleDragLeave)
    makeEventListener(target, "drop", handleDrop)
  })
}
