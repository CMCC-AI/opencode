export type DeepInspectVisualTone = "neutral" | "positive" | "negative" | "warning" | "info"

export type DeepInspectLayoutBlock =
  | { type: "markdown"; content: string }
  | { type: "chart"; chart: DeepInspectOptionChart; after?: string }
  | { type: "callout"; title?: string; content: string; tone: DeepInspectVisualTone; after?: string }
  | { type: "table"; title?: string; columns: string[]; rows: Array<Array<string | number | null>>; after?: string }
  | { type: "quote_card"; content: string; source?: string; tone: DeepInspectVisualTone; after?: string }
  | {
      type: "timeline"
      title?: string
      items: Array<{ label?: string; content?: string; tone: DeepInspectVisualTone }>
      after?: string
    }
  | { type: "divider"; label?: string; after?: string }

export type DeepInspectOptionChart = {
  id: string
  title?: string
  description?: string
  option: Record<string, unknown>
}

export type DeepInspectBundleChart = {
  id: string
  type: string
  title?: string
  description?: string
  insight?: string
  data: Array<{ label: string; value: number; color?: string }>
}

export type DeepInspectVisualReport =
  | {
      kind: "layout"
      title?: string
      subtitle?: string
      sections: Array<{ id: string; heading?: string; blocks: DeepInspectLayoutBlock[] }>
    }
  | {
      kind: "chart-bundle"
      title?: string
      summary?: string
      charts: DeepInspectBundleChart[]
    }

export type DeepInspectVisualParseResult =
  | { report: DeepInspectVisualReport; error?: undefined }
  | { report?: undefined; error: string }

export function parseDeepInspectVisualReport(value: string): DeepInspectVisualParseResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    return { error: "可视化报告不是有效的 JSON" }
  }
  if (!isRecord(parsed)) return { error: "可视化报告根节点必须是对象" }

  const layout = normalizeLayoutReport(parsed)
  if (layout) return { report: layout }
  const bundle = normalizeChartBundle(parsed)
  if (bundle) return { report: bundle }
  return { error: "可视化报告格式暂不支持" }
}

