export const ATTACHMENT_UPLOAD_LIMIT = 30 * 1024 * 1024

export function attachmentReferenceUrl(input: string) {
  const url = new URL(input)
  if (url.protocol !== "file:") throw new Error("Attachment references require a file URL")
  url.searchParams.set("opencode-attachment", "reference")
  return url.href
}

export function isAttachmentReference(input: string) {
  if (!URL.canParse(input)) return false
  const url = new URL(input)
  return url.protocol === "file:" && url.searchParams.get("opencode-attachment") === "reference"
}

export function attachmentUploadGroup(input: string) {
  const segments = input.replaceAll("\\", "/").split("/")
  if (segments[0] !== "runs" || !segments[1] || segments[2] !== "attachments") return
  if (!/^upload-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segments[3] ?? "")) return
  if (segments.length < 5 || segments.some((segment) => !segment || segment === "." || segment === "..")) return
  return segments.slice(0, 4).join("/")
}
