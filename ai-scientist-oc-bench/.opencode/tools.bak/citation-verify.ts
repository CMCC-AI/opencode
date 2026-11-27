import { tool } from "@opencode-ai/plugin"
import z from "zod"
import { normalizeDoi, normalizeArxivId, titleSimilarity } from "../lib/academic.mjs"

export default tool({
  description: "通过 arXiv ID、CrossRef DOI 或 Semantic Scholar 标题匹配核验引用是否真实存在；中文返回已核验、可疑、未找到或网络不可用。",
  args: { title: z.string(), doi: z.string().optional(), arxiv_id: z.string().optional() },
  async execute(args) {
    const attempts: string[] = []
    try {
      if (args.arxiv_id) {
        const id = normalizeArxivId(args.arxiv_id)
        const xml = await (await fetch(`https://export.arxiv.org/api/query?id_list=${encodeURIComponent(id)}`)).text()
        const found = xml.match(/<entry>[\s\S]*?<title>([\s\S]*?)<\/title>/)?.[1]?.replace(/\s+/g, " ").trim()
        if (found && titleSimilarity(args.title, found) >= 0.8) return `核验状态：已核验\n核验方式：arXiv ID\n匹配标题：${found}\n标识：${id}`
        attempts.push("arXiv ID 未找到高相似标题")
      }
      if (args.doi) {
        const doi = normalizeDoi(args.doi)
        const response = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`)
        if (response.ok) {
          const raw: any = await response.json()
          const found = raw.message?.title?.[0] || ""
          const similarity = titleSimilarity(args.title, found)
          return `核验状态：${similarity >= 0.8 ? "已核验" : "可疑"}\n核验方式：CrossRef DOI\n标题相似度：${similarity.toFixed(2)}\n匹配标题：${found}`
        }
        attempts.push("CrossRef 未解析 DOI")
      }
      const raw: any = await (await fetch(`https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(args.title)}&limit=3&fields=title,url,externalIds`)).json()
      const best = (raw.data || []).map((p: any) => ({ ...p, similarity: titleSimilarity(args.title, p.title) })).sort((a: any, b: any) => b.similarity - a.similarity)[0]
      if (best) return `核验状态：${best.similarity >= 0.8 ? "已核验" : best.similarity >= 0.5 ? "可疑" : "未找到"}\n核验方式：Semantic Scholar 标题检索\n标题相似度：${best.similarity.toFixed(2)}\n匹配标题：${best.title}\n链接：${best.url || "无"}`
      return `核验状态：未找到\n已尝试：${attempts.join("；") || "标题检索"}\n不得把该引用作为已核验来源。`
    } catch (error: any) {
      return `核验状态：网络不可用\n原因：${error?.message || String(error)}\n处理：保留为待核验，不得标记为真实或虚构。`
    }
  },
})
