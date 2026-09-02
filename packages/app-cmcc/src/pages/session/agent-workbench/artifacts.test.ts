import { describe, expect, test } from "bun:test"
import type { Message, Part, Session } from "@opencode-ai/sdk/v2"
import { artifactByRole, discoverSessionArtifacts } from "./artifacts"
import type { SessionTranscript } from "./model"

const directory = "D:\\workspace\\u-2"

const session: Session = {
  id: "child",
  slug: "child",
  projectID: "project",
  directory,
  title: "child",
  agent: "deeptrading/dt-report-writer",
  version: "test",
  time: { created: 10, updated: 20 },
}

const message: Message = {
  id: "assistant",
  sessionID: session.id,
  role: "assistant",
  time: { created: 10, completed: 20 },
  parentID: "user",
  modelID: "test",
  providerID: "test",
  mode: "test",
  agent: session.agent!,
  path: { cwd: directory, root: "D:\\workspace" },
  cost: 0,
  tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
}

const write = (id: string, filePath: string, metadataPath = filePath, content = "ok"): Part => ({
  id,
  sessionID: session.id,
  messageID: message.id,
  type: "tool",
  callID: id,
  tool: "write",
  state: {
    status: "completed",
    input: { filePath, content },
    output: "ok",
    title: filePath,
    metadata: { filepath: metadataPath },
    time: { start: 10, end: 20 },
  },
})

const transcript = (parts: Part[]): SessionTranscript => ({
  session,
  messages: [message],
  parts: { [message.id]: parts },
})

describe("agent workbench artifacts", () => {
  test("keeps current-workspace artifacts and ignores external temporary files", () => {
    const report = `${directory}\\tmp\\trading-workspace\\run-1\\30-final-report.md`
    const result = discoverSessionArtifacts({
      directory,
      transcripts: [transcript([report, "C:\\Temp\\calculation.py"].map((path, index) => write(`p${index}`, path)))],
      roles: { "30-final-report.md": { role: "text-report" } },
    })

    expect(result.artifacts.map((artifact) => artifact.path)).toEqual([
      "tmp/trading-workspace/run-1/30-final-report.md",
    ])
    expect(result.ambiguities).toEqual([])
    expect(artifactByRole(result, "text-report")?.filename).toBe("30-final-report.md")
    expect(artifactByRole(result, "text-report")?.sizeBytes).toBe(2)
  })

  test("measures UTF-8 write content without reading unrelated files", () => {
    const report = `${directory}\\tmp\\trading-workspace\\run-1\\30-final-report.md`
    const result = discoverSessionArtifacts({
      directory,
      transcripts: [transcript([write("p1", report, report, "贵州茅台")])],
      roles: { "30-final-report.md": { role: "text-report" } },
    })

    expect(result.artifacts[0]?.sizeBytes).toBe(12)
  })

  test("keeps an earlier report write when a later same-agent session only reads it", () => {
    const report = `${directory}\\tmp\\trading-workspace\\run-1\\30-final-report.md`
    const readerSession = { ...session, id: "reader-child", time: { created: 30, updated: 40 } }
    const readerMessage = { ...message, id: "reader-assistant", sessionID: readerSession.id }
    const result = discoverSessionArtifacts({
      directory,
      transcripts: [
        transcript([write("p1", report)]),
        { session: readerSession, messages: [readerMessage], parts: { [readerMessage.id]: [] } },
      ],
      roles: { "30-final-report.md": { role: "text-report" } },
    })

    expect(artifactByRole(result, "text-report")?.path).toBe("tmp/trading-workspace/run-1/30-final-report.md")
    expect(result.ambiguities).toEqual([])
  })

  test("reports conflicting write path fields instead of choosing one", () => {
    const result = discoverSessionArtifacts({
      directory,
      transcripts: [
        transcript([
          write(
            "p1",
            `${directory}\\tmp\\trading-workspace\\run-1\\30-final-report.md`,
            `${directory}\\tmp\\trading-workspace\\run-2\\30-final-report.md`,
          ),
        ]),
      ],
      roles: { "30-final-report.md": { role: "text-report" } },
    })

    expect(result.artifacts).toEqual([])
    expect(result.ambiguities).toHaveLength(1)
  })

  test("does not choose a latest report when multiple run directories exist", () => {
    const result = discoverSessionArtifacts({
      directory,
      transcripts: [
        transcript([
          write("p1", `${directory}\\tmp\\trading-workspace\\run-1\\30-final-report.md`),
          write("p2", `${directory}\\tmp\\trading-workspace\\run-2\\35-visual-report.json`),
        ]),
      ],
      roles: {
        "30-final-report.md": { role: "text-report" },
        "35-visual-report.json": { role: "visual-report" },
      },
    })

    expect(result.runDirectory).toBeUndefined()
    expect(result.ambiguities).toContain("检测到多个报告目录，暂时无法确定最终报告")
    expect(artifactByRole(result, "text-report")).toBeUndefined()
  })

  test("keeps a cross-session path conflict ambiguous after later writes", () => {
    const report = `${directory}\\tmp\\trading-workspace\\run-1\\30-final-report.md`
    const otherSession = { ...session, id: "other-child" }
    const thirdSession = { ...session, id: "third-child" }
    const result = discoverSessionArtifacts({
      directory,
      transcripts: [
        transcript([write("p1", report)]),
        { ...transcript([write("p2", report)]), session: otherSession },
        { ...transcript([write("p3", report)]), session: thirdSession },
      ],
      roles: { "30-final-report.md": { role: "text-report" } },
    })

    expect(result.artifacts).toEqual([])
    expect(result.ambiguities).toHaveLength(1)
  })

  test("allows same-agent retry sessions to update one path only when explicitly enabled", () => {
    const report = `${directory}\\tmp\\inspection-workspace\\run-1\\20-report.md`
    const retrySession = { ...session, id: "retry-child", agent: "deepinspect/report-writer" }
    const firstSession = { ...session, id: "first-child", agent: "deepinspect/report-writer" }
    const result = discoverSessionArtifacts({
      directory,
      transcripts: [
        { ...transcript([write("p1", report)]), session: firstSession },
        { ...transcript([write("p2", report, report, "revised")]), session: retrySession },
      ],
      roles: { "20-report.md": { role: "text-report" } },
      allowSameAgentPathRewrites: true,
    })

    expect(result.ambiguities).toEqual([])
    expect(result.artifacts).toHaveLength(1)
    expect(result.artifacts[0]?.ownerSessionId).toBe("retry-child")
    expect(result.artifacts[0]?.sizeBytes).toBe(7)
  })

  test("keeps the real owner and reports a configured owner mismatch", () => {
    const report = `${directory}\\tmp\\trading-workspace\\run-1\\30-final-report.md`
    const result = discoverSessionArtifacts({
      directory,
      transcripts: [transcript([write("p1", report)])],
      roles: {
        "30-final-report.md": {
          role: "text-report",
          expectedAgentId: "deeptrading/dt-viz",
        },
      },
    })

    expect(result.artifacts[0]?.ownerAgentId).toBe("deeptrading/dt-report-writer")
    expect(result.ambiguities[0]).toContain("与配置主要产生者 deeptrading/dt-viz 不一致")
  })
})
