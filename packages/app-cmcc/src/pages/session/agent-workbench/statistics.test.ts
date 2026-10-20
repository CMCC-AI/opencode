import { describe, expect, test } from "bun:test"
import type { Message, Part, Session } from "@opencode-ai/sdk/v2"
import {
  buildWorkbenchStats,
  calculateElapsedMs,
  collectDeepAnalysisUrlEvents,
  collectSearchUrlEvents,
  collectUniqueSearchUrls,
  sumSessionTokens,
} from "./statistics"
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

const assistant = (sessionID: string): Extract<Message, { role: "assistant" }> => ({
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

const webfetch = (id: string, sessionID: string, url: string, end = 300): Part => ({
  id,
  sessionID,
  messageID: `assistant-${sessionID}`,
  type: "tool",
  callID: id,
  tool: "webfetch",
  state: {
    status: "completed",
    input: { url, format: "markdown" },
    output: "Fetched page body with https://example.com/output-only",
    title: url,
    metadata: {},
    time: { start: 200, end },
  },
})

const failedWebfetch = (id: string, sessionID: string, url: string, end = 300): Part => ({
  id,
  sessionID,
  messageID: `assistant-${sessionID}`,
  type: "tool",
  callID: id,
  tool: "webfetch",
  state: {
    status: "error",
    input: { url },
    error: "fetch failed",
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

  test("combines websearch results with successful webfetch inputs for DeepTrading", () => {
    const child = transcript(
      session("child"),
      [assistant("child")],
      [
        search(
          "search",
          "child",
          JSON.stringify({
            results: [{ url: "https://example.com/search" }, { url: "https://example.com/shared" }],
          }),
          "websearch",
          250,
        ),
        webfetch("fetch", "child", "https://example.com/fetched", 300),
        webfetch("duplicate", "child", "https://example.com/shared", 325),
        failedWebfetch("failed", "child", "https://example.com/failed", 350),
        webfetch("unsupported", "child", "file:///tmp/source", 375),
      ],
    )

    const events = collectDeepAnalysisUrlEvents([child])
    expect(events.map((event) => event.partId)).toEqual(["search", "fetch", "duplicate"])
    expect([...new Set(events.flatMap((event) => event.urls))].sort()).toEqual([
      "https://example.com/fetched",
      "https://example.com/search",
      "https://example.com/shared",
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

describe("agent workbench elapsed time", () => {
  const minute = 60_000
  const day = 24 * 60 * minute
  const question = (id: string, created: number, sessionID = "root"): Message => ({
    ...user,
    id,
    sessionID,
    time: { created },
  })
  const reply = (
    id: string,
    parentID: string,
    start: number,
    end?: number,
    sessionID = "root",
  ): Extract<Message, { role: "assistant" }> => ({
    ...assistant(sessionID),
    id,
    role: "assistant",
    parentID,
    time: { created: start, completed: end },
    finish: "stop",
  })
  const first = () => transcript(session("root"), [question("u1", 0), reply("a1", "u1", 100, 10 * minute)], [])

  test("excludes overnight idle time from completed followups and repeated reads", () => {
    const root = first()
    root.messages = [...root.messages, question("u2", day), reply("a2", "u2", day + 100, day + minute)]
    expect(calculateElapsedMs({ root, transcripts: [root], running: false, now: day + minute })).toBe(11 * minute)
    expect(calculateElapsedMs({ root, transcripts: [root], running: false, now: 3 * day })).toBe(11 * minute)
  })

  test("starts the running followup at the new question and freezes it when completed", () => {
    const root = first()
    root.messages = [...root.messages, question("u2", day)]
    root.status = { type: "busy" }
    expect(calculateElapsedMs({ root, transcripts: [root], running: true, now: day })).toBe(10 * minute)
    expect(calculateElapsedMs({ root, transcripts: [root], running: true, now: day + 30_000 })).toBe(
      10 * minute + 30_000,
    )
    root.messages = [...root.messages, reply("a2", "u2", day + 100, day + minute)]
    expect(calculateElapsedMs({ root, transcripts: [root], running: true, now: 2 * day })).toBe(11 * minute)
    expect(calculateElapsedMs({ root, transcripts: [root], running: false, now: 2 * day })).toBe(11 * minute)
  })

  test("does not reopen an old completed turn when the busy event arrives before the new question", () => {
    const root = first()
    root.status = { type: "busy" }
    expect(calculateElapsedMs({ root, transcripts: [root], running: true, now: day })).toBe(10 * minute)
  })

  test("unions parallel experts and overlapping root turns instead of adding them twice", () => {
    const root = transcript(
      session("root"),
      [question("u1", 100), question("u2", 250), reply("a1", "u1", 150, 400), reply("a2", "u2", 350, 550)],
      [],
    )
    const left = transcript(session("left"), [question("lu", 200, "left"), reply("la", "lu", 210, 500, "left")], [])
    const right = transcript(session("right"), [question("ru", 300, "right"), reply("ra", "ru", 310, 600, "right")], [])
    expect(calculateElapsedMs({ root, transcripts: [root, left, right], running: false, now: 900 })).toBe(500)
  })

  test("keeps each expert's separate executions apart when its session is reused", () => {
    const root = first()
    const child = transcript(
      session("child"),
      [
        question("c1", 100, "child"),
        reply("ca1", "c1", 200, 9 * minute, "child"),
        question("c2", day, "child"),
        reply("ca2", "c2", day + 100, day + minute, "child"),
      ],
      [],
    )
    expect(calculateElapsedMs({ root, transcripts: [root, child], running: false, now: 2 * day })).toBe(11 * minute)
    child.messages = [...child.messages, question("c3", 2 * day, "child")]
    child.status = { type: "retry", attempt: 1, message: "retry", next: 2 * day + 1000 }
    expect(calculateElapsedMs({ root, transcripts: [root, child], running: true, now: 2 * day + 30_000 })).toBe(
      11 * minute + 30_000,
    )
  })

  test("includes tool completion and failures without using session metadata timestamps", () => {
    const root = transcript(session("root"), [question("u1", 100), reply("a1", "u1", 150, 250)], [])
    const tool = search("work", "root", "ok", "bash", 600)
    tool.messageID = "a1"
    root.parts.a1 = [tool]
    root.session.time.updated = day
    expect(calculateElapsedMs({ root, transcripts: [root], running: false, now: 2 * day })).toBe(500)
    if (tool.type !== "tool" || tool.state.status !== "completed") throw new Error("Invalid test fixture")
    tool.state = { status: "error", input: {}, error: "failed", time: { start: 200, end: 700 } }
    expect(calculateElapsedMs({ root, transcripts: [root], running: false, now: 2 * day })).toBe(600)
  })

  test("freezes incomplete idle executions at their last recorded activity", () => {
    const root = transcript(session("root"), [question("u1", 100), reply("a1", "u1", 150)], [])
    root.parts.a1 = [
      { id: "text", messageID: "a1", sessionID: "root", type: "text", text: "partial", time: { start: 150, end: 400 } },
    ]
    root.session.time.updated = day
    expect(calculateElapsedMs({ root, transcripts: [root], running: false, now: 2 * day })).toBe(300)
    expect(calculateElapsedMs({ root, transcripts: [root], running: true, now: 500 })).toBe(400)
  })

  test("does not let a closed root turn hide a still-running child", () => {
    const root = first()
    const child = transcript(
      session("child"),
      [question("cu", 100, "child"), reply("ca", "cu", 200, undefined, "child")],
      [],
    )
    child.status = { type: "busy" }
    expect(calculateElapsedMs({ root, transcripts: [root, child], running: true, now: 11 * minute })).toBe(11 * minute)
  })

  test("uses only recorded assistant times when an old snapshot has no child user message", () => {
    const root = first()
    const child = transcript(session("child"), [reply("orphan", "missing", day, day + minute, "child")], [])
    expect(calculateElapsedMs({ root, transcripts: [root, child], running: false, now: 2 * day })).toBe(11 * minute)
  })

  test("handles unordered historical messages without changing their original order", () => {
    const root = first()
    const child = transcript(
      session("child"),
      [
        reply("later", "missing", day + 30_000, day + minute, "child"),
        reply("earlier", "missing", day, day + 30_000, "child"),
      ],
      [],
    )
    expect(calculateElapsedMs({ root, transcripts: [root, child], running: false, now: 2 * day })).toBe(11 * minute)
    expect(child.messages.map((message) => message.id)).toEqual(["later", "earlier"])
  })

  test("does not create time from missing records or invalid timestamps", () => {
    const root = transcript(session("root"), [question("u1", 100)], [])
    root.session.time.updated = day
    expect(calculateElapsedMs({ root, transcripts: [root], running: false, now: day })).toBe(0)
    root.messages = [...root.messages, reply("bad", "u1", NaN, Infinity)]
    expect(calculateElapsedMs({ root, transcripts: [root], running: false, now: NaN })).toBe(0)
    root.messages = []
    expect(calculateElapsedMs({ root, transcripts: [root], running: true, now: day })).toBe(0)
  })
})
