import { describe, expect, test } from "bun:test"
import { mobileHistoryHref, mobileOpenCodeMode, type MobileAgents } from "./history"

const agents = {
  finance: { id: "deeptrading", quick: "deeptrading/deeptrading-lite-quick", analysis: "deeptrading/deeptrading-quick" },
  shopping: { id: "shoppers-pro", quick: "shoppers-pro/shoppers-pro-quick" },
  research: { id: "deepinsight", quick: "deepinsight/deepinsight-quick", lead: "deepinsight/deepinsight-team-lead" },
  lens: { id: "deeplens", quick: "deeplens/deeplens-quick" },
} satisfies MobileAgents

const mode = (agent: string | undefined, agentType: string) =>
  mobileOpenCodeMode({ agent, time: { created: 1, updated: 1 } }, agentType, "deepinsight", agents)

describe("mobile history classification", () => {
  test("uses the actual agent to identify the supported OpenCode conversations", () => {
    expect(mode("build", "deepinsight")).toEqual({ assistant: "lingxi", agent: "build" })
    expect(mode("plan", "deepinsight")).toEqual({ assistant: "lingxi", agent: "build" })
    expect(mode(agents.finance.quick, "deeptrading")).toEqual({
      assistant: "finance", agent: agents.finance.quick,
    })
    expect(mode(agents.finance.analysis, "deeptrading")).toEqual({ assistant: "finance", agent: agents.finance.analysis })
    expect(mode(agents.shopping.quick, "shoppers-pro")).toEqual({
      assistant: "shopping", agent: agents.shopping.quick,
    })
    expect(mode("deepinsight/deepinsight-team-lead", "deepinsight")).toEqual({ research: true })
    expect(mode(agents.research.quick, "deepinsight")).toEqual({ assistant: "deepinsight", agent: agents.research.quick })
    expect(mode(agents.lens.quick, "deeplens")).toEqual({ assistant: "deeplens", agent: agents.lens.quick })
  })

  test("rejects missing, unsupported, mismatched, child and archived sessions", () => {
    expect(mode(undefined, "deepinsight")).toBeUndefined()
    expect(mode("deeptrading/deeptrading-team-lead", "deeptrading")).toBeUndefined()
    expect(mode(agents.finance.analysis, "deepinsight")).toBeUndefined()
    expect(mode(agents.lens.quick, "deepinsight")).toBeUndefined()
    expect(mode("shoppers-pro/shoppers-pro-team-lead", "shoppers-pro")).toBeUndefined()
    expect(mobileOpenCodeMode({
      agent: "build", parentID: "other", time: { created: 1, updated: 1 },
    }, "deepinsight", "deepinsight", agents)).toBeUndefined()
    expect(mobileOpenCodeMode({
      agent: "build", time: { created: 1, updated: 1, archived: 2 },
    }, "deepinsight", "deepinsight", agents)).toBeUndefined()
  })

  test("keeps identical IDs from different research sources distinct", () => {
    expect(mobileHistoryHref("opencode", "a/b")).toBe("/mobile/history/opencode/a%2Fb")
    expect(mobileHistoryHref("langgraph", "a/b")).toBe("/mobile/history/langgraph/a%2Fb")
  })
})
