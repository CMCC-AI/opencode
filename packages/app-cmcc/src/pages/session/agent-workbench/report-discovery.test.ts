import { expect, test } from "bun:test"
import { artifactReportFiles } from "../artifact-preview"
import { artifactByRole, type ArtifactRoleConfig } from "./artifacts"
import { mergeSessionArtifactFiles, mergeSessionReportArtifacts } from "./artifact-files"
import type { ArtifactDiscovery, SessionArtifact } from "./model"

const root = "runs/current"
const directory = `${root}/tmp/inspection-workspace/current`
const roles: ArtifactRoleConfig = {
  "20-report.md": { role: "text-report", label: "Text report" },
  "25-visual-report.json": { role: "visual-report", label: "Visual report" },
}
const written: SessionArtifact = {
  path: `${directory}/20-report.md`,
  filename: "20-report.md",
  ownerAgentId: "writer",
  ownerSessionId: "child",
  messageId: "message",
  partId: "write",
  role: "text-report",
  sizeBytes: 42,
  createdAt: 100,
}
const discovery: ArtifactDiscovery = { artifacts: [written], runDirectory: directory, ambiguities: [] }
const scan = (paths: string[], source = discovery) =>
  mergeSessionArtifactFiles({ artifacts: source.artifacts, paths, rootSessionId: "current" })

test("includes script-generated HTML, PDF and structured JSON in the confirmed nested report directory", () => {
  const files = scan(["25-visual-report.json", "30-report.html", "35-report.pdf"].map((name) => `${directory}/${name}`))
  const result = mergeSessionReportArtifacts({ discovery, files, root, roles })
  expect(artifactReportFiles(discovery.artifacts, "visual")).toEqual([])
  expect(artifactReportFiles(result.artifacts, "visual").map((file) => file.filename)).toEqual([
    "30-report.html",
    "35-report.pdf",
  ])
  expect(artifactByRole(result, "visual-report")?.path).toBe(`${directory}/25-visual-report.json`)
  expect(artifactByRole(result, "text-report")).toBe(written)
  expect(result.artifacts.find((file) => file.filename === "30-report.html")).toMatchObject({
    ownerAgentId: "",
    messageId: "",
    partId: "",
    role: "supporting",
  })
  expect(result.artifacts.find((file) => file.filename === "30-report.html")?.createdAt).toBeUndefined()
  expect(result.artifacts.find((file) => file.filename === "30-report.html")?.sizeBytes).toBeUndefined()
  expect(discovery.artifacts).toEqual([written])
})

test("does not promote uploads, historical inputs, other sessions or helper assets", () => {
  const paths = [
    `${directory}/30-report.html`,
    `${root}/attachments/upload-123/20-report.md`,
    `${root}/attachments/upload-123/30-report.html`,
    `${root}/inputs/history/other/25-visual-report.json`,
    `${root}/inputs/history/other/35-report.pdf`,
    `${directory}/assets/example.html`,
    `${directory}/assets/echarts.min.js`,
    `${directory}/batches/part-1.json`,
    "runs/another/20-report.md",
    "runs/current-other/35-report.pdf",
    `${root}/../another/30-report.html`,
    `/workspace/${directory}/35-report.pdf`,
  ]
  const files = scan(paths)
  const result = mergeSessionReportArtifacts({ discovery, files, root, roles })
  expect(result.artifacts.map((file) => file.path)).toEqual([written.path, `${directory}/30-report.html`])
  expect(files).toHaveLength(paths.length + 1)
  expect(result.ambiguities).toEqual([])
})

test("restores an entirely script-generated report using existing filename roles", () => {
  const source: ArtifactDiscovery = { artifacts: [], ambiguities: [] }
  const result = mergeSessionReportArtifacts({
    discovery: source,
    root,
    roles,
    files: scan(
      ["20-report.md", "25-visual-report.json", "30-report.html"].map((name) => `${directory}/${name}`),
      source,
    ),
  })
  expect(result.runDirectory).toBe(directory)
  expect(artifactByRole(result, "text-report")?.path).toBe(written.path)
  expect(artifactByRole(result, "visual-report")?.path).toBe(`${directory}/25-visual-report.json`)
})

