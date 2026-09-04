import { describe, expect, test } from "bun:test"
import type { AgentNodeView, SessionArtifact } from "../agent-workbench/model"
import { AI_SCIENCE_DAG_EDGES, AI_SCIENCE_DAG_LEVELS } from "./topology"
import {
  aiScienceOutOfArtifactWriteCount,
  aiScienceProgress,
  buildAiScienceArtifactTree,
  isAiScienceDagEdgeActive,
  isAiScienceVisibleArtifactPath,
  mergeAiScienceArtifacts,
} from "./data"

const node = (id: string, status: AgentNodeView["status"]): AgentNodeView => ({
  id,
  name: id,
  profession: id,
  status,
  markdown: "",
})

const artifact = (path: string, ownerAgentId = "agent"): SessionArtifact => ({
  path,
  filename: path.split("/").at(-1) ?? path,
  ownerAgentId,
  ownerSessionId: "child",
  messageId: "message",
  partId: "part",
  role: "supporting",
})

describe("AI for Science workbench data", () => {
  test("keeps all configured members in the capability DAG exactly once", () => {
    const ids = AI_SCIENCE_DAG_LEVELS.flat()
    expect(ids.length).toBe(20)
    expect(new Set(ids).size).toBe(ids.length)
    expect(AI_SCIENCE_DAG_EDGES.every(([source, target]) => ids.includes(source) && ids.includes(target))).toBe(true)
  })

  test("activates a connection only after both endpoint agents have started", () => {
    expect(isAiScienceDagEdgeActive("waiting", "completed")).toBe(false)
    expect(isAiScienceDagEdgeActive("completed", "waiting")).toBe(false)
    expect(isAiScienceDagEdgeActive("running", "completed")).toBe(true)
  })

  test("reserves 100 percent for a completed root session", () => {
    const nodes = AI_SCIENCE_DAG_LEVELS.flat().map((id, index) => node(id, index < 4 ? "completed" : "waiting"))
    expect(aiScienceProgress({ nodes, overviewStatus: "running" })).toBe(20)
    expect(aiScienceProgress({ nodes, overviewStatus: "completed" })).toBe(100)
  })

  test("merges directory files with write ownership and removes runtime caches", () => {
    const root = "runs/session-1"
    const written = [
      artifact(`${root}/deliverables/report.md`, "writer"),
      artifact("requirements.txt", "engineer"),
    ]
    const result = mergeAiScienceArtifacts({
      artifactRoot: root,
      scannedPaths: [
        `${root}/deliverables/report.md`,
        `${root}/experiments/result.npy`,
        `${root}/code/__pycache__/module.pyc`,
        `${root}/code/.pytest_cache/README.md`,
      ],
      writtenArtifacts: written,
      rootSessionId: "root",
    })

    expect(result.map((item) => item.path)).toEqual([
      `${root}/deliverables/report.md`,
      `${root}/experiments/result.npy`,
    ])
    expect(result[0]?.ownerAgentId).toBe("writer")
    expect(result[1]?.ownerAgentId).toBe("")
    expect(aiScienceOutOfArtifactWriteCount(written, root)).toBe(1)
    expect(isAiScienceVisibleArtifactPath("code/module.py")).toBe(true)
  })

  test("groups a large artifact set into a stable directory tree", () => {
    const root = "runs/session-1"
    const tree = buildAiScienceArtifactTree(
      [
        artifact(`${root}/deliverables/report.md`),
        artifact(`${root}/experiments/run-1/result.npy`),
        artifact(`${root}/00-input.json`),
      ],
      root,
    )

    expect(tree.map((item) => item.name)).toEqual(["deliverables", "experiments", "00-input.json"])
    expect(tree[1]?.children[0]?.children[0]?.artifact?.filename).toBe("result.npy")
  })
})
