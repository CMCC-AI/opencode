import { createHash } from "node:crypto"
import { fileURLToPath } from "node:url"
import valueParser from "postcss-value-parser"
import { build, type Plugin } from "vite"

async function reportBundle() {
  const result = await build({
    configFile: false,
    root: fileURLToPath(new URL("..", import.meta.url)),
    publicDir: false,
    logLevel: "error",
    css: {
      postcss: {
        plugins: [
          {
            postcssPlugin: "cmcc:report-woff2",
            AtRule: {
              "font-face": (rule) => {
                rule.walkDecls("src", (declaration) => {
                  const nodes = valueParser(declaration.value).nodes
                  const end = nodes.findIndex((node) => node.type === "div" && node.value === ",")
                  const source = nodes.slice(0, end < 0 ? undefined : end)
                  if (
                    !source.some(
                      (node) =>
                        node.type === "function" &&
                        node.value === "format" &&
                        node.nodes.some((value) => value.type === "string" && value.value === "woff2"),
                    )
                  )
                    throw new Error("Report formula fonts must provide WOFF2 first")
                  declaration.value = valueParser.stringify(source)
                })
              },
            },
          },
        ],
      },
    },
    build: {
      write: false,
      target: "es2018",
      minify: true,
      lib: {
        entry: fileURLToPath(new URL("../src/components/report-preview-runtime.ts", import.meta.url)),
        name: "CmccReportPreview",
        formats: ["iife"],
      },
    },
  })
  const bundle = Array.isArray(result) ? result[0] : result
  if (!bundle || !("output" in bundle)) throw new Error("Report runtime build returned no output")
  if (bundle.output.length !== 1 || bundle.output[0].type !== "chunk")
    throw new Error("Report runtime must be self-contained, including formula styles and fonts")
  const source = bundle.output[0].code
  const hash = createHash("sha256").update(source).digest("hex").slice(0, 12)
  return { source, fileName: `assets/report-runtime-${hash}.js` }
}

export function reportAssets(): Plugin {
  let asset: ReturnType<typeof reportBundle> | undefined
  const bundle = () => (asset ??= reportBundle())
  const module = "virtual:cmcc-report-runtime"
  let base = "/"
  let command = "build"
  return {
    name: "cmcc:report-assets",
    configResolved(config) {
      base = config.base
      command = config.command
    },
    resolveId(id) {
      if (id === module) return `\0${module}`
    },
    async load(id) {
      if (id !== `\0${module}`) return
      const value = await bundle()
      if (command === "build") this.emitFile({ type: "asset", ...value })
      return `export default ${JSON.stringify(base + value.fileName)}`
    },
    async configureServer(server) {
      const value = await bundle()
      server.middlewares.use((request, response, next) => {
        const pathname = new URL(request.url ?? "/", "http://localhost").pathname
        if (pathname !== base + value.fileName || !["GET", "HEAD"].includes(request.method ?? "")) return next()
        response.setHeader("Content-Type", "text/javascript; charset=utf-8")
        response.setHeader("Cache-Control", "public, max-age=31536000, immutable")
        response.end(request.method === "HEAD" ? undefined : value.source)
      })
    },
  }
}
