export type KnowledgeGraphNode = {
  id: string
  path: string
  label: string
  degree: number
  inDegree: number
  outDegree: number
  x: number
  y: number
}

export type KnowledgeGraphEdge = {
  id: string
  source: string
  target: string
}

export type KnowledgeGraph = {
  nodes: KnowledgeGraphNode[]
  edges: KnowledgeGraphEdge[]
}

export async function scanKnowledgeGraph(directory: string) {
  const paths = (
    await Array.fromAsync(
      new Bun.Glob("02_LLM_Wiki/**/*.{md,markdown,mdx}").scan({ cwd: directory, onlyFiles: true, dot: false }),
    )
  ).slice(0, 5000)
  return buildKnowledgeGraph(
    await Promise.all(paths.map(async (path) => ({ path, content: await Bun.file(join(directory, path)).text() }))),
  )
}

export function buildKnowledgeGraph(files: Array<{ path: string; content: string }>): KnowledgeGraph {
  const nodes = files.map((file) => ({
    id: file.path,
    path: file.path,
    label: cleanName(file.path),
    degree: 0,
    inDegree: 0,
    outDegree: 0,
    x: 0,
    y: 0,
  }))
  const aliases = new Map<string, KnowledgeGraphNode>()

  files.forEach((file, index) => {
    const node = nodes[index]
    ;[file.path, basename(file.path), node.label, ...frontmatterAliases(file.content)].forEach((name) =>
      aliases.set(normalize(name), node),
    )
  })

  const seen = new Set<string>()
  const edges = files.flatMap((file, index) =>
    [...file.content.matchAll(/\[\[([^\]\n]{1,180})\]\]/g)].flatMap((match) => {
      const source = nodes[index]
      const target = aliases.get(normalize(match[1]))
      if (!target || target.id === source.id) return []
      const id = `${source.id}\u0000${target.id}`
      if (seen.has(id)) return []
      seen.add(id)
      source.outDegree += 1
      source.degree += 1
      target.inDegree += 1
      target.degree += 1
      return [{ id, source: source.id, target: target.id }]
    }),
  )

  const ordered = nodes.toSorted((a, b) => b.degree - a.degree || a.label.localeCompare(b.label, "zh-CN"))
  ordered.forEach((node, index) => {
    if (index === 0) return
    const angle = index * 2.399963229728653
    const radius = Math.min(390, 80 + Math.sqrt(index) * 72)
    node.x = Math.cos(angle) * radius
    node.y = Math.sin(angle) * radius * 0.78
  })
  return { nodes: ordered, edges }
}

function frontmatterAliases(content: string) {
  const frontmatter = content.match(/^---\s*\n([\s\S]*?)\n---/)
  if (!frontmatter) return []
  const line = frontmatter[1].split("\n").find((item) => /^\s*(aliases|alias)\s*:/i.test(item))
  if (!line) return []
  return line
    .replace(/^\s*(aliases|alias)\s*:/i, "")
    .trim()
    .replace(/^\[|\]$/g, "")
    .split(",")
    .map((item) => item.trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean)
}

function normalize(value: string) {
  return cleanName(value.split("|")[0].split("#")[0]).toLowerCase().replace(/\s+/g, " ").trim()
}

function basename(value: string) {
  return value.split(/[\\/]/).pop() ?? value
}

function cleanName(value: string) {
  return basename(value).replace(/\.(md|markdown|mdx)$/i, "").trim()
}

function join(root: string, path: string) {
  return `${root.replace(/[\\/]+$/, "")}/${path.replace(/^[\\/]+/, "")}`
}
