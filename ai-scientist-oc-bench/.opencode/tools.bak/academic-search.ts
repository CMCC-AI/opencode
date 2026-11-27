import { tool } from "@opencode-ai/plugin"
import z from "zod"
import { deduplicatePapers, formatPapersChinese } from "../lib/academic.mjs"

async function json(url: string, headers: Record<string, string> = {}) {
  const response = await fetch(url, { headers: { "User-Agent": "AI-Scientist-OpenCode/1.0", ...headers } })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

async function openAlex(query: string, limit: number, year: number) {
  const filter = year ? `&filter=from_publication_date:${year}-01-01` : ""
  const raw: any = await json(`https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=${limit}${filter}`)
  return (raw.results || []).map((p: any) => ({ title: p.title, year: p.publication_year, doi: p.doi, url: p.primary_location?.landing_page_url || p.doi, citations: p.cited_by_count, source: "OpenAlex", abstract: "" }))
}

async function semanticScholar(query: string, limit: number, year: number) {
  const fields = "title,year,abstract,url,citationCount,externalIds"
  const raw: any = await json(`https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=${limit}&fields=${fields}`)
  return (raw.data || []).filter((p: any) => !year || p.year >= year).map((p: any) => ({ title: p.title, year: p.year, doi: p.externalIds?.DOI, arxivId: p.externalIds?.ArXiv, url: p.url, citations: p.citationCount, source: "Semantic Scholar", abstract: p.abstract }))
}

async function arxiv(query: string, limit: number, year: number) {
  const xml = await (await fetch(`https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&start=0&max_results=${limit}`, { headers: { "User-Agent": "AI-Scientist-OpenCode/1.0" } })).text()
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((match: any) => {
    const block = match[1]
    const pick = (tag: string) => (block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`))?.[1] || "").replace(/\s+/g, " ").trim()
    const id = pick("id").split("/abs/").pop() || ""
    const published = pick("published")
    return { title: pick("title"), year: Number(published.slice(0, 4)), arxivId: id, url: pick("id"), citations: 0, source: "arXiv", abstract: pick("summary") }
  }).filter((p: any) => p.title && (!year || p.year >= year))
}

export default tool({
  description: "按 OpenAlex→Semantic Scholar→arXiv 顺序检索真实学术论文，失败时自动降级，并以中文返回去重后的论文元数据与来源。",
  args: { query: z.string().describe("中英文均可的学术检索式"), limit: z.number().int().min(1).max(30).optional(), year_min: z.number().int().min(1900).max(2100).optional() },
  async execute(args) {
    const limit = args.limit ?? 10
    const failures: string[] = []
    const papers: any[] = []
    for (const [name, fn] of [["OpenAlex", openAlex], ["Semantic Scholar", semanticScholar], ["arXiv", arxiv]] as const) {
      try { papers.push(...await fn(args.query, limit, args.year_min ?? 0)) } catch (error: any) { failures.push(`${name}：${error?.message || String(error)}`) }
    }
    const unique = deduplicatePapers(papers).slice(0, limit * 2)
    return [`检索式：${args.query}`, `检索状态：${failures.length ? `部分来源失败（${failures.join("；")}）` : "三个来源均已完成"}`, `去重后论文数：${unique.length}`, "", formatPapersChinese(unique)].join("\n")
  },
})
