import { describe, expect, test } from "bun:test"
import { createRoot } from "solid-js"
import type { ImageAttachmentPart, Prompt } from "@/context/prompt"
import { createResearchAttachments, researchAttachmentIssue, type ResearchMode } from "./research-attachments"

function setup() {
  let prompt: Prompt = []
  let mode: ResearchMode = "deep"
  let valid = true
  let uploads = 0
  let quickUploads = 0
  let fail = false
  const removed: string[] = []
  const saved: { saved_name: string; original_filename: string }[] = []
  let dispose!: () => void
  const controller = createRoot((cleanup) => {
    dispose = cleanup
    return createResearchAttachments({
      prompt: {
        current: () => prompt,
        set: (next) => {
          prompt = next
        },
      },
      mode: () => mode,
      valid: () => valid,
      storage: () => ({
        store: async (file) => {
          uploads++
          return { path: `/draft/${file.name}`, url: `attachment:file:///draft/${file.name}` }
        },
        rollback: async () => {},
      }),
      removeDeep: async (path) => {
        removed.push(path)
      },
      request: async <T>(path: string, init?: RequestInit) => {
        if (init?.method === "DELETE") {
          removed.push(path)
          return undefined as T
        }
        if (fail) throw new Error("上传失败")
        quickUploads++
        const file = (init?.body as FormData).get("files") as File
        saved.push({ saved_name: `saved-${saved.length}-${file.name}`, original_filename: file.name })
        return { upload_id: "upload-1", files: saved } as T
      },
    })
  })
  return {
    controller,
    dispose,
    removed,
    counts: () => ({ uploads, quickUploads }),
    setMode: (next: ResearchMode) => {
      mode = next
    },
    fail: (next: boolean) => {
      fail = next
    },
    invalidate: () => {
      valid = false
    },
    add: async (file: File, path?: string) => {
      const item = await controller.read(file, path)
      prompt = [...prompt.filter((p) => p.type !== "image" || p.id !== item.id), item]
      return item
    },
    restore: (items: ImageAttachmentPart[]) => {
      prompt = items
    },
  }
}

describe("research attachment adaptation", () => {
  test("reuses independent receipts when switching in both directions", async () => {
    const value = setup()
    try {
      await value.add(new File(["word"], "材料.docx", { lastModified: 1 }))
      value.setMode("quick")
      expect(await value.controller.prepareAll()).toBe(true)
      expect(value.controller.items()[0].referenceUrl).toBeUndefined()
      value.setMode("deep")
      expect(await value.controller.prepareAll()).toBe(true)
      expect(value.controller.items()[0].referenceUrl).toContain("attachment:")
      value.setMode("quick")
      expect(await value.controller.prepareAll()).toBe(true)
      expect(value.counts()).toEqual({ uploads: 1, quickUploads: 1 })
    } finally {
      value.dispose()
    }
  })
  test("keeps incompatible folders and blocks quick submission without uploading", async () => {
    const value = setup()
    try {
      await value.add(new File(["text"], "data.txt"), "folder/data.txt")
      value.setMode("quick")
      expect(await value.controller.prepareAll()).toBe(false)
      expect(value.controller.issues()[0]).toContain("文件夹")
      expect(value.controller.items()).toHaveLength(1)
      expect(value.counts().quickUploads).toBe(0)
    } finally {
      value.dispose()
    }
  })
  test("refresh retains receipts but requires original for a different engine", async () => {
    const first = setup()
    const file = new File(["word"], "report.docx", { lastModified: 1 })
    await first.add(file)
    const saved = first.controller.items()
    first.dispose()
    const next = setup()
    try {
      next.restore(saved)
      expect(await next.controller.prepareAll()).toBe(true)
      next.setMode("quick")
      expect(await next.controller.prepareAll()).toBe(false)
      expect(next.controller.issues()[0]).toContain("缺少原文件")
      await next.add(file)
      expect(next.controller.items()).toHaveLength(1)
      expect(await next.controller.prepareAll()).toBe(true)
    } finally {
      next.dispose()
    }
  })
  test("failed uploads keep files, successful retry clears errors", async () => {
    const value = setup()
    try {
      value.setMode("quick")
      value.fail(true)
      await value.add(new File(["word"], "report.docx"))
      expect(value.controller.issues()[0]).toContain("上传失败")
      value.fail(false)
      expect(await value.controller.prepareAll()).toBe(true)
      expect(value.controller.issues()).toEqual([])
    } finally {
      value.dispose()
    }
  })
  test("deletes only this file's receipts and ignores other drafts", async () => {
    const value = setup()
    try {
      const item = await value.add(new File(["word"], "report.docx"))
      value.setMode("quick")
      await value.controller.prepareAll()
      await value.controller.remove(item.id)
      expect(value.removed).toHaveLength(2)
      expect(value.controller.items()).toEqual([])
      value.invalidate()
      expect(value.add(new File(["word"], "another.docx"))).rejects.toThrow("草稿已切换")
    } finally {
      value.dispose()
    }
  })
  test("validates limits, formats and duplicate names by target engine", () => {
    const item: ImageAttachmentPart = {
      type: "image",
      id: "1",
      mime: "application/octet-stream",
      filename: "data.xlsx",
      dataUrl: "",
      research: { size: 31 * 1024 * 1024, modified: 0 },
    }
    expect(researchAttachmentIssue(item, "quick", [item])).toBe("")
    expect(researchAttachmentIssue(item, "deep", [item])).toContain("30 MB")
    expect(researchAttachmentIssue(item, "quick", [item, { ...item, id: "2" }])).toContain("重名")
    expect(researchAttachmentIssue({ ...item, filename: "photo.png" }, "quick", [])).toContain("不支持")
  })
  test("a completed late upload cannot populate a disposed draft", async () => {
    let active = true
    let dispose!: () => void
    const gate = Promise.withResolvers<{
      upload_id: string
      files: { saved_name: string; original_filename: string }[]
    }>()
    const controller = createRoot((cleanup) => {
      dispose = cleanup
      return createResearchAttachments({
        prompt: {
          current: () => [],
          set: () => {
            throw new Error("must not write another draft")
          },
        },
        mode: () => "quick",
        valid: () => active,
        storage: () => ({
          store: async () => {
            throw new Error("wrong engine")
          },
          rollback: async () => {},
        }),
        removeDeep: async () => {},
        request: async <T>() => (await gate.promise) as T,
      })
    })
    const pending = controller.read(new File(["word"], "report.docx"))
    await new Promise((resolve) => setTimeout(resolve, 0))
    active = false
    dispose()
    gate.resolve({ upload_id: "old", files: [{ saved_name: "old.docx", original_filename: "report.docx" }] })
    await expect(pending).rejects.toThrow("草稿已切换")
  })
})
