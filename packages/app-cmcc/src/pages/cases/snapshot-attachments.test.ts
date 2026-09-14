import { expect, test } from "bun:test"
import type { DockApiCaseSnapshot } from "@/context/dockapi"
import { resolveCaseSnapshotAttachments } from "./snapshot-attachments"

const reference = `case://attachments/version-one/${"a".repeat(64)}.png`
const base = "https://example.test/api/dockapi/case-preview/ticket"

test("resolves tool attachments without changing user uploads, content or file inventory", () => {
  const snapshot = fixture(reference)
  const originalText = snapshot.sessions[0].messages[0].parts[2]
  const files = snapshot.artifacts
  expect(resolveCaseSnapshotAttachments(snapshot, base)).toBe(snapshot)
  const parts = snapshot.sessions[0].messages[0].parts
  expect(parts[0]).toHaveProperty("url", reference)
  expect(parts[1]).toHaveProperty("state.attachments.0.url", `${base}/attachments/version-one/${"a".repeat(64)}.png`)
  expect(parts[2]).toBe(originalText)
  expect(parts[2]).toHaveProperty("text", reference)
  expect(snapshot.artifacts).toBe(files)
})

test.each([
  "data:image/png;base64,AA==",
  "https://example.test/image.png",
  "case://attachments/../secret.png",
  "case://attachments/version-one/not-a-hash.png",
])("preserves legacy or unsupported URLs: %s", (url) => {
  const snapshot = fixture(url)
  resolveCaseSnapshotAttachments(snapshot, base)
  expect(snapshot.sessions[0].messages[0].parts[0]).toHaveProperty("url", url)
})

function fixture(url: string) {
  return {
    schemaVersion: 1,
    caseCode: "case-one",
    artifacts: [],
    capturedAt: "2026-09-14",
    rootSessionId: "root",
    query: "test",
    agentType: "deepinsight",
    rootAgent: "build",
    sessions: [
      {
        session: {
          id: "root",
          slug: "root",
          projectID: "test",
          directory: "case://workspace",
          title: "test",
          version: "test",
          time: { created: 1, updated: 2 },
        },
        status: { type: "idle" },
        messages: [
          {
            info: {
              id: "message",
              sessionID: "root",
              role: "user",
              time: { created: 1 },
              agent: "build",
              model: { providerID: "test", modelID: "test" },
            },
            parts: [
              { id: "file", sessionID: "root", messageID: "message", type: "file", mime: "image/png", url },
              {
                id: "tool",
                sessionID: "root",
                messageID: "message",
                type: "tool",
                tool: "read",
                callID: "call",
                state: {
                  status: "completed",
                  input: {},
                  output: "",
                  title: "read",
                  metadata: {},
                  time: { start: 1, end: 2 },
                  attachments: [
                    { id: "attachment", sessionID: "root", messageID: "message", type: "file", mime: "image/png", url },
                  ],
                },
              },
              { id: "text", sessionID: "root", messageID: "message", type: "text", text: reference },
            ],
          },
        ],
      },
    ],
  } as DockApiCaseSnapshot
}
