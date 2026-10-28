export function prefetchHome() {
  for (const asset of document.querySelectorAll<HTMLMetaElement>('meta[name="cmcc-home-prefetch"]')) {
    if (asset.dataset.prefetched) continue
    asset.dataset.prefetched = "true"
    const link = document.createElement("link")
    // Prefetch warms HTTP cache without executing modules or caching failed imports.
    link.rel = "prefetch"
    link.as = asset.content.endsWith(".css") ? "style" : "script"
    link.crossOrigin = "anonymous"
    link.href = asset.content
    document.head.append(link)
  }
}
