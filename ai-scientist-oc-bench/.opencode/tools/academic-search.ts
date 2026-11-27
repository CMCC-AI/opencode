import { tool } from "@opencode-ai/plugin"
import z from "zod"
import { deduplicatePapers, formatPapersChinese } from "../lib/academic.mjs"

async function requestJson(url: string) {
  const response = await fetch(url, { headers: { "User-Agent": "AI-Scientist-OpenCode/1.0" }, signal: AbortSignal.timeout(15000) })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

async function openAlex(query: string, limit: number, year: number) {
  const filter = year ? `&filter=from_publication_date:${year}-01-01` : ""
  const raw: any = await requestJson(`https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=${limit}${filter}`)
  return (raw.results || []).map((paper: any) => ({ title: paper.title, year: paper.publication_year, doi: paper.doi, url: paper.primary_location?.landing_page_url || paper.doi, citations: paper.cited_by_count, source: "OpenAlex", abstract: "" }))
}

async function semanticScholar(query: string, limit: number, year: number) {
  const raw: any = await requestJson(`https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=${limit}&fields=title,year,abstract,url,citationCount,externalIds`)
  return (raw.data || []).filter((paper: any) => !year || paper.year >= year).map((paper: any) => ({ title: paper.title, year: paper.year, doi: paper.externalIds?.DOI, arxivId: paper.externalIds?.ArXiv, url: paper.url, citations: paper.citationCount, source: "Semantic Scholar", abstract: paper.abstract }))
}

async function arxiv(query: string, limit: number, year: number) {
  const response = await fetch(`https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&start=0&max_results=${limit}`, { headers: { "User-Agent": "AI-Scientist-OpenCode/1.0" }, signal: AbortSignal.timeout(15000) })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const xml = await response.text()
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((match: any) => {
    const block = match[1]
    const pick = (tag: string) => (block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`))?.[1] || "").replace(/\s+/g, " ").trim()
    const published = pick("published")
    return { title: pick("title"), year: Number(published.slice(0, 4)), arxivId: pick("id").split("/abs/").pop() || "", url: pick("id"), citations: 0, source: "arXiv", abstract: pick("summary") }
  }).filter((paper: any) => paper.title && (!year || paper.year >= year))
}

export default tool({
  description: "Search OpenAlex, Semantic Scholar, and arXiv, then return deduplicated paper metadata.",
  args: { query: z.string(), limit: z.number().int().min(1).max(30).optional(), year_min: z.number().int().min(1900).max(2100).optional() },
  async execute(args) {
    const limit = args.limit ?? 10
    const papers: any[] = []
    const failures: string[] = []
    for (const [name, search] of [["OpenAlex", openAlex], ["Semantic Scholar", semanticScholar], ["arXiv", arxiv]] as const) {
      try { papers.push(...await search(args.query, limit, args.year_min ?? 0)) } catch (error: any) { failures.push(`${name}: ${error?.message || String(error)}`) }
    }
    const unique = deduplicatePapers(papers).slice(0, limit * 2)
    return [`Query: ${args.query}`, failures.length ? `Partial failures: ${failures.join("; ")}` : "All sources completed.", `Papers after deduplication: ${unique.length}`, "", formatPapersChinese(unique)].join("\n")
  },
})
