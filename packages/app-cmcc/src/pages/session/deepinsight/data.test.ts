import { describe, expect, test } from "bun:test"
import { discoverSessionArtifacts } from "../agent-workbench/artifacts"
import { mergeSessionArtifactFiles, scanSessionArtifactFiles } from "../agent-workbench/artifact-files"
import { buildAgentNodes, extractTaskChildPreferences } from "../agent-workbench/session-adapter"
import { sumSessionTokens } from "../agent-workbench/statistics"
import { artifactReportFiles } from "../artifact-preview"
import { cmccHistoryProduct } from "@/utils/cmcc-history-product"
import { DEEPINSIGHT_ARTIFACT_ROLES } from "./contract"
import team from "../../../../../../.opencode/experts/deepinsight/expert.json"
import {
  deepInsightArtifactScope,
  deepInsightCatalogArtifacts,
  deepInsightProgress,
  deepInsightReports,
  parseDeepInsightRoute,
  safeDeepInsightArtifacts,
} from "./data"
import { deepInsightFixture } from "./fixtures"
import { DEEPINSIGHT_LEAD_AGENT, shouldUseDeepInsightPage } from "./page-selection"

const DEEPINSIGHT_MEMBERS = team.members
  .filter((member) => member.role !== "lead")
  .map((member) => ({
    id: member.id,
    name: member.name.zh,
    profession: member.profession.zh,
  }))

test("exact root identity keeps ordinary deepinsight-typed conversations and child sessions native", () => {
  expect(shouldUseDeepInsightPage({ agent: DEEPINSIGHT_LEAD_AGENT })).toBe(true)
  expect(shouldUseDeepInsightPage({ agent: "build" }, DEEPINSIGHT_LEAD_AGENT)).toBe(true)
  expect(shouldUseDeepInsightPage({ agent: DEEPINSIGHT_LEAD_AGENT, parentID: "root" })).toBe(false)
  expect(shouldUseDeepInsightPage({ agent: "build" }, "deepinsight")).toBe(false)
  expect(cmccHistoryProduct("deepinsight", DEEPINSIGHT_LEAD_AGENT)?.label).toBe("深度研究")
  expect(cmccHistoryProduct("deepinsight", "build")?.label).toBe("通用对话")
})

describe.each([false, true])("observed research shape: repeated=%s", (repeated) => {
  test("retains retries, resolves the last completed task and counts every unique session without cache", () => {
    const fixture = deepInsightFixture(repeated)
    expect(fixture.transcripts.length - 1).toBe(repeated ? 18 : 13)
    const preferences = extractTaskChildPreferences(fixture.transcripts[0])
    const result = buildAgentNodes({
      members: DEEPINSIGHT_MEMBERS,
      children: fixture.transcripts.slice(1).map((item) => item.session),
      transcripts: new Map(fixture.transcripts.map((item) => [item.session.id, item])),
      preferredSessionIds: preferences,
    })
    expect(result.nodes).toHaveLength(10)
    expect(result.nodes.find((item) => item.id.endsWith("di-local-researcher"))?.status).toBe("waiting")
    expect(result.nodes.find((item) => item.id.endsWith("di-report-writer"))?.sessionId).toBe(
      preferences.get("deepinsight/di-report-writer"),
    )
    expect(sumSessionTokens(fixture.transcripts.map((item) => item.session))).toBe(fixture.transcripts.length * 33)
    expect(deepInsightProgress(result.nodes, { local: false, web: true })).toBe(100)
    expect(deepInsightProgress(result.nodes, { local: true, web: true })).toBeLessThan(100)
    expect(deepInsightProgress(result.nodes, { local: false, web: true }, true)).toBe(99)
    for (const id of ["di-viz", "di-publisher"]) {
      expect(
        deepInsightProgress(
          result.nodes.map((node) => (node.id.endsWith(id) ? { ...node, status: "waiting" } : node)),
          { local: false, web: true },
        ),
      ).toBeLessThan(100)
    }
  })

  test("legacy write evidence plus a bounded listing includes script-generated reports", async () => {
    const fixture = deepInsightFixture(repeated)
    const discovery = discoverSessionArtifacts({
      directory: fixture.directory,
      transcripts: fixture.transcripts,
      roles: DEEPINSIGHT_ARTIFACT_ROLES,
      allowSameAgentPathRewrites: true,
    })
    expect(discovery.ambiguities).toEqual([])
    const scope = deepInsightArtifactScope(fixture.directory, fixture.root.metadata, discovery.artifacts)
    expect(scope.root).toBe(fixture.rootPath)
    expect(scope.warnings).toHaveLength(1)
    const scanned = await scanSessionArtifactFiles({
      directory: fixture.directory,
      root: scope.root!,
      legacyResearch: true,
      list: async () =>
        fixture.filenames.map((name) => ({
          name,
          path: `${fixture.rootPath}/${name}`,
          absolute: `${fixture.directory}/${fixture.rootPath}/${name}`,
          type: "file",
          ignored: false,
        })),
    })
    const files = deepInsightCatalogArtifacts(
      mergeSessionArtifactFiles({
        artifacts: discovery.artifacts,
        paths: scanned.paths,
        rootSessionId: fixture.root.id,
      }),
      fixture.transcripts,
    )
    expect(files).toHaveLength(repeated ? 30 : 25)
    expect(discovery.artifacts.some((file) => file.filename === "20-report.md")).toBe(false)
    expect(files.find((file) => file.filename === "20-report.md")?.role).toBe("text-report")
    expect(files.find((file) => file.filename === "30-report.html")?.createdAt).toBeGreaterThan(1000)
    expect(artifactReportFiles(files, "visual").map((file) => file.filename)).toEqual(["30-report.html"])
    expect(artifactReportFiles(files, "text").some((file) => file.filename === "35-report.pdf")).toBe(true)
  })
})

