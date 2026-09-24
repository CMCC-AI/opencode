import { describe, expect, test } from "bun:test"
import { countDeepInsightSources, deepInsightReferenceArtifact } from "./source-count"
import type { SessionArtifact } from "../agent-workbench/model"

describe("DeepInsight final source count", () => {
  test("counts unique local, cited, verified and extended references", () => {
    expect(
      countDeepInsightSources(
        JSON.stringify([
          { key: "local:SRC-001", kind: "local", usage: "cited_in_report" },
          { key: "https://example.com/a", kind: "web", usage: "cited_in_report" },
          { key: "https://example.com/a", kind: "web", usage: "verified_reference_not_cited" },
          { key: "https://example.com/b", kind: "web", usage: "extended_reference" },
        ]),
      ),
    ).toBe(3)
    expect(countDeepInsightSources("[]")).toBe(0)
  })
  test("does not turn missing, malformed, unknown or partial records into zero", () => {
    for (const text of [
      "",
      "{",
      "{}",
      "null",
      '[{"url":"https://example.com"}]',
      '[{"key":"local:SRC-001","kind":"web"}]',
      '[{"key":"local:SRC-001","kind":"local"},{}]',
    ])
      expect(countDeepInsightSources(text)).toBeUndefined()
  })
  test("selects only the final report's sibling, including root-level snapshot files", () => {
    const artifact = (path: string): SessionArtifact => ({
      path,
      filename: "22-references.json",
      ownerAgentId: "",
      ownerSessionId: "",
      messageId: "",
      partId: "",
      role: "supporting",
    })
    const references = [artifact("runs/one/22-references.json"), artifact("runs/two/22-references.json")]
    expect(deepInsightReferenceArtifact(references, "runs/one/20-report.md")).toEqual(references[0])
    expect(deepInsightReferenceArtifact(references)).toBeUndefined()
    expect(deepInsightReferenceArtifact(references, "runs/missing/20-report.md")).toBeUndefined()
    expect(deepInsightReferenceArtifact([references[0], references[0]], "runs/one/20-report.md")).toBeUndefined()
    expect(deepInsightReferenceArtifact([artifact("22-references.json")], "20-report.md")?.path).toBe(
      "22-references.json",
    )
  })
})
