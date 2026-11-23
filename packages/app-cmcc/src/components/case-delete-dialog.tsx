import { createEffect, Show } from "solid-js"
import { createStore } from "solid-js/store"
import type { DockApiCatalogCaseSummary } from "@/context/dockapi"
import { useDockApi } from "@/context/dockapi"
import { showToast } from "@/utils/toast"
import { DeleteConfirmation } from "./delete-confirmation"

export const caseDeletionDescription = "案例快照、封面和案例产物将被删除且无法恢复，原历史任务不会受到影响。"

export function CaseDeleteDialog(props: {
  value?: DockApiCatalogCaseSummary
  onClose: () => void
  onDeleted: () => void
}) {
  const dockapi = useDockApi()
  const [state, setState] = createStore({ deleting: false })
  createEffect(() => {
    if (props.value && dockapi.user?.caseDeleteAllowed !== true && !state.deleting) props.onClose()
  })

  const close = () => {
    if (state.deleting) return
    props.onClose()
  }

  const remove = async () => {
    const value = props.value
    if (!value || state.deleting || dockapi.user?.caseDeleteAllowed !== true) return
    setState("deleting", true)
    await (value.source === "langgraph"
      ? dockapi.research.request(`/api/dockapi/general-deepinsight/cases/${encodeURIComponent(value.caseCode)}`, { method: "DELETE" })
      : dockapi.cases.remove(value.caseCode))
      .then(() => {
        dockapi.cases.invalidate()
        showToast({ variant: "success", title: "案例已删除" })
        props.onDeleted()
      })
      .catch((error) => {
        showToast({
          variant: "error",
          title: "案例删除失败",
          description: error instanceof Error ? error.message : String(error),
        })
      })
      .finally(() => setState("deleting", false))
  }

  return (
    <Show when={props.value} keyed>
      {(value) => (
        <DeleteConfirmation
          title="删除案例"
          message={`确定永久删除“${value.caseName}”吗？`}
          description={caseDeletionDescription}
          pending={state.deleting}
          onCancel={close}
          onConfirm={() => void remove()}
        />
      )}
    </Show>
  )
}
