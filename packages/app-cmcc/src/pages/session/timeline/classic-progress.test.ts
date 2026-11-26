import { expect, test } from "bun:test"
import type { Part } from "@opencode-ai/sdk/v2"
import { splitClassicProgress } from "./classic-progress"

const text = (id: string, messageID = "reply") => ({ messageID, part: { id, type: "text" } as Part })
const tool = (name: string) => ({ messageID: "reply", part: { id: name, type: "tool", tool: name } as Part })
const reasoning = { messageID: "reply", part: { id: "reason", type: "reasoning" } as Part }

test("combines the reasoning, preambles and tools in order without folding the answer or report link", () => {
  const progress = [reasoning, text("before"), tool("skill"), text("between"), tool("bash"), reasoning]
  const answer = [text("answer"), text("report link")]
  const parts = splitClassicProgress([...progress, ...answer], true)
  expect(parts).toEqual({ progress, answer })
})

test("keeps normal answers visible and does not fold user-facing questions", () => {
  const answer = [text("first paragraph"), tool("question"), text("second paragraph")]
  expect(splitClassicProgress(answer, true)).toEqual({ progress: [], answer })
})

test("keeps the last block of the answer when a finished run writes the report after it", () => {
  const preamble = text("progress", "earlier")
  const answer = [text("answer"), text("report link")]
  const reportWrite = tool("write")
  const parts = [preamble, ...answer, reportWrite]
  expect(splitClassicProgress(parts, true)).toEqual({ progress: [preamble, reportWrite], answer })
  expect(splitClassicProgress(parts, false)).toEqual({ progress: parts, answer: [] })
})
