import { dockApiUrl, type DockApiLoadedCase, type useDockApi } from "@/context/dockapi"
import { resolveCaseSnapshotAttachments } from "./snapshot-attachments"

type CaseDataApi = Pick<ReturnType<typeof useDockApi>["cases"], "detail" | "snapshot" | "previewTicket">

export async function loadCaseData(
  api: CaseDataApi,
  caseCode: string,
  signal?: AbortSignal,
): Promise<DockApiLoadedCase> {
  const [detail, snapshot, ticket] = await Promise.all([
    api.detail(caseCode, signal),
    api.snapshot(caseCode, signal),
    api.previewTicket(caseCode, signal),
  ])
  signal?.throwIfAborted()
  if (snapshot.schemaVersion !== 1 || snapshot.caseCode !== detail.caseCode || detail.caseCode !== caseCode) {
    throw new Error("案例快照版本或编号不匹配")
  }
  const previewBaseUrl = dockApiUrl(ticket.baseUrl).replace(/\/$/, "")
  return { detail, snapshot: resolveCaseSnapshotAttachments(snapshot, previewBaseUrl), previewBaseUrl }
}
