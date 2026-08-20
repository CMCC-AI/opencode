import { describe, expect, test } from "bun:test"
import { createRoot, getOwner, onCleanup } from "solid-js"
import { createTabMemory } from "./tab-memory"
import type { DraftTab } from "./tabs"

describe("tab memory", () => {
  test("keeps state until its tab is removed", () => {
    createRoot((dispose) => {
      const memory = createTabMemory(getOwner())
      let disposed = 0
      const first = memory.ensure("tab", "prompt", () => {
        onCleanup(() => disposed++)
        return { value: "prompt" }
      })

      expect(memory.ensure("tab", "prompt", () => ({ value: "other" }))).toBe(first)
      expect(memory.ensure("other", "prompt", () => ({ value: "other" }))).not.toBe(first)

      memory.remove("tab")
      expect(disposed).toBe(1)
      expect(memory.ensure("tab", "prompt", () => ({ value: "new" }))).not.toBe(first)
      dispose()
    })
  })

  test("persists the draft artifact and expert scope", () => {
    const draft: DraftTab = {
      type: "draft",
      draftID: "draft-one",
      server: "server-one" as DraftTab["server"],
      directory: "/srv/runtime",
      artifactDirectory: "/srv/runtime/runs/one",
      expertID: "deeptrading",
      agent: "deeptrading",
    }
    const restored = JSON.parse(JSON.stringify(draft)) as DraftTab

    expect(restored.directory).toBe("/srv/runtime")
    expect(restored.artifactDirectory).toBe("/srv/runtime/runs/one")
    expect(restored.expertID).toBe("deeptrading")
  })
})
