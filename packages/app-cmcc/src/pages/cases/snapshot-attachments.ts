import type { DockApiCaseSnapshot } from "@/context/dockapi"

// Resolve only attachment fields in a freshly fetched snapshot, never text/tool output.
export function resolveCaseSnapshotAttachments(snapshot: DockApiCaseSnapshot, previewBaseUrl: string) {
  const resolve = (file: { url: string }) => {
    if (!/^case:\/\/attachments\/[A-Za-z0-9_-]{1,64}\/[a-f0-9]{64}\.(png|jpg|webp|gif|avif|bmp|pdf)$/.test(file.url))
      return
    file.url = `${previewBaseUrl.replace(/\/$/, "")}/${file.url.slice("case://".length)}`
  }
  for (const session of snapshot.sessions) {
    for (const message of session.messages) {
      for (const part of message.parts) {
        if (part.type !== "tool" || part.state.status !== "completed") continue
        for (const attachment of part.state.attachments ?? []) resolve(attachment)
      }
    }
  }
  return snapshot
}
