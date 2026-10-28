import { existsSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { DomUtils, parseDocument } from "htmlparser2"
import { FSUtil } from "@opencode-ai/core/fs-util"

const reportRuntime = /\/assets\/report-runtime-[a-f0-9]{12}\.js$/

export function htmlPreviewRuntime(input: string | undefined, request: string, referer: string | undefined) {
  if (!input || !URL.canParse(input)) return
  const runtime = new URL(input)
  if (runtime.protocol !== "http:" && runtime.protocol !== "https:") return
  if (runtime.username || runtime.password || runtime.hash) return
  const bundled = reportRuntime.test(runtime.pathname)
  if (runtime.pathname.includes("/report-runtime-") && (!bundled || runtime.search)) return
  if (
    !bundled &&
    (!runtime.pathname.toLowerCase().includes("echarts") || !runtime.pathname.toLowerCase().endsWith(".js"))
  )
    return
  const requestOrigin = new URL(request, "http://localhost").origin
  const refererOrigin = referer && URL.canParse(referer) ? new URL(referer).origin : undefined
  if (runtime.origin !== requestOrigin && runtime.origin !== refererOrigin) return
  return runtime
}

function library(source: string | undefined, stylesheet = false) {
  if (!source || !URL.canParse(source, "http://localhost")) return false
  const filename = path.posix.basename(new URL(source, "http://localhost").pathname)
  return stylesheet
    ? /^katex(?:\.min)?\.css$/i.test(filename)
    : /^(?:marked(?:\.umd|\.esm|\.min)*|echarts(?:\.common|\.simple|\.esm|\.min)*|katex(?:\.min)?)\.(?:js|mjs)$/i.test(
        filename,
      )
}

export function prepareHtmlPreview(content: string, runtime: string, directory: string, htmlPath: string) {
  const document = parseDocument(content)
  const htmlDirectory = path.resolve(directory, path.dirname(htmlPath))
  for (const image of DomUtils.getElementsByTagName("img", document.children)) {
    const source = image.attribs.src
    if (!source || /^(?:data:|https?:|blob:|\/|#)/i.test(source)) continue
    const assetPath = path.resolve(htmlDirectory, source.split(/[?#]/, 1)[0] ?? "")
    if (!FSUtil.contains(directory, assetPath) || !/\.svg$/i.test(assetPath)) continue
    if (!existsSync(assetPath) || !statSync(assetPath).isFile()) continue
    image.attribs.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(readFileSync(assetPath, "utf8"))}`
  }
  const scripts = DomUtils.getElementsByTagName("script", document.children)
  if (reportRuntime.test(new URL(runtime).pathname)) {
    scripts.filter((script) => library(script.attribs.src)).forEach((script) => DomUtils.removeElement(script))
    DomUtils.getElementsByTagName("link", document.children)
      .filter((link) => link.attribs.rel?.toLowerCase() === "stylesheet" && library(link.attribs.href, true))
      .forEach((link) => DomUtils.removeElement(link))
    const script = DomUtils.getElementsByTagName("script", parseDocument("<script></script>").children)[0]
    script.attribs.src = runtime
    script.attribs["data-cmcc-report-runtime"] = "local"
    const head = DomUtils.getElementsByTagName("head", document.children)[0]
    DomUtils.prependChild(head ?? document, script)
    return DomUtils.getOuterHTML(document)
  }
  // Cached older clients still send an ECharts-only runtime URL.
  const charts = scripts.filter((script) => script.attribs.src?.toLowerCase().includes("echarts"))
  const primary = charts[0]
  if (primary) {
    primary.attribs.src = runtime
    primary.attribs["data-deeptrading-echarts"] = "local"
    delete primary.attribs.integrity
    delete primary.attribs.crossorigin
    delete primary.attribs.referrerpolicy
    charts.slice(1).forEach((script) => DomUtils.removeElement(script))
  } else {
    const script = DomUtils.getElementsByTagName("script", parseDocument("<script></script>").children)[0]
    script.attribs.src = runtime
    script.attribs["data-deeptrading-echarts"] = "local"
    const head = DomUtils.getElementsByTagName("head", document.children)[0]
    DomUtils.prependChild(head ?? document, script)
  }
  return DomUtils.getOuterHTML(document)
}

export function htmlPreviewCsp(runtime: URL) {
  return [
    "default-src 'none'",
    `script-src 'unsafe-inline' ${runtime.origin}${runtime.pathname}`,
    "script-src-attr 'none'",
    "style-src 'unsafe-inline'",
    "img-src data:",
    "font-src data:",
    "connect-src 'none'",
    "media-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-src 'none'",
  ].join("; ")
}
