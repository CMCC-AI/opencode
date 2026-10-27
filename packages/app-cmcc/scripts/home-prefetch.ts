import type { ChunkMetadata, HtmlTagDescriptor, Plugin, Rollup } from "vite"

export function homePrefetchTags(bundle: Rollup.OutputBundle, base: string): HtmlTagDescriptor[] {
  const home = Object.values(bundle).find(
    (item) =>
      item.type === "chunk" && item.facadeModuleId?.replaceAll("\\", "/").endsWith("/src/pages/new-session.tsx"),
  )
  if (!home) throw new Error("Homepage chunk is missing from the build")
  const collect = (file: string, result: Set<string>) => {
    if (result.has(file)) return
    result.add(file)
    const item = bundle[file]
    if (item?.type !== "chunk") return
    for (const dependency of item.imports) collect(dependency, result)
    const metadata = (item as Rollup.OutputChunk & { viteMetadata?: ChunkMetadata }).viteMetadata
    for (const css of metadata?.importedCss ?? []) result.add(css)
  }
  const eager = new Set<string>()
  for (const item of Object.values(bundle)) {
    if (item.type === "chunk" && item.isEntry) collect(item.fileName, eager)
  }
  const assets = new Set<string>()
  collect(home.fileName, assets)
  return [...assets]
    .filter((file) => !eager.has(file) && /\.(js|css)$/.test(file))
    .map((file) => ({
      tag: "meta",
      attrs: { name: "cmcc-home-prefetch", content: base + file },
      injectTo: "head",
    }))
}

export function homePrefetch(): Plugin {
  let base = "/"
  return {
    name: "cmcc:home-prefetch",
    apply: "build",
    configResolved(config) {
      base = config.base
    },
    transformIndexHtml: {
      order: "post",
      handler(_html, context) {
        if (context.bundle) return homePrefetchTags(context.bundle, base)
      },
    },
  }
}
