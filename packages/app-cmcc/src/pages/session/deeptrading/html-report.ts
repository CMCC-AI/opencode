export type PreparedHtmlReport = {
  document?: string
  title: string
  error?: string
}

export function prepareDeepTradingHtmlReport(content: string, echartsRuntimeUrl: string): PreparedHtmlReport {
  if (!content.trim()) return { title: "DeepTrading 可视化报告", error: "HTML 报告内容为空" }

  const document = new DOMParser().parseFromString(content, "text/html")
  for (const script of document.querySelectorAll<HTMLScriptElement>("script[src]")) {
    if (script.getAttribute("src")?.toLowerCase().includes("echarts")) script.remove()
  }

  const runtime = document.createElement("script")
  runtime.src = echartsRuntimeUrl
  runtime.dataset.deeptradingEcharts = "local"
  document.head.prepend(runtime)

  return {
    document: `<!DOCTYPE html>\n${document.documentElement.outerHTML}`,
    title: document.title.trim() || "DeepTrading 可视化报告",
  }
}
