export type ZhengqiVisualReport = {
  title?: string
  subtitle?: string
  customerName?: string
  sections: Array<{ id: string; heading?: string; blocks: ZhengqiVisualBlock[] }>
  references: Array<{ id?: string; title: string; url?: string; type?: string }>
  warnings: string[]
}

export type ZhengqiVisualBlock =
  | { type: "markdown"; content: string }
  | {
      type: "chart"
      id: string
      title?: string
      description?: string
      insight?: string
      option?: Record<string, unknown>
      fallback?: ZhengqiChartTable
    }
  | { type: "table"; title?: string; description?: string; columns: string[]; rows: ZhengqiCell[][]; source?: string }
  | {
      type: "stat_grid"
      title?: string
      description?: string
      items: Array<{ label: string; value: string; unit?: string; caption?: string }>
    }

export type ZhengqiCell = string | number | null
export type ZhengqiChartTable = { columns: string[]; rows: ZhengqiCell[][] }

export type ZhengqiVisualParseResult =
  | { report: ZhengqiVisualReport; error?: undefined }
  | { report?: undefined; error: string }

export function parseZhengqiVisualReport(value: string): ZhengqiVisualParseResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    return { error: "可视化报告不是有效的 JSON" }
  }
  if (!isRecord(parsed) || !isRecord(parsed.report) || !Array.isArray(parsed.report.sections)) {
    return { error: "可视化报告必须包含 report.sections" }
  }

  let unsupportedBlocks = 0
  const sections = parsed.report.sections.flatMap((raw, sectionIndex) => {
    if (!isRecord(raw) || !Array.isArray(raw.blocks)) return []
    const blocks = raw.blocks.flatMap((block) => {
      const normalized = normalizeBlock(block)
      if (!normalized.length) unsupportedBlocks += 1
      return normalized
    })
    const heading = text(raw.title) ?? text(raw.heading)
    if (!heading && !blocks.length) return []
    return [{ id: text(raw.id) ?? `section-${sectionIndex + 1}`, heading, blocks }]
  })
  if (!sections.length || sections.every((section) => section.blocks.length === 0)) {
    return { error: "可视化报告没有可识别的内容块" }
  }

  const references = Array.isArray(parsed.references)
    ? parsed.references.flatMap((raw) => {
        if (!isRecord(raw)) return []
        const title = text(raw.title)
        if (!title) return []
        return [{ id: text(raw.id) ?? text(raw.n), title, url: text(raw.url), type: text(raw.type) ?? text(raw.kind) }]
      })
    : []

  return {
    report: {
      title: text(parsed.report.title),
      subtitle: text(parsed.report.subtitle),
      customerName: text(parsed.report.customer_name),
      sections,
      references,
      warnings: unsupportedBlocks > 0 ? [`有 ${unsupportedBlocks} 个内容块格式暂不支持，已跳过`] : [],
    },
  }
}

function normalizeBlock(raw: unknown): ZhengqiVisualBlock[] {
  if (!isRecord(raw)) return []
  const type = text(raw.type)
  if (type === "markdown") {
    const content = text(raw.content)
    return content ? [{ type, content }] : []
  }
  if (type === "table") {
    const columns = stringArray(raw.columns).length ? stringArray(raw.columns) : stringArray(raw.headers)
    const rows = tableRows(raw.rows)
    return columns.length && rows.length
      ? [
          {
            type,
            title: text(raw.title),
            description: text(raw.description),
            columns,
            rows,
            source: text(raw.source),
          },
        ]
      : []
  }
  if (type === "stat_grid") {
    const items = Array.isArray(raw.items)
      ? raw.items.flatMap((item) => {
          if (!isRecord(item)) return []
          const label = text(item.label)
          const value = text(item.value)
          return label && value
            ? [{ label, value, unit: text(item.unit), caption: text(item.caption) ?? text(item.source) }]
            : []
        })
      : []
    return items.length ? [{ type, title: text(raw.title), description: text(raw.description), items }] : []
  }
  if (type !== "chart") return []

  if (isRecord(raw.chart) && isRecord(raw.chart.option)) {
    return [
      {
        type,
        id: text(raw.chart.id) ?? text(raw.id) ?? "chart",
        title: text(raw.chart.title) ?? text(raw.title),
        description: text(raw.chart.description) ?? text(raw.description),
        insight: text(raw.chart.insight) ?? text(raw.insight),
        option: raw.chart.option,
      },
    ]
  }

  const observed = normalizeObservedChart(raw)
  return observed ? [observed] : []
}