test("deduplicates paths while retaining real write metadata", () => {
  const result = mergeSessionReportArtifacts({
    discovery,
    root,
    roles,
    files: [
      ...scan([written.path, `${directory}/30-report.html`]),
      { ...written, path: written.path.replaceAll("/", "\\") },
    ],
  })
  expect(result.artifacts).toHaveLength(2)
  expect(result.artifacts[0]).toBe(written)
})

test("uses the final report directory when preparation files live at the task root", () => {
  const source: ArtifactDiscovery = {
    artifacts: [written, { ...written, path: `${root}/00-input.json`, filename: "00-input.json", role: "supporting" }],
    ambiguities: [],
  }
  const result = mergeSessionReportArtifacts({
    discovery: source,
    root,
    roles: { ...roles, "00-input.json": { role: "supporting" } },
    files: scan([`${directory}/30-report.html`], source),
  })
  expect(result.runDirectory).toBe(directory)
  expect(artifactReportFiles(result.artifacts, "visual").map((file) => file.filename)).toEqual(["30-report.html"])
})

test("does not replace existing reports with a different directory", () => {
  const result = mergeSessionReportArtifacts({
    discovery,
    root,
    roles,
    files: scan([`${root}/another/25-visual-report.json`, `${root}/another/30-report.html`]),
  })
  expect(result.artifacts).toBe(discovery.artifacts)
  expect(result.ambiguities).toContain("检测到多个报告目录，暂时无法确定最终报告")
})

test("does not guess between multiple script-only report directories", () => {
  const source: ArtifactDiscovery = { artifacts: [], ambiguities: [] }
  const result = mergeSessionReportArtifacts({
    discovery: source,
    root,
    roles,
    files: scan([`${directory}/20-report.md`, `${root}/other/20-report.md`, `${root}/other/30-report.html`], source),
  })
  expect(result.artifacts).toEqual([])
  expect(result.runDirectory).toBeUndefined()
  expect(result.ambiguities).toHaveLength(1)
})

test("a producer warning does not hide a report with a proven directory", () => {
  const source = { ...discovery, ambiguities: ["实际写入者与配置主要产生者不一致"] }
  const result = mergeSessionReportArtifacts({
    discovery: source,
    files: scan([`${directory}/30-report.html`]),
    root,
    roles,
  })
  expect(artifactReportFiles(result.artifacts, "visual")).toHaveLength(1)
  expect(result.ambiguities).toEqual(source.ambiguities)
})

test("directory scanning cannot restore paths rejected for conflicting write records", () => {
  const path = `${directory}/25-visual-report.json`
  const source = { ...discovery, excludedPaths: [path], ambiguities: ["写入记录存在路径冲突"] }
  const result = mergeSessionReportArtifacts({
    discovery: source,
    files: scan([path, `${directory}/30-report.html`]),
    root,
    roles,
  })
  expect(result.artifacts.some((file) => file.path === path)).toBe(false)
  expect(artifactByRole(result, "visual-report")).toBeUndefined()
  expect(result.ambiguities).toEqual(source.ambiguities)
})

for (const scope of [undefined, "", "runs/current/../another", "tmp/shared", "/workspace/runs/current"]) {
  test(`keeps write-only behavior without a safe task directory (${scope})`, () => {
    expect(
      mergeSessionReportArtifacts({ discovery, root: scope, roles, files: scan([`${directory}/30-report.html`]) }),
    ).toBe(discovery)
  })
}

test("does not expand a legacy report directory into the current run", () => {
  const source = { ...discovery, runDirectory: "tmp/legacy-report" }
  expect(
    mergeSessionReportArtifacts({ discovery: source, root, roles, files: scan([`${directory}/30-report.html`]) })
      .artifacts,
  ).toBe(source.artifacts)
})
