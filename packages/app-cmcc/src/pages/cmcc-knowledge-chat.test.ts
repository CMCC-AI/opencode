import { describe, expect, test } from "bun:test"
import { hasUserPrompt, isKnowledgeChatSession } from "./cmcc-knowledge-chat"

describe("isKnowledgeChatSession", () => {
  test("separates import tasks from chat and legacy sessions", () => {
    expect(isKnowledgeChatSession({ metadata: { cmccKnowledgeKind: "import" } } as never)).toBe(false)
    expect(isKnowledgeChatSession({ metadata: { cmccKnowledgeKind: "chat" } } as never)).toBe(true)
    expect(isKnowledgeChatSession({ metadata: undefined } as never)).toBe(true)
  })
})

describe("hasUserPrompt", () => {
  test("recognizes a synchronized user prompt", () => {
    expect(
      hasUserPrompt(
        [
          {
            info: { role: "user" },
            parts: [{ type: "text", text: "哪些结论缺少证据支持？" }],
          },
        ] as never,
        "哪些结论缺少证据支持？",
      ),
    ).toBe(true)
  })

  test("does not confuse an assistant response or a different prompt with the optimistic prompt", () => {
    expect(
      hasUserPrompt(
        [
          {
            info: { role: "assistant" },
            parts: [{ type: "text", text: "哪些结论缺少证据支持？" }],
          },
          {
            info: { role: "user" },
            parts: [{ type: "text", text: "总结这个笔记本的核心主题" }],
          },
        ] as never,
        "哪些结论缺少证据支持？",
      ),
    ).toBe(false)
  })
})
