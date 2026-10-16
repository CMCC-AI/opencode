import { describe, expect, test } from "bun:test"
import { createRoot } from "solid-js"
import { createPromptAttachmentsCore } from "@/components/prompt-input/attachments"
import { createPromptState } from "@/context/prompt"

describe("prompt attachment session ownership", () => {
  test("adds an asynchronously read image to the session where the read started", async () => {
    await createRoot(async (dispose) => {
      const sessions = { A: createPromptState(), B: createPromptState() }
      let active: "A" | "B" = "A"
      const attachments = createPromptAttachmentsCore({
        capture: () => sessions[active].capture(),
        editor: () => document.createElement("div"),
      })
      const pending = attachments.addAttachment(new File([new Uint8Array(1024 * 1024)], "a.png", { type: "image/png" }))

      active = "B"
      await pending

      expect(images(sessions.A)).toHaveLength(1)
      expect(images(sessions.B)).toHaveLength(0)
      dispose()
    })
  })

  test("finishes the captured attachment after the active editor is removed", async () => {
    await createRoot(async (dispose) => {
      const prompt = createPromptState()
      let editor: HTMLDivElement | undefined = document.createElement("div")
      const attachments = createPromptAttachmentsCore({
        capture: prompt.capture,
        editor: () => editor,
      })
      const pending = attachments.addAttachment(new File([new Uint8Array(1024 * 1024)], "a.png", { type: "image/png" }))

      editor = undefined
      await pending

      expect(images(prompt)).toHaveLength(1)
      dispose()
    })
  })

  test("keeps every file in a batch on the session where the batch started", async () => {
    await createRoot(async (dispose) => {
      const sessions = { A: createPromptState(), B: createPromptState() }
      let active: "A" | "B" = "A"
      const attachments = createPromptAttachmentsCore({
        capture: () => sessions[active].capture(),
        editor: () => document.createElement("div"),
      })
      const pending = attachments.addAttachments([
        new File([new Uint8Array(1024 * 1024)], "first.png", { type: "image/png" }),
        new File([new Uint8Array(1024 * 1024)], "second.png", { type: "image/png" }),
      ])

      active = "B"
      await pending

      expect(images(sessions.A)).toHaveLength(2)
      expect(images(sessions.B)).toHaveLength(0)
      dispose()
    })
  })

  test("keeps a delayed native clipboard image on the session where paste started", async () => {
    await createRoot(async (dispose) => {
      const sessions = { A: createPromptState(), B: createPromptState() }
      const read = Promise.withResolvers<File | null>()
      let active: "A" | "B" = "A"
      const attachments = createPromptAttachmentsCore({
        capture: () => sessions[active].capture(),
        editor: () => document.createElement("div"),
      })
      const pending = attachments.addClipboardAttachment(read.promise)

      active = "B"
      read.resolve(new File([new Uint8Array(1024 * 1024)], "clipboard.png", { type: "image/png" }))
      await pending

      expect(images(sessions.A)).toHaveLength(1)
      expect(images(sessions.B)).toHaveLength(0)
      dispose()
    })
  })

  test("stores Word as a path reference without decoding its body", async () => {
    await createRoot(async (dispose) => {
      const prompt = createPromptState()
      const attachments = createPromptAttachmentsCore({
        capture: prompt.capture,
        editor: () => document.createElement("div"),
        storage: () => ({
          store: async () => ({
            path: "/workspace/runs/one/attachments/report.docx",
            url: "file:///workspace/runs/one/attachments/report.docx?opencode-attachment=reference",
          }),
          rollback: async () => {},
        }),
      })

      expect(await attachments.addAttachment(new File([Uint8Array.of(0)], "report.docx"))).toBe(true)

      expect(images(prompt)).toEqual([
        expect.objectContaining({
          filename: "report.docx",
          mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          sourcePath: "/workspace/runs/one/attachments/report.docx",
          dataUrl: "",
          referenceUrl: "file:///workspace/runs/one/attachments/report.docx?opencode-attachment=reference",
        }),
      ])
      dispose()
    })
  })

  test("commits a folder only after every file is stored and rolls back failures", async () => {
    await createRoot(async (dispose) => {
      const prompt = createPromptState()
      let rollback = 0
      const errors: unknown[] = []
      const attachments = createPromptAttachmentsCore({
        capture: prompt.capture,
        editor: () => document.createElement("div"),
        storage: () => ({
          store: async (_file, _mime, path) => {
            if (path?.endsWith("two.txt")) throw new Error("network unavailable")
            return { path: `/workspace/${path}`, url: `file:///workspace/${path}?opencode-attachment=reference` }
          },
          rollback: async () => {
            rollback++
          },
        }),
        onStoreError: (error) => errors.push(error),
      })
      const files = ["one.txt", "two.txt"].map((name) => {
        const file = new File(["正文"], name)
        Object.defineProperty(file, "webkitRelativePath", { value: `资料/${name}` })
        return file
      })
      expect(await attachments.addFolder(files)).toBe(false)
      expect(images(prompt)).toHaveLength(0)
      expect(rollback).toBe(1)
      expect(errors).toHaveLength(1)
      expect(attachments.uploadStatus.pending).toBe(0)
      dispose()
    })
  })

  test("keeps an in-flight folder and its storage on the conversation where selection started", async () => {
    await createRoot(async (dispose) => {
      const sessions = { A: createPromptState(), B: createPromptState() }
      let active: "A" | "B" = "A"
      const gate = Promise.withResolvers<void>()
      const stored: string[] = []
      const attachments = createPromptAttachmentsCore({
        capture: () => sessions[active].capture(),
        editor: () => document.createElement("div"),
        storage: () => {
          const owner = active
          return {
            store: async (_file, _mime, path) => {
              await gate.promise
              stored.push(owner)
              return {
                path: `/workspace/${owner}/${path}`,
                url: `file:///workspace/${owner}/${path}?opencode-attachment=reference`,
              }
            },
            rollback: async () => {},
          }
        },
      })
      const files = ["one.txt", "nested/two.txt"].map((name) => {
        const file = new File(["正文"], name.split("/").at(-1)!)
        Object.defineProperty(file, "webkitRelativePath", { value: `资料/${name}` })
        return file
      })
      const pending = attachments.addFolder(files)
      expect(attachments.uploadStatus.pending).toBe(1)
      active = "B"
      gate.resolve()
      expect(await pending).toBe(true)
      expect(stored).toEqual(["A", "A"])
      expect(images(sessions.A)).toHaveLength(2)
      expect(images(sessions.B)).toHaveLength(0)
      expect(attachments.uploadStatus.pending).toBe(0)
      dispose()
    })
  })
})

function images(prompt: ReturnType<typeof createPromptState>) {
  return prompt.current().filter((part) => part.type === "image")
}