function normalizeObservedChart(
  raw: Record<string, unknown>,
): Extract<ZhengqiVisualBlock, { type: "chart" }> | undefined {
  const chartType = text(raw.chart_type)?.toLowerCase()
  if (!chartType) return
  const categories = stringArray(raw.categories)
  const rawSeries = Array.isArray(raw.series) ? raw.series.filter(isRecord) : []
  const option = observedChartOption(chartType, raw, categories, rawSeries)
  const fallback = observedChartTable(chartType, categories, rawSeries)
  if (!option && !fallback) return
  return {
    type: "chart",
    id: text(raw.id) ?? "chart",
    title: text(raw.title),
    description: text(raw.description),
    insight: text(raw.insight),
    option,
    fallback,
  }
}

function observedChartOption(
  chartType: string,
  raw: Record<string, unknown>,
  categories: string[],
  series: Record<string, unknown>[],
): Record<string, unknown> | undefined {
  if (chartType === "pie") {
    const data = series.flatMap((item) => {
      const name = text(item.name)
      const value = finiteNumber(item.value)
      return name && value !== undefined
        ? [{ name, value, itemStyle: text(item.color) ? { color: text(item.color) } : undefined }]
        : []
    })
    if (!data.length) return
    const config = isRecord(raw.config) ? raw.config : {}
    return {
      tooltip: { trigger: "item" },
      legend: { bottom: 0, type: "scroll" },
      series: [
        {
          type: "pie",
          radius: Array.isArray(config.radius) ? config.radius : ["42%", "68%"],
          center: Array.isArray(config.center) ? config.center : ["50%", "45%"],
          label: { show: config.labels !== false },
          data,
        },
      ],
    }
  }
  if (chartType !== "bar" || !categories.length) return
  const normalizedSeries = series.flatMap((item) => {
    const data = numberArray(item.data)
    return data.length ? [{ name: text(item.name) ?? "数值", type: "bar", data }] : []
  })
  if (!normalizedSeries.length) return
  const horizontal = isRecord(raw.config) && text(raw.config.orientation) === "horizontal"
  return {
    tooltip: { trigger: "axis" },
    legend: normalizedSeries.length > 1 ? { bottom: 0 } : undefined,
    grid: { left: "3%", right: "4%", bottom: normalizedSeries.length > 1 ? 44 : "3%", containLabel: true },
    xAxis: horizontal ? { type: "value" } : { type: "category", data: categories },
    yAxis: horizontal ? { type: "category", data: categories } : { type: "value" },
    series: normalizedSeries,
  }
}

function observedChartTable(chartType: string, categories: string[], series: Record<string, unknown>[]) {
  if (chartType === "pie") {
    const rows = series.flatMap((item) => {
      const name = text(item.name)
      const value = finiteNumber(item.value)
      return name && value !== undefined ? [[name, value] as ZhengqiCell[]] : []
    })
    return rows.length ? { columns: ["项目", "数值"], rows } : undefined
  }
  if (!categories.length) return
  const values = series.map((item) => ({ name: text(item.name) ?? "数值", data: numberArray(item.data) }))
  if (!values.some((item) => item.data.length)) return
  return {
    columns: ["项目", ...values.map((item) => item.name)],
    rows: categories.map((category, index) => [category, ...values.map((item) => item.data[index] ?? null)]),
  }
}

function tableRows(value: unknown): ZhengqiCell[][] {
  if (!Array.isArray(value)) return []
  return value.flatMap((row) =>
    Array.isArray(row)
      ? [
          row.map((cell) =>
            typeof cell === "string" || typeof cell === "number" || cell === null ? cell : (text(cell) ?? ""),
          ),
        ]
      : [],
  )
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.flatMap((item) => (text(item) ? [text(item)!] : [])) : []
}

function numberArray(value: unknown) {
  return Array.isArray(value)
    ? value.flatMap((item) => (finiteNumber(item) === undefined ? [] : [finiteNumber(item)!]))
    : []
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function text(value: unknown) {
  if (typeof value === "string" && value.trim()) return value.trim()
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  return
}
