import { tool } from "@opencode-ai/plugin"
import z from "zod"

type Dataset = { title: string; url: string; source: string; description?: string; version?: string; license?: string; updated?: string; records?: number | null }

async function json(url: string) {
  const response = await fetch(url, { headers: { "User-Agent": "AI-Scientist-OpenCode/1.0" }, signal: AbortSignal.timeout(20000) })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

async function dataCite(query: string, limit: number): Promise<Dataset[]> {
  const raw: any = await json(`https://api.datacite.org/dois?query=${encodeURIComponent(query)}&page[size]=${limit}`)
  return (raw.data || []).map((x: any) => ({ title: x.attributes?.titles?.[0]?.title || "", url: x.attributes?.url || `https://doi.org/${x.id}`, source: "DataCite", description: x.attributes?.descriptions?.[0]?.description || "", version: x.attributes?.version, license: x.attributes?.rightsList?.[0]?.rights, updated: x.attributes?.updated }))
}

async function zenodo(query: string, limit: number): Promise<Dataset[]> {
  const raw: any = await json(`https://zenodo.org/api/records?q=${encodeURIComponent(query)}&size=${limit}`)
  return (raw.hits?.hits || []).map((x: any) => ({ title: x.metadata?.title || "", url: x.links?.self_html || `https://doi.org/${x.metadata?.doi || x.id}`, source: "Zenodo", description: x.metadata?.description || "", version: x.metadata?.version, license: x.metadata?.license?.id, updated: x.updated }))
}

async function figshare(query: string, limit: number): Promise<Dataset[]> {
  const raw: any = await json(`https://api.figshare.com/v2/articles?institution=0&order=published_date&order_direction=desc&page_size=${limit}&search_for=${encodeURIComponent(query)}`)
  return (raw || []).map((x: any) => ({ title: x.title || "", url: x.url || `https://figshare.com/articles/${x.id}`, source: "Figshare", description: x.description || "", version: x.version?.toString(), license: x.license?.name, updated: x.modified_date }))
}

async function huggingFace(query: string, limit: number): Promise<Dataset[]> {
  const raw: any[] = await json(`https://huggingface.co/api/datasets?search=${encodeURIComponent(query)}&limit=${limit}`)
  return (raw || []).map((x: any) => ({ title: x.id || "", url: `https://huggingface.co/datasets/${x.id}`, source: "Hugging Face Datasets", description: x.description || "", updated: x.lastModified }))
}

async function openml(query: string, limit: number): Promise<Dataset[]> {
  const raw: any = await json(`https://www.openml.org/api/v1/json/data/list/data_name/${encodeURIComponent(query)}`)
  const rows = raw.data?.dataset || []
  return rows.slice(0, limit).map((x: any) => ({ title: x.name || "", url: `https://www.openml.org/d/${x.did}`, source: "OpenML", description: x.description || "", version: x.version?.toString(), records: Number(x.NumberOfInstances) || null }))
}

async function kaggle(query: string, limit: number): Promise<Dataset[]> {
  const raw: any[] = await json(`https://www.kaggle.com/api/v1/datasets/list?search=${encodeURIComponent(query)}&page=1&pageSize=${limit}`)
  return (raw || []).map((x: any) => ({ title: x.title || x.ref || "", url: x.ref ? `https://www.kaggle.com/datasets/${x.ref}` : "https://www.kaggle.com/datasets", source: "Kaggle Public Datasets", description: x.subtitle || x.description || "", updated: x.lastUpdated }))
}

export default tool({
  description: "Discover public real datasets across DataCite, Zenodo, Figshare, Hugging Face, OpenML, and Kaggle; report source failures explicitly.",
  args: { query: z.string(), limit: z.number().int().min(1).max(50).optional() },
  async execute(args) {
    const limit = args.limit ?? 10
    const providers: [string, (q: string, n: number) => Promise<Dataset[]>][] = [["DataCite", dataCite], ["Zenodo", zenodo], ["Figshare", figshare], ["Hugging Face Datasets", huggingFace], ["OpenML", openml], ["Kaggle Public Datasets", kaggle]]
    const datasets: Dataset[] = []
    const failures: string[] = []
    for (const [name, search] of providers) {
      try { datasets.push(...await search(args.query, limit)) } catch (error: any) { failures.push(`${name}: ${error?.message || String(error)}`) }
    }
    const seen = new Set<string>()
    const unique = datasets.filter(x => { const key = `${x.title.toLowerCase()}|${x.url}`; if (!x.title || seen.has(key)) return false; seen.add(key); return true })
    return JSON.stringify({ query: args.query, providers: providers.map(x => x[0]), datasets: unique, failures, searched_at: new Date().toISOString() }, null, 2)
  },
})
