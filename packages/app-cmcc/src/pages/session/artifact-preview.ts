export type ArtifactPreviewKind =
  | "html"
  | "docx"
  | "excel"
  | "pptx"
  | "pdf"
  | "image"
  | "markdown"
  | "text"
  | "unsupported"

const IMAGE_EXTENSIONS = new Set(["avif", "bmp", "gif", "jpeg", "jpg", "png", "svg", "webp"])
const TEXT_EXTENSIONS = new Set([
  "css",
  "csv",
  "go",
  "ini",
  "java",
  "js",
  "json",
  "jsx",
  "log",
  "mjs",
  "py",
  "rs",
  "sql",
  "toml",
  "ts",
  "tsx",
  "txt",
  "xml",
  "yaml",
  "yml",
])

export function artifactExtension(path: string) {
  return path.replaceAll("\\", "/").split("/").at(-1)?.split(".").at(-1)?.toLowerCase() ?? ""
}

export function artifactPreviewKind(path: string): ArtifactPreviewKind {
  const extension = artifactExtension(path)
  if (extension === "html" || extension === "htm") return "html"
  if (extension === "docx") return "docx"
  if (extension === "xls" || extension === "xlsx") return "excel"
  if (extension === "pptx") return "pptx"
  if (extension === "pdf") return "pdf"
  if (IMAGE_EXTENSIONS.has(extension)) return "image"
  if (extension === "md" || extension === "markdown" || extension === "mdx") return "markdown"
  if (TEXT_EXTENSIONS.has(extension)) return "text"
  return "unsupported"
}

export function resolveArtifactPath(candidate: string, paths: string[]) {
  const value = candidate
    .trim()
    .replace(/^file:\/\//i, "")
    .split(/[?#]/, 1)[0]
    ?.replace(/^\.\//, "")
    .replaceAll("\\", "/")
  if (!value || /^(?:https?|mailto):/i.test(value) || artifactPreviewKind(value) === "unsupported") return undefined

  const exact = paths.filter((path) => {
    const normalized = path.replaceAll("\\", "/")
    return normalized === value || (value.includes("/") && normalized.endsWith(`/${value}`))
  })
  if (exact.length === 1) return exact[0]

  const name = value.split("/").at(-1)
  const matches = paths.filter((path) => path.replaceAll("\\", "/").split("/").at(-1) === name)
  if (matches.length === 1) return matches[0]
  return undefined
}

export function artifactBytes(content: string) {
  const decoded = atob(content)
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0)).buffer
}

export function artifactBuffer(content: string, encoding?: "base64") {
  if (encoding === "base64") return artifactBytes(content)
  return new TextEncoder().encode(content).buffer
}

export function artifactText(content: string, encoding?: "base64") {
  if (encoding !== "base64") return content
  return new TextDecoder().decode(artifactBytes(content))
}

export function artifactDataUrl(input: { content: string; encoding?: "base64"; mimeType?: string }, mimeType: string) {
  const type = input.mimeType ?? mimeType
  if (input.encoding === "base64") return `data:${type};base64,${input.content}`
  return `data:${type};charset=utf-8,${encodeURIComponent(input.content)}`
}
