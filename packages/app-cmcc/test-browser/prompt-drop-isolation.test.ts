import { afterEach, describe, expect, spyOn, test } from "bun:test"
import { createRoot } from "solid-js"
import { createPromptAttachmentDrop, createPromptAttachmentsCore } from "@/components/prompt-input/attachments"
import { createPromptState } from "@/context/prompt"

const cleanups: VoidFunction[] = []

afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
})

function composer(name: string, wait?: Promise<void>, parent = document.body) {
  const root = document.createElement("div")
  const editor = document.createElement("div")
  root.append(editor)
  parent.append(root)
  const removed = spyOn(root, "removeEventListener")
  // Happy DOM has no layout; visibility and attachment are tested separately.
  Object.defineProperty(editor, "getClientRects", { value: () => (root.hidden ? [] : [new DOMRect(0, 0, 100, 40)]) })
  Object.defineProperty(editor, "checkVisibility", { value: () => !root.hidden })
  const calls: string[] = []
  const mentions: string[] = []
  let disabled = false
  let dialog = false
  let dragging: string | null = null
  const value = createRoot((dispose) => {
    const prompt = createPromptState()
    const attachments = createPromptAttachmentsCore({
      capture: prompt.capture,
      editor: () => editor,
      disabled: () => disabled,
      storage: () => ({
        async store(file) {
          calls.push(file.name)
          await wait
          const path = `/runs/${name}/${file.name}`
          return { path, url: `file://${path}` }
        },
        async rollback() {},
      }),
    })
    createPromptAttachmentDrop(
      {
        dropTarget: () => root,
        editor: () => editor,
        disabled: () => disabled,
        isDialogActive: () => dialog,
        setDraggingType: (type) => (dragging = type),
        focusEditor() {},
        addPart: (part) => {
          if (part.type === "file") mentions.push(part.path)
          return true
        },
      },
      attachments.addAttachments,
    )
    return { prompt, attachments, dispose }
  })
  cleanups.push(() => {
    value.dispose()
    root.remove()
    removed.mockRestore()
  })
  return {
    ...value,
    root,
    editor,
    calls,
    mentions,
    removed,
    dragging: () => dragging,
    disable: () => (disabled = true),
    dialog: () => (dialog = true),
  }
}

function drag(target: EventTarget, type = "drop", count = 7, text = "") {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, "dataTransfer", {
    value: {
      types: text ? ["text/plain"] : ["Files"],
      getData: () => text,
      files: text ? [] : Array.from({ length: count }, (_, index) => new File(["test"], `report-${index}.docx`)),
    },
  })
  target.dispatchEvent(event)
  return event
}

async function settled() {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe("prompt drag and drop isolation", () => {
  test("uploads seven files only to the input receiving the drop", async () => {
    const research = composer("research")
    const inspection = composer("inspection")
    drag(inspection.editor, "dragover")
    expect(research.dragging()).toBeNull()
    expect(inspection.dragging()).toBe("image")
    drag(inspection.editor)
    await settled()
    expect(research.calls).toEqual([])
    expect(inspection.calls).toHaveLength(7)
    expect(research.prompt.current().filter((part) => part.type === "image")).toHaveLength(0)
  })

  test("ignores detached, hidden, disabled, and disposed inputs", async () => {
    const detached = composer("detached")
    const hidden = composer("hidden")
    const disabled = composer("disabled")
    const disposed = composer("disposed")
    const modal = composer("modal")
    detached.root.remove()
    hidden.root.hidden = true
    disabled.disable()
    disposed.dispose()
    modal.dialog()
    for (const item of [detached, hidden, disabled, disposed, modal]) drag(item.editor)
    await settled()
    for (const item of [detached, hidden, disabled, disposed, modal]) expect(item.calls).toEqual([])
  })

  test("does not upload drops elsewhere in the document", async () => {
    const input = composer("current")
    drag(document.body)
    await settled()
    expect(input.calls).toEqual([])
  })

  test("claims a drop once even if input regions are nested", async () => {
    const outer = composer("outer")
    const inner = composer("inner", undefined, outer.root)
    drag(inner.editor)
    await settled()
    expect(inner.calls).toHaveLength(7)
    expect(outer.calls).toEqual([])
  })

  test("keeps an in-flight batch on its captured session after navigation and disposal", async () => {
    const gate = Promise.withResolvers<void>()
    const inspection = composer("inspection", gate.promise)
    drag(inspection.editor)
    await settled()
    expect(inspection.calls).toHaveLength(1)
    inspection.dispose()
    inspection.root.remove()
    const research = composer("research")
    gate.resolve()
    await settled()
    expect(inspection.calls).toHaveLength(7)
    expect(inspection.prompt.current().filter((part) => part.type === "image")).toHaveLength(7)
    expect(research.calls).toEqual([])
    expect(research.prompt.current().filter((part) => part.type === "image")).toHaveLength(0)
  })

  test("cleans up repeated mounts and isolates dragged file references", async () => {
    for (let index = 0; index < 4; index++) {
      const old = composer(`old-${index}`)
      old.dispose()
      expect(old.removed.mock.calls.map(([type]) => type).sort()).toEqual(["dragleave", "dragover", "drop"])
      drag(old.editor, "drop", 0, "file:old.txt")
      expect(old.mentions).toEqual([])
    }
    const first = composer("first")
    const current = composer("current")
    drag(current.editor, "drop", 0, "file:current.txt")
    expect(current.mentions).toEqual(["current.txt"])
    expect(first.mentions).toEqual([])
  })
})
