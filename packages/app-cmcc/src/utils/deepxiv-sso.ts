export function isDeepXivMessage(
  event: Pick<MessageEvent, "origin" | "source" | "data">,
  origin: string,
  source: Window | null | undefined,
): event is MessageEvent<{ type: string; requestId?: string }> {
  return !!source && event.origin === origin && event.source === source
    && !!event.data && typeof event.data === "object" && typeof event.data.type === "string"
}
