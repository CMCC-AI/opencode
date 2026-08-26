import { describe, expect, test } from "bun:test"
import type { DockApiCaseSnapshot } from "@/context/dockapi"
import { caseReplayFrame, compileCaseReplay } from "./replay"

describe("case replay timeline", () => {
  test("keeps real session order and includes dynamic DeepCampaign children", () => {
    const snapshot = {
      schemaVersion: 1,
      caseCode: "case-one",
      capturedAt: "2026-08-26T00:00:00Z",
      rootSessionId: "root",
      query: "营销分析",
      agentType: "deepcampaign",
      rootAgent: "deepcampaign/deepcampaign-team-lead",
      artifacts: [],
      sessions: [
        entry("root", 100, undefined, "deepcampaign/deepcampaign-team-lead", "root-user"),
        entry("child-late", 300, "root", "deepcampaign/custom-agent-2", "late-user"),
        entry("child-early", 200, "root", "deepcampaign/custom-agent-1", "early-user"),
      ],
    } as DockApiCaseSnapshot

    const timeline = compileCaseReplay(snapshot)
    const sessionCues = timeline.cues.filter((cue) => cue.type === "session")

    expect(sessionCues.map((cue) => (cue.type === "session" ? cue.sessionId : ""))).toEqual([
      "root",
      "child-early",
      "child-late",
    ])
    expect(caseReplayFrame(timeline, 0).sessionIds.size).toBe(0)
    expect(caseReplayFrame(timeline, 0.01).sessionIds).toContain("root")
    expect(caseReplayFrame(timeline, 0.01).messageIds).toContain("root-user")
    expect(caseReplayFrame(timeline, 0.01).partIds).toContain("root-user-part")
    expect(caseReplayFrame(timeline, 1).sessionIds).toEqual(new Set(["root", "child-late", "child-early"]))
    expect(caseReplayFrame(timeline, 1).messageIds.size).toBe(3)
    expect(caseReplayFrame(timeline, 1).partIds.size).toBe(3)
  })
})

function entry(id: string, created: number, parentID: string | undefined, agent: string, messageID: string) {
  return {
    session: {
      id,
      slug: id,
      projectID: "case",
      directory: "case://workspace",
      title: id,
      version: "v2",
      parentID,
      agent,
      time: { created, updated: created + 10 },
    },
    status: { type: "idle" },
    messages: [
      {
        info: { id: messageID, sessionID: id, role: "user", agent, model: { providerID: "p", modelID: "m" }, time: { created: created + 1 } },
        parts: [{ id: `${messageID}-part`, sessionID: id, messageID, type: "text", text: id }],
      },
    ],
  }
}
