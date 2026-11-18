import iconsUrl from "@/assets/workbench/artifact-file-icons.svg?url&no-inline"

const families = {
  pdf: ["pdf"],
  word: ["doc", "docx"],
  sheet: ["xls", "xlsx", "csv", "tsv"],
  presentation: ["ppt", "pptx"],
  markdown: ["md", "markdown"],
  html: ["html", "htm"],
  json: ["json", "jsonl"],
  image: ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif", "ico"],
  archive: ["zip", "rar", "7z", "tar", "gz"],
}

const fileIcons = new Map(
  Object.entries(families).flatMap(([kind, extensions]) => extensions.map((extension) => [extension, kind] as const)),
)

export function WorkbenchFileIcon(props: { filename: string; compact?: boolean }) {
  const kind = () => {
    const dot = props.filename.lastIndexOf(".")
    if (dot <= 0) return "file"
    return fileIcons.get(props.filename.slice(dot + 1).toLowerCase()) ?? "file"
  }
  return (
    <svg
      data-artifact-file-icon={kind()}
      aria-hidden="true"
      class={props.compact ? "size-3.5 shrink-0" : "size-4 shrink-0"}
      viewBox="0 0 24 24"
    >
      <use href={`${iconsUrl}#${kind()}`} width="24" height="24" />
    </svg>
  )
}
