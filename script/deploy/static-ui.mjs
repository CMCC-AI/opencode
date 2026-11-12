import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"

export function adminHeaders(html) {
  const theme = html.match(
    /<script\b(?![^>]*\bsrc\s*=)[^>]*\bid=(["'])oc-theme-preload-script\1[^>]*>([\s\S]*?)<\/script>/i,
  )
  const hash = theme ? ` 'sha256-${createHash("sha256").update(theme[2]).digest("base64")}'` : ""
  const policy = `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'${hash}; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: blob:; font-src 'self' data:; media-src 'self' data:; frame-src 'self'; connect-src * data:`
  return `add_header Content-Security-Policy "${policy}" always;\nadd_header X-Content-Type-Options nosniff always;\nadd_header X-Frame-Options SAMEORIGIN always;\nadd_header Cache-Control no-cache always;\n`
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [input, output] = process.argv.slice(2)
  if (!input || !output) throw new Error("usage: static-ui.mjs <index.html> <headers.conf>")
  await writeFile(output, adminHeaders(await readFile(input, "utf8")))
}
