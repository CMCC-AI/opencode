import { describe, expect, test } from "bun:test"
import { discoverSessionArtifacts } from "../agent-workbench/artifacts"
import { mergeSessionArtifactFiles } from "../agent-workbench/artifact-files"
import { MSTOCK_ARTIFACT_ROLES } from "./config"
import { mstockFixture } from "./fixtures"
import { mstockFiles, mstockMention, mstockProgress, mstockScope, mstockWorkbench, shouldUseMstockPage } from "./data"
import { mstockPrompt } from "../../mstock/input"

describe("mstock integration", () => {
  for (const legacy of [false, true])
    test(`nested workers, eight artifacts and cache-free tokens (${legacy})`, () => {
      const data = mstockFixture(legacy)
      const discovery = discoverSessionArtifacts({
        directory: data.directory,
        transcripts: data.transcripts,
        roles: MSTOCK_ARTIFACT_ROLES,
        allowSameAgentPathRewrites: true,
      })
      const scope = mstockScope(data.directory, data.root.metadata, discovery.artifacts)
      expect(scope.root).toBe(data.rootPath)
      expect(scope.warnings.length).toBe(legacy ? 1 : 0)
      const files = mergeSessionArtifactFiles({
        artifacts: discovery.artifacts,
        paths: data.filenames.map((name) => `${data.rootPath}/${name}`),
        rootSessionId: data.root.id,
      })
      const model = mstockWorkbench({
        rootId: data.root.id,
        transcripts: data.transcripts,
        files,
        selected: "overview",
      })
      expect(model.agents.map((node) => node.status)).toEqual(["completed", "completed", "completed"])
      expect(model.artifacts.length).toBe(8)
      expect(model.stats.tokenCount).toBe(165)
      expect(model.textReportPath).toBe(`${data.rootPath}/20-comparison-report.md`)
      expect(model.visualReportPath).toBe(`${data.rootPath}/40-comparison-report.html`)
      expect(model.artifacts.find((file) => file.filename === "45-comparison-report.pdf")?.createdAt).toBe(1700)
      expect(mstockProgress(model, false)).toBe(75)
      expect(mstockProgress(model, true)).toBe(100)
    })
  test("identity uses structured mentions, never the title or a child session", () => {
    const data = mstockFixture()
    const root = data.transcripts[0]
    expect(mstockMention(root.messages, root.parts)).toBe(true)
    expect(shouldUseMstockPage(data.root, "deepinsight", true)).toBe(true)
    expect(shouldUseMstockPage(data.transcripts[1].session, "mstock", true)).toBe(false)
    expect(shouldUseMstockPage({ ...data.root, title: "@mstock/mstock" })).toBe(false)
  })
  test("inputs cannot become output reports and ambiguous directories are not selected", () => {
    const data = mstockFixture()
    const discovery = discoverSessionArtifacts({
      directory: data.directory,
      transcripts: data.transcripts,
      roles: MSTOCK_ARTIFACT_ROLES,
    })
    const original = discovery.artifacts.find((file) => file.role === "text-report")!
    const input = { ...original, path: `${data.rootPath}/inputs/20-comparison-report.md` }
    expect(mstockFiles([input], data.transcripts)[0].role).toBe("supporting")
    const foreign = { ...original, path: "tmp/comparison-workspace/20260917-1203/20-comparison-report.md" }
    expect(mstockScope(data.directory, data.root.metadata, [...discovery.artifacts, foreign]).root).toBeUndefined()
  })
  test("form builds agent/file parts without invented dimension parameters", () => {
    const prompt = mstockPrompt([
      { path: "/user/runs/new/inputs/a.md", title: "报告 A", mime: "text/plain" },
      { path: "/user/runs/new/inputs/b.pdf", title: "报告 B", mime: "application/pdf" },
    ])
    expect(prompt[0]).toMatchObject({ type: "agent", name: "mstock/mstock" })
    expect(prompt.filter((part) => part.type === "file")).toHaveLength(2)
    expect(JSON.stringify(prompt)).not.toContain("comparison_dimensions")
  })

  test("snapshot reports directly at the artifact root share the same directory", () => {
    const data = mstockFixture()
    const files = mergeSessionArtifactFiles({ artifacts: [], paths: data.filenames, rootSessionId: data.root.id })
    const model = mstockWorkbench({ rootId: data.root.id, transcripts: data.transcripts, files, selected: "overview" })
    expect(model.textReportPath).toBe("20-comparison-report.md")
    expect(model.visualReportPath).toBe("40-comparison-report.html")
    expect(model.ambiguities).toEqual([])
  })

  test("workflow rewrites keep the final file but different report directories stay ambiguous", () => {
    const data = mstockFixture()
    const worker = data.transcripts[3]
    const write = worker.parts[worker.messages[1].id]!.find((part) => part.type === "tool")!
    const lead = data.transcripts[1]
    if (write.type !== "tool" || write.state.status !== "completed") throw new Error("fixture")
    lead.parts[lead.messages[1].id] = [
      ...lead.parts[lead.messages[1].id]!,
      {
        ...write,
        id: "lead-rewrite",
        sessionID: lead.session.id,
        messageID: lead.messages[1].id,
        state: { ...write.state, time: { start: 2000, end: 2100 } },
      },
    ]
    const discovery = discoverSessionArtifacts({
      directory: data.directory,
      transcripts: data.transcripts,
      roles: MSTOCK_ARTIFACT_ROLES,
      allowWorkflowPathRewrites: true,
    })
    expect(discovery.artifacts.find((file) => file.role === "text-report")?.partId).toBe("lead-rewrite")
    const text = discovery.artifacts.find((file) => file.role === "text-report")!
    const model = mstockWorkbench({
      rootId: data.root.id,
      transcripts: data.transcripts,
      files: [
        text,
        {
          ...text,
          path: "runs/comparison-test/another/40-comparison-report.html",
          filename: "40-comparison-report.html",
          role: "visual-report",
        },
      ],
      selected: "overview",
    })
    expect(model.textReportPath).toBeUndefined()
    expect(model.visualReportPath).toBeUndefined()
  })
})
