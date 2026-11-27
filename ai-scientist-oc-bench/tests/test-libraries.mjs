import test from "node:test"
import assert from "node:assert/strict"

import {
  ACADEMIC_SOURCE_ORDER,
  normalizeDoi,
  normalizeArxivId,
  titleSimilarity,
  deduplicatePapers,
  formatPapersChinese,
} from "../.opencode/lib/academic.mjs"
import { normalizeHardwareProfile } from "../.opencode/lib/hardware.mjs"

test("学术检索默认按 OpenAlex、Semantic Scholar、arXiv 降级", () => {
  assert.deepEqual(ACADEMIC_SOURCE_ORDER, ["openalex", "semantic_scholar", "arxiv"])
})

test("DOI 与 arXiv 标识被规范化", () => {
  assert.equal(normalizeDoi("https://doi.org/10.1000/XYZ."), "10.1000/xyz")
  assert.equal(normalizeArxivId("arXiv:2401.01234v2"), "2401.01234")
})

test("标题相似度忽略大小写和标点", () => {
  assert.ok(titleSimilarity("Agentic Research: A Study", "Agentic research a study") > 0.99)
  assert.ok(titleSimilarity("A Study of Agents", "Quantum Chemistry") < 0.2)
})

test("论文按 DOI、arXiv ID 和标题依次去重", () => {
  const papers = [
    { title: "Alpha", doi: "10.1/a", source: "openalex", citations: 5 },
    { title: "Alpha duplicate", doi: "https://doi.org/10.1/A", source: "semantic_scholar", citations: 9 },
    { title: "Beta Method", arxivId: "2401.00001v2", source: "arxiv", citations: 1 },
    { title: "Beta method", arxivId: "2401.00001", source: "openalex", citations: 3 },
  ]
  const result = deduplicatePapers(papers)
  assert.equal(result.length, 2)
  assert.equal(result[0].citations, 9)
})

test("论文结果以中文标签格式化", () => {
  const text = formatPapersChinese([{ title: "可靠科研", year: 2026, source: "arxiv", url: "https://example.test" }])
  assert.match(text, /论文题目：可靠科研/)
  assert.match(text, /来源：arxiv/)
})

test("硬件信息转换为中文可执行能力画像", () => {
  const profile = normalizeHardwareProfile({ platform: "darwin", arch: "arm64", cpus: 10, memoryBytes: 16 * 1024 ** 3, gpu: "Apple MPS" })
  assert.equal(profile.cpu核心数, 10)
  assert.equal(profile.内存GB, 16)
  assert.equal(profile.加速设备, "Apple MPS")
  assert.equal(profile.建议执行形态, "本地计算或缩比实验")
})
