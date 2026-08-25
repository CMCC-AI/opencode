import { describe, expect, test } from "bun:test"
import type { Message, Part, Session } from "@opencode-ai/sdk/v2"
import { buildWorkbenchStats, collectSearchUrlEvents, collectUniqueSearchUrls, sumSessionTokens } from "./statistics"
import type { SessionTranscript } from "./model"

const session = (id: string, tokens?: Session["tokens"]): Session => ({
  id,
  slug: id,
  projectID: "project",
  directory: "C:\\workspace",
  title: id,
  version: "test",
  tokens,
  time: { created: 100, updated: 500 },
})

const user: Message = {
  id: "user",
  sessionID: "root",
  role: "user",
  time: { created: 100 },
  agent: "lead",
  model: { providerID: "test", modelID: "test" },
}

const assistant = (sessionID: string): Message => ({
  id: `assistant-${sessionID}`,
  sessionID,
  role: "assistant",
  time: { created: 200, completed: 400 },
  parentID: "user",
  modelID: "test",
  providerID: "test",
  mode: "test",
  agent: "agent",
  path: { cwd: "C:\\workspace", root: "C:\\" },
  cost: 0,
  tokens: { input: 999, output: 999, reasoning: 999, cache: { read: 999, write: 999 } },
})

const search = (id: string, sessionID: string, output: string, tool = "websearch", end = 300): Part => ({
  id,
  sessionID,
  messageID: `assistant-${sessionID}`,
  type: "tool",
  callID: id,
  tool,
  state: {
    status: "completed",
    input: {},
    output,
    title: tool,
    metadata: {},
    time: { start: 200, end },
  },
})

const transcript = (value: Session, messages: Message[], parts: Part[]): SessionTranscript => {
  const byMessage: Record<string, Part[]> = {}
  for (const part of parts) byMessage[part.messageID] = [...(byMessage[part.messageID] ?? []), part]
  return { session: value, messages, parts: byMessage }
}

describe("agent workbench statistics", () => {
  test("sums input, output and reasoning while excluding cache and message tokens", () => {
    const sessions = [
      session("root", { input: 10, output: 20, reasoning: 30, cache: { read: 1000, write: 2000 } }),
      session("child", { input: 1, output: 2, reasoning: 3, cache: { read: 3000, write: 4000 } }),
    ]
    expect(sumSessionTokens(sessions)).toBe(66)
  })

  test("counts unique JSON and URL-line websearch results across child sessions only", () => {
    const first = transcript(
      session("first"),
      [assistant("first")],
      [
        search(
          "s1",
          "first",
          JSON.stringify({ results: [{ url: " https://example.com/a " }, { url: "https://example.com/b" }] }),
        ),
      ],
    )
    const second = transcript(
      session("second"),
      [assistant("second")],
      [
        search(
          "s2",
          "second",
          [
            "Title: A result",
            "URL: https://example.com/a",
            "Text: result detail",
            "URL: https://example.com/c?source=search",
          ].join("\n"),
        ),
        search("s3", "second", JSON.stringify({ results: [{ url: "https://example.com/fetch" }] }), "webfetch"),
      ],
    )
    expect([...collectUniqueSearchUrls([first, second])].sort()).toEqual([
      "https://example.com/a",
      "https://example.com/b",
      "https://example.com/c?source=search",
    ])
  })

  test("does not infer URLs from prose, markdown or malformed search output", () => {
    const invalid: string[] = []
    const child = transcript(
      session("child"),
      [assistant("child")],
      [
        search(
          "s1",
          "child",
          [
            "正文链接：https://example.com/prose",
            "[Markdown 链接](https://example.com/markdown)",
            "- URL: https://example.com/list-item",
          ].join("\n"),
        ),
      ],
    )

    expect(
      collectUniqueSearchUrls([child], (item) => invalid.push(`${item.sessionId}/${item.messageId}/${item.partId}`))
        .size,
    ).toBe(0)
    expect(invalid).toEqual(["child/assistant-child/s1"])
  })

  test("keeps completed websearch URLs in chronological replay order", () => {
    const child = transcript(
      session("child"),
      [assistant("child")],
      [
        search("later", "child", JSON.stringify({ results: [{ url: "https://example.com/later" }] }), "websearch", 400),
        search(
          "earlier",
          "child",
          JSON.stringify({
            results: [{ url: "https://example.com/earlier" }, { url: "https://example.com/earlier" }],
          }),
          "websearch",
          250,
        ),
      ],
    )

    expect(collectSearchUrlEvents([child])).toEqual([
      {
        completedAt: 250,
        sessionId: "child",
        messageId: "assistant-child",
        partId: "earlier",
        urls: ["https://example.com/earlier"],
      },
      {
        completedAt: 400,
        sessionId: "child",
        messageId: "assistant-child",
        partId: "later",
        urls: ["https://example.com/later"],
      },
    ])
  })

  test("derives the configured expert count without inventing missing experts", () => {
    const root = transcript(
      session("root", { input: 10, output: 20, reasoning: 30, cache: { read: 500, write: 600 } }),
      [user, assistant("root")],
      [],
    )
    const child = transcript(
      session("child", { input: 1, output: 2, reasoning: 3, cache: { read: 50, write: 60 } }),
      [assistant("child")],
      [search("s1", "child", JSON.stringify({ results: [{ url: "https://example.com" }] }))],
    )
    const stats = buildWorkbenchStats({ root, children: [child], expertCount: 9, running: false, now: 900 })

    expect(stats).toEqual({ elapsedMs: 300, tokenCount: 66, uniqueSearchUrlCount: 1, expertCount: 9 })
  })
})
