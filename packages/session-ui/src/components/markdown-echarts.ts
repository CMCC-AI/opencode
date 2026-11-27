export type EChartsChart = {
  setOption(option: unknown, opts?: { notMerge?: boolean }): void
  resize(): void
  dispose(): void
}

export type EChartsGlobal = { init(el: HTMLElement): EChartsChart }

export type EChartsEntry = { chart: EChartsChart; observer: ResizeObserver; el: HTMLElement }

// 图型契约：模型侧保证 option 只含这些图型（纯 JSON，禁函数/表达式），对齐 deeptrading-quick v1.3.0
const SERIES_TYPES = new Set(["line", "bar", "pie", "scatter", "candlestick"])

// 解析 ```echarts 围栏内容：仅 JSON.parse，失败或非契约返回 undefined（调用方退化为代码块展示）
export function parseEchartsOption(raw: string): Record<string, unknown> | undefined {
  try {
    const option = JSON.parse(raw) as unknown
    if (!option || typeof option !== "object" || Array.isArray(option)) return
    const series = (option as { series?: unknown }).series
    const list = Array.isArray(series) ? series : series ? [series] : []
    const invalid = list.some((item) => {
      const type = item && typeof item === "object" ? (item as { type?: unknown }).type : undefined
      return typeof type === "string" && !SERIES_TYPES.has(type)
    })
    if (invalid) return
    return option as Record<string, unknown>
  } catch {
    return
  }
}

// ECharts 按需懒加载（仅页面出现图块时注入 vendor 脚本）
let loader: Promise<EChartsGlobal | undefined> | undefined

export function loadEcharts(): Promise<EChartsGlobal | undefined> {
  loader ??= (async () => {
    const win = window as unknown as { echarts?: EChartsGlobal }
    if (win.echarts) return win.echarts
    const url = new URL("../vendor/echarts.min.js", import.meta.url).href
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement("script")
      script.src = url
      script.onload = () => resolve()
      script.onerror = () => reject(new Error("echarts load failed"))
      document.head.appendChild(script)
    })
    return (window as unknown as { echarts?: EChartsGlobal }).echarts
  })().catch(() => {
    loader = undefined
    return undefined
  })
  return loader
}
