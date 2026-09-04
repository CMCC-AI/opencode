// Compatibility bridge for the already-running embedded UI binary.
// Remove its Nginx injection after deploying the versioned cmcc-experts.ts URL.
export function upgradeDeepInsightFrame(frame) {
  const src = frame.getAttribute("src")
  if (!src || !URL.canParse(src)) return
  const url = new URL(src)
  if (url.origin !== "http://152.136.106.161:3001" || url.pathname !== "/chat") return
  // Do not override a newer release's explicit version.
  if (url.searchParams.has("v")) return
  url.searchParams.set("v", "stream-post-b824e1c126")
  frame.setAttribute("src", url.href)
}

if (typeof document !== "undefined") {
  const scan = (node) => {
    if (!(node instanceof Element)) return
    if (node.matches("iframe")) upgradeDeepInsightFrame(node)
    node.querySelectorAll("iframe").forEach(upgradeDeepInsightFrame)
  }
  new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "attributes") scan(record.target)
      for (const node of record.addedNodes) scan(node)
    }
  }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["src"] })
  scan(document.documentElement)
}