test("new runs use their assigned directory and multiple real directories remain ambiguous", () => {
  const fixture = deepInsightFixture(false, false)
  const found = discoverSessionArtifacts({
    directory: fixture.directory,
    transcripts: fixture.transcripts,
    roles: DEEPINSIGHT_ARTIFACT_ROLES,
  })
  expect(deepInsightArtifactScope(fixture.directory, fixture.root.metadata, found.artifacts)).toEqual({
    root: "runs/test-run",
    warnings: [],
  })
  const mixed = [
    ...found.artifacts,
    { ...found.artifacts[0], path: "tmp/research-workspace/20260916-0917/00-input.json" },
  ]
  expect(deepInsightArtifactScope(fixture.directory, fixture.root.metadata, mixed).root).toBeUndefined()
})

test("legacy scans are opt-in and reject broad, foreign and traversal roots", async () => {
  for (const root of [
    "tmp",
    "tmp/research-workspace",
    "/tmp/research-workspace/20260916-0917",
    "tmp/research-workspace/../secret",
    "../u-other",
  ]) {
    await expect(
      scanSessionArtifactFiles({
        directory: "/workspace/user",
        root,
        legacyResearch: true,
        list: async () => {
          throw new Error("must not list")
        },
      }),
    ).rejects.toThrow("缺少有效")
  }
  await expect(
    scanSessionArtifactFiles({
      directory: "/workspace/user",
      root: "tmp/research-workspace/20260916-0917",
      list: async () => [],
    }),
  ).rejects.toThrow("缺少有效")
})

test("routing uses validated flags, not natural-language claims or unknown fields", () => {
  expect(parseDeepInsightRoute('{"route":{"local_research_required":false,"web_research_required":true}}')).toEqual({
    local: false,
    web: true,
  })
  for (const text of [
    "broken",
    "{}",
    "null",
    '{"route":{"local_research_required":"false","web_research_required":true}}',
  ])
    expect(parseDeepInsightRoute(text)).toBeUndefined()
})

test("unsafe write paths cannot re-enter the file list through legacy compatibility", () => {
  const fixture = deepInsightFixture()
  const found = discoverSessionArtifacts({
    directory: fixture.directory,
    transcripts: fixture.transcripts,
    roles: DEEPINSIGHT_ARTIFACT_ROLES,
  })
  const result = safeDeepInsightArtifacts({
    ...found,
    artifacts: [
      ...found.artifacts,
      { ...found.artifacts[0], path: "../another-user/report.md" },
      { ...found.artifacts[0], path: "/tmp/report.md" },
    ],
  })
  expect(result.artifacts).toEqual(found.artifacts)
  expect(result.ambiguities).toContain("已排除不安全的深度研究产物路径")
})

