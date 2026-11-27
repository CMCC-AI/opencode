import { tool } from "@opencode-ai/plugin"
import z from "zod"
import { normalizeDoi, normalizeArxivId, titleSimilarity } from "../lib/academic.mjs"

async function request(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response
}

export default tool({
  description: "Verify a citation against arXiv, Crossref, or Semantic Scholar.",
  args: { title: z.string(), doi: z.string().optional(), arxiv_id: z.string().optional() },
  async execute(args) {
    const attempts: string[] = []
    try {
      if (args.arxiv_id) {
        const id = normalizeArxivId(args.arxiv_id)
        const xml = await (await request(`https://export.arxiv.org/api/query?id_list=${encodeURIComponent(id)}`)).text()
        const found = xml.match(/<entry>[\s\S]*?<title>([\s\S]*?)<\/title>/)?.[1]?.replace(/\s+/g, " ").trim()
        if (found && titleSimilarity(args.title, found) >= 0.8) return `Verified via arXiv ID.\nMatched title: ${found}\nIdentifier: ${id}`
        attempts.push("arXiv ID did not match a sufficiently similar title")
      }
      if (args.doi) {
        const doi = normalizeDoi(args.doi)
        const raw: any = await (await request(`https://api.crossref.org/works/${encodeURIComponent(doi)}`)).json()
        const found = raw.message?.title?.[0] || ""
        const similarity = titleSimilarity(args.title, found)
        return `Crossref DOI result: ${similarity >= 0.8 ? "verified" : "suspicious"}\nTitle similarity: ${similarity.toFixed(2)}\nMatched title: ${found}`
      }
      const raw: any = await (await request(`https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(args.title)}&limit=3&fields=title,url,externalIds`)).json()
      const best = (raw.data || []).map((paper: any) => ({ ...paper, similarity: titleSimilarity(args.title, paper.title) })).sort((left: any, right: any) => right.similarity - left.similarity)[0]
      if (best) {
        const status = best.similarity >= 0.8 ? "verified" : best.similarity >= 0.5 ? "suspicious" : "not found"
        return `Semantic Scholar result: ${status}\nTitle similarity: ${best.similarity.toFixed(2)}\nMatched title: ${best.title}\nURL: ${best.url || "N/A"}`
      }
      return `Citation not found. Attempts: ${attempts.join("; ") || "title search"}`
    } catch (error: any) {
      return `Citation could not be verified because the network request failed: ${error?.message || String(error)}. Treat it as unverified.`
    }
  },
})