export function buildDeepInspectMarkdownPlaceholders(markdown: string) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n")
  const headings = lines.flatMap((line, index) => {
    const match = line.match(/^(#{2,3})\s+(.+?)\s*$/)
    return match ? [{ index, level: match[1]!.length, title: match[2]!.trim() }] : []
  })
  const result = new Map<string, string>()
  let chapter = 0

  headings
    .filter((heading) => heading.level === 2)
    .forEach((heading, headingIndex, all) => {
      const end = all[headingIndex + 1]?.index ?? lines.length
      const content = lines
        .slice(heading.index + 1, end)
        .join("\n")
        .trim()
      if (/^摘要(?:$|[：:])/.test(heading.title)) {
        if (content) result.set("__ABSTRACT__", content)
        return
      }

      chapter += 1
      if (content) result.set(`__CH${chapter}__`, content)
      const children = headings.filter(
        (candidate) => candidate.level === 3 && candidate.index > heading.index && candidate.index < end,
      )
      children.forEach((child, childIndex) => {
        const childEnd = children[childIndex + 1]?.index ?? end
        const body = lines
          .slice(child.index + 1, childEnd)
          .join("\n")
          .trim()
        const value = [`### ${child.title}`, body].filter(Boolean).join("\n\n")
        if (value) result.set(`__CH${chapter}_${childIndex + 1}__`, value)
      })
    })
  return result
}

export function resolveDeepInspectMarkdownBlock(content: string, placeholders: ReadonlyMap<string, string>) {
  const value = content.trim()
  if (!/^__[^\s]+__$/.test(value)) return { content: value, unresolved: false }
  const resolved = placeholders.get(value)
  return resolved ? { content: resolved, unresolved: false } : { content: "", unresolved: true }
}

export function orderDeepInspectVisualBlocks(blocks: readonly DeepInspectLayoutBlock[]) {
  const anchored = blocks.filter((block) => block.type !== "markdown" && block.after)
  const placed = new Set<DeepInspectLayoutBlock>()
  const result: DeepInspectLayoutBlock[] = []
  for (const block of blocks) {
    if (block.type !== "markdown" && block.after) continue
    result.push(block)
    if (block.type !== "markdown") continue
    for (const candidate of anchored) {
      if (candidate.type === "markdown" || candidate.after !== block.content || placed.has(candidate)) continue
      placed.add(candidate)
      result.push(candidate)
    }
  }
  for (const block of anchored) {
    if (!placed.has(block)) result.push(block)
  }
  return result
}

export function deepInspectBundleChartOption(chart: DeepInspectBundleChart) {
  if (chart.type === "bar") {
    return {
      color: chart.data.flatMap((item) => (item.color ? [item.color] : [])).slice(0, 1),
      tooltip: { trigger: "axis" },
      grid: { left: "3%", right: "4%", bottom: "3%", containLabel: true },
      xAxis: { type: "category", data: chart.data.map((item) => item.label) },
      yAxis: { type: "value" },
      series: [{ type: "bar", data: chart.data.map((item) => item.value), barMaxWidth: 48 }],
    }
  }
  if (chart.type === "pie") {
    return {
      color: chart.data.flatMap((item) => (item.color ? [item.color] : [])),
      tooltip: { trigger: "item" },
      legend: { bottom: 0, type: "scroll" },
      series: [
        {
          type: "pie",
          radius: ["42%", "68%"],
          center: ["50%", "45%"],
          data: chart.data.map((item) => ({ name: item.label, value: item.value })),
        },
      ],
    }
  }
  return
}

function normalizeLayoutReport(
  source: Record<string, unknown>,
): Extract<DeepInspectVisualReport, { kind: "layout" }> | undefined {
  if (source.layout_version !== 2 || !Array.isArray(source.sections)) return
  const sections = source.sections.flatMap((raw, sectionIndex) => {
    if (!isRecord(raw) || !Array.isArray(raw.blocks)) return []
    const blocks = raw.blocks.flatMap(normalizeLayoutBlock)
    const heading = text(raw.heading)
    if (!heading && blocks.length === 0) return []
    return [
      {
        id: text(raw.id) ?? `section-${sectionIndex + 1}`,
        heading,
        blocks,
      },
    ]
  })
  if (!sections.length) return
  return {
    kind: "layout",
    title: text(source.title),
    subtitle: text(source.subtitle),
    sections,
  }
}

function normalizeLayoutBlock(raw: unknown): DeepInspectLayoutBlock[] {
  if (!isRecord(raw)) return []
  const type = text(raw.type)
  const after = text(raw.after)
  if (type === "markdown") {
    const content = text(raw.content)
    return content ? [{ type, content }] : []
  }
  if (type === "chart" && isRecord(raw.chart) && isRecord(raw.chart.option)) {
    return [
      {
        type,
        after,
        chart: {
          id: text(raw.chart.id) ?? "chart",
          title: text(raw.chart.title),
          description: text(raw.chart.description),
          option: raw.chart.option,
        },
      },
    ]
  }
  if (type === "callout") {
    const content = text(raw.content)
    return content ? [{ type, after, title: text(raw.title), content, tone: tone(raw.tone) }] : []
  }
  if (type === "table") {
    const columns = Array.isArray(raw.columns) ? raw.columns.map((item) => text(item) ?? "") : []
    const rows = Array.isArray(raw.rows)
      ? raw.rows.flatMap((row) =>
          Array.isArray(row)
            ? [
                row.map((cell) =>
                  typeof cell === "string" || typeof cell === "number" || cell === null ? cell : (text(cell) ?? ""),
                ),
              ]
            : [],
        )
      : []
    return columns.length && rows.length ? [{ type, after, title: text(raw.title), columns, rows }] : []
  }
  if (type === "quote_card") {
    const content = text(raw.content)
    return content ? [{ type, after, content, source: text(raw.source), tone: tone(raw.tone) }] : []
  }
  if (type === "timeline") {
    const items = Array.isArray(raw.items)
      ? raw.items.flatMap((item) =>
          isRecord(item) ? [{ label: text(item.label), content: text(item.content), tone: tone(item.tone) }] : [],
        )
      : []
    return items.length ? [{ type, after, title: text(raw.title), items }] : []
  }
  if (type === "divider") return [{ type, after, label: text(raw.label) }]
  return []
}

function normalizeChartBundle(
  source: Record<string, unknown>,
): Extract<DeepInspectVisualReport, { kind: "chart-bundle" }> | undefined {
  if (!Array.isArray(source.charts)) return
  const charts = source.charts.flatMap((raw, index): DeepInspectBundleChart[] => {
    if (!isRecord(raw) || !Array.isArray(raw.data)) return []
    const data = raw.data.flatMap((item) => {
      if (!isRecord(item)) return []
      const label = text(item.label)
      const value = item.value
      if (!label || typeof value !== "number" || !Number.isFinite(value)) return []
      return [{ label, value, color: text(item.color) }]
    })
    if (!data.length) return []
    return [
      {
        id: text(raw.chart_id) ?? `chart-${index + 1}`,
        type: text(raw.chart_type)?.toLowerCase() ?? "unknown",
        title: text(raw.title),
        description: text(raw.description),
        insight: text(raw.insight),
        data,
      },
    ]
  })
  if (!charts.length) return
  return {
    kind: "chart-bundle",
    title: text(source.title),
    summary: text(source.summary),
    charts,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function text(value: unknown) {
  if (typeof value === "string" && value.trim()) return value.trim()
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  return
}

function tone(value: unknown): DeepInspectVisualTone {
  const current = text(value)
  if (current === "positive" || current === "negative" || current === "warning" || current === "info") return current
  return "neutral"
}