test("merely reading or grepping a script is not evidence that it produced a report", () => {
  const fixture = deepInsightFixture()
  const part = (fixture.transcripts[0].parts[fixture.transcripts[0].messages[1].id] ?? []).find(
    (part) => part.id === "assemble",
  )!
  if (part.type !== "tool") throw new Error("Expected a producer tool")
  part.state.input.command = "grep assemble /skills/report-batches.mjs"
  const [file] = deepInsightCatalogArtifacts(
    [
      {
        path: `${fixture.rootPath}/20-report.md`,
        filename: "20-report.md",
        role: "supporting",
        ownerSessionId: fixture.root.id,
        ownerAgentId: "",
        messageId: "",
        partId: "",
      },
    ],
    fixture.transcripts,
  )
  expect(file.createdAt).toBeUndefined()
})

describe.each([false, true])("nested report directory: retries=%s", (repeated) => {
  test("finds the final report and routing file below the session scan root", () => {
    const fixture = deepInsightFixture(repeated, false, true)
    const discovered = discoverSessionArtifacts({
      directory: fixture.directory,
      transcripts: fixture.transcripts,
      roles: DEEPINSIGHT_ARTIFACT_ROLES,
      allowSameAgentPathRewrites: true,
    })
    const scope = deepInsightArtifactScope(fixture.directory, fixture.root.metadata, discovered.artifacts)
    expect(scope.root).toBe("runs/test-run")
    const catalog = deepInsightCatalogArtifacts(
      mergeSessionArtifactFiles({
        artifacts: discovered.artifacts,
        paths: fixture.filenames.map((name) => `${fixture.rootPath}/${name}`),
        rootSessionId: fixture.root.id,
      }),
      fixture.transcripts,
    )
    const reports = deepInsightReports(catalog, scope.root)
    expect(reports.text?.path).toBe(`${fixture.rootPath}/20-report.md`)
    expect(reports.visual?.path).toBe(`${fixture.rootPath}/30-report.html`)
    expect(reports.routePath).toBe(`${fixture.rootPath}/00-execution-trace.json`)
    expect(reports.ambiguities).toEqual([])
  })
})

test("report selection never escapes the scan boundary or chooses a latest directory", () => {
  const fixture = deepInsightFixture()
  const makeFile = (path: string) =>
    deepInsightCatalogArtifacts(
      mergeSessionArtifactFiles({ artifacts: [], paths: [path], rootSessionId: fixture.root.id }),
      [],
    )[0]
  const files = [
    makeFile("runs/one/nested/20-report.md"),
    makeFile("runs/one/nested/30-report.html"),
    makeFile("runs/one/nested/00-execution-trace.json"),
  ]
  expect(deepInsightReports(files, undefined).text).toBeUndefined()
  const outside = [
    ...files,
    makeFile("runs/one-other/20-report.md"),
    makeFile("runs/two/20-report.md"),
    makeFile("runs/one/../two/20-report.md"),
  ]
  expect(deepInsightReports(outside, "runs/one").text?.path).toBe(files[0].path)
  const ambiguous = deepInsightReports(
    [...files, { ...makeFile("runs/one/newer/20-report.md"), createdAt: Date.now() }],
    "runs/one",
  )
  expect(ambiguous.text).toBeUndefined()
  expect(ambiguous.visual).toBeUndefined()
  expect(ambiguous.routePath).toBeUndefined()
  expect(ambiguous.ambiguities).toContain("检测到多个深度研究报告目录，暂时无法确定最终报告")
})

test("routing before report generation uses only an existing unique state file", () => {
  const files = mergeSessionArtifactFiles({
    artifacts: [],
    rootSessionId: "root",
    paths: ["runs/one/nested/00-execution-trace.json"],
  })
  expect(deepInsightReports([], "runs/one").routePath).toBeUndefined()
  expect(deepInsightReports(files, "runs/one").routePath).toBe(files[0].path)
  expect(
    deepInsightReports([...files, { ...files[0], path: "runs/one/other/00-execution-trace.json" }], "runs/one")
      .routePath,
  ).toBeUndefined()
})
