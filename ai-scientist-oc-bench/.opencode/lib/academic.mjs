export const ACADEMIC_SOURCE_ORDER = ["openalex", "semantic_scholar", "arxiv"]

export function normalizeDoi(value = "") {
  return value.trim().toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, "").replace(/[.,;]+$/, "")
}

export function normalizeArxivId(value = "") {
  return value.trim().replace(/^arxiv:/i, "").replace(/v\d+$/i, "")
}

function titleWords(value = "") {
  return new Set(value.toLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean))
}

export function titleSimilarity(a, b) {
  const wa = titleWords(a)
  const wb = titleWords(b)
  if (!wa.size || !wb.size) return 0
  let overlap = 0
  for (const word of wa) if (wb.has(word)) overlap += 1
  return overlap / Math.max(wa.size, wb.size)
}

function paperKey(paper) {
  const doi = normalizeDoi(paper.doi)
  if (doi) return `doi:${doi}`
  const arxiv = normalizeArxivId(paper.arxivId)
  if (arxiv) return `arxiv:${arxiv}`
  return `title:${[...titleWords(paper.title)].sort().join("-")}`
}

export function deduplicatePapers(papers = []) {
  const best = new Map()
  for (const paper of papers) {
    const key = paperKey(paper)
    const previous = best.get(key)
    if (!previous || Number(paper.citations || 0) > Number(previous.citations || 0)) best.set(key, paper)
  }
  return [...best.values()].sort((a, b) => Number(b.citations || 0) - Number(a.citations || 0))
}

export function formatPapersChinese(papers = []) {
  if (!papers.length) return "未检索到可用论文。请调整检索式、时间范围或数据源后重试。"
  return papers.map((paper, index) => [
    `${index + 1}. 论文题目：${paper.title || "未提供"}`,
    `   年份：${paper.year || "未知"}｜来源：${paper.source || "未知"}｜引用量：${paper.citations ?? "未知"}`,
    `   DOI：${paper.doi || "无"}｜arXiv：${paper.arxivId || "无"}`,
    `   链接：${paper.url || "无"}`,
    paper.abstract ? `   摘要：${String(paper.abstract).replace(/\s+/g, " ").slice(0, 500)}` : "",
  ].filter(Boolean).join("\n")).join("\n\n")
}
