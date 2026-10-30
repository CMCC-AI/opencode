import { describe, expect, test } from "bun:test"
import { isAttachmentReference } from "@opencode-ai/core/util/attachment-reference"
import { buildRequestParts } from "@/components/prompt-input/build-request-parts"
import { decodeFilePath } from "@/context/file/path"
import { extractWorkbenchMessages } from "../session/agent-workbench/session-adapter"
import { mstockPrompt } from "./input"

describe("mstock attachment references", () => {
  const history = {
    path: "/workspace/runs/one/inputs/history/source-1/30-final-report.md",
    title: "历史报告",
    mime: "text/plain",
  }
  const upload = {
    path: "/workspace/runs/one/inputs/uploads/外部 报告.docx",
    title: "外部 报告.docx",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  }

  for (const [name, files] of [
    ["history only", [history, { ...history, path: history.path.replace("source-1", "source-2") }]],
    ["uploads only", [upload, { ...upload, path: upload.path.replace(".docx", ".pdf"), mime: "application/pdf" }]],
    ["mixed", [history, upload]],
  ] as const) {
    test(`${name} preserves references through request and conversation rendering`, () => {
      const prompt = mstockPrompt([...files])
      const text = prompt.map((part) => ("content" in part ? part.content : "")).join("")
      const message = {
        id: "msg_mstock",
        sessionID: "ses_mstock",
        role: "user" as const,
        time: { created: 1 },
        agent: "build",
        model: { providerID: "test", modelID: "test" },
      }
      const parts = buildRequestParts({
        prompt,
        context: [],
        images: [],
        text,
        messageID: message.id,
        sessionID: message.sessionID,
        sessionDirectory: "/workspace",
      })
      const attachments = parts.requestParts.filter((part) => part.type === "file")
      expect(attachments).toHaveLength(files.length)
      for (const [index, part] of attachments.entries()) {
        expect(isAttachmentReference(part.url)).toBe(true)
        expect(part.filename).toBe(files[index]!.title)
        expect(part.mime).toBe(files[index]!.mime)
        expect(decodeFilePath(new URL(part.url).pathname)).toBe(files[index]!.path)
      }
      expect(parts.requestParts.filter((part) => part.type === "text")).toEqual([expect.objectContaining({ text })])
      expect(parts.requestParts).toContainEqual(expect.objectContaining({ type: "agent", name: "mstock/mstock" }))
      expect(parts.optimisticParts.filter((part) => part.type === "file").map((part) => part.url)).toEqual(
        attachments.map((part) => part.url),
      )
      const messages = extractWorkbenchMessages([message], { [message.id]: parts.optimisticParts })
      expect(messages).toHaveLength(1)
      expect(messages[0]?.text).toBe(text)
      expect(messages[0]?.attachments).toEqual(
        attachments.map((part, index) => ({ filename: files[index]!.title, mime: part.mime, url: part.url })),
      )
    })
  }

  for (const path of ["/workspace/runs/one/inputs/财报 A #1%.md", "D:\\workspace\\runs\\one\\inputs\\财报 A #1%.md"]) {
    test(`encodes a reference without changing its path: ${path}`, () => {
      const part = mstockPrompt([{ ...history, path }]).find((part) => part.type === "file")!
      expect(isAttachmentReference(part.url!)).toBe(true)
      expect(new URL(part.url!).hash).toBe("")
      expect(decodeFilePath(new URL(part.url!).pathname)).toBe(
        path.startsWith("D:") ? `/${path.replaceAll("\\", "/")}` : path,
      )
    })
  }
})
