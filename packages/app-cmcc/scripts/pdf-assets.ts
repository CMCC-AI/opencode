import { readFile, readdir } from "node:fs/promises"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import type { Plugin } from "vite"

export function pdfAssets(): Plugin {
  const directory = dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json"))
  const assets = readFile(join(directory, "package.json"), "utf8").then(async (content) => {
    const { version } = JSON.parse(content) as { version: string }
    const groups = await Promise.all(
      ["cmaps", "standard_fonts", "wasm", "iccs"].map(async (folder) =>
        (await readdir(join(directory, folder), { withFileTypes: true }))
          .filter((entry) => entry.isFile())
          .map((entry) => [`pdfjs/${version}/${folder}/${entry.name}`, join(directory, folder, entry.name)] as const),
      ),
    )
    return new Map(groups.flat())
  })
  return {
    name: "cmcc:pdf-assets",
    async configureServer(server) {
      const files = await assets
      server.middlewares.use((request, response, next) => {
        const pathname = new URL(request.url ?? "/", "http://localhost").pathname
        const path = files.get(pathname.slice(server.config.base.length))
        if (!path || !["GET", "HEAD"].includes(request.method ?? "")) return next()
        void readFile(path).then(
          (content) => {
            response.setHeader(
              "Content-Type",
              path.endsWith(".wasm")
                ? "application/wasm"
                : path.endsWith(".js")
                  ? "text/javascript"
                  : "application/octet-stream",
            )
            response.end(request.method === "HEAD" ? undefined : content)
          },
          () => {
            response.statusCode = 404
            response.end()
          },
        )
      })
    },
    async generateBundle() {
      await Promise.all(
        [...(await assets)].map(async ([fileName, path]) => {
          this.emitFile({ type: "asset", fileName, source: await readFile(path) })
        }),
      )
    },
  }
}
