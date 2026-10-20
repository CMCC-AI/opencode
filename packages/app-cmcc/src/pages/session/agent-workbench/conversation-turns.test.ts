import { describe, expect, test } from "bun:test"
import type { WorkbenchMessage } from "./model"
import { groupWorkbenchMessages } from "./conversation-turns"

const user = (id: string): WorkbenchMessage => ({ id, role: "user", text: id })
const reply = (id: string, parentID?: string): WorkbenchMessage => ({ id, role: "assistant", text: id, parentID })

describe("workbench conversation groups", () => {
  test("groups all of an expert's replies without exposing internal prompts", () => {
    const messages = [reply("a1", "internal-1"), reply("a2", "internal-2"), reply("a3", "internal-2")]
    expect(groupWorkbenchMessages(messages)).toEqual([{ id: "a1", replies: messages }])
    expect(groupWorkbenchMessages([])).toEqual([])
  })

  test("keeps overlapping replies with their actual user question", () => {
    const messages = [user("u1"), reply("a1", "u1"), user("u2"), reply("a2", "u1"), reply("a3", "u2")]
    expect(groupWorkbenchMessages(messages)).toEqual([
      { id: "u1", user: messages[0], replies: [messages[1], messages[3]] },
      { id: "u2", user: messages[2], replies: [messages[4]] },
    ])
    expect(messages.map((message) => message.id)).toEqual(["u1", "a1", "u2", "a2", "a3"])
  })

  test("supports historical snapshots without parent IDs and a pending question", () => {
    const messages = [user("u1"), reply("a1"), reply("a2"), user("u2")]
    expect(groupWorkbenchMessages(messages)).toEqual([
      { id: "u1", user: messages[0], replies: [messages[1], messages[2]] },
      { id: "u2", user: messages[3], replies: [] },
    ])
  })

  test("retains replies whose parent is outside the loaded history", () => {
    const messages = [reply("a1", "unloaded"), reply("a2", "unloaded"), user("u1"), reply("a3", "u1")]
    expect(groupWorkbenchMessages(messages)).toEqual([
      { id: "unloaded", replies: [messages[0], messages[1]] },
      { id: "u1", user: messages[2], replies: [messages[3]] },
    ])
  })
})
