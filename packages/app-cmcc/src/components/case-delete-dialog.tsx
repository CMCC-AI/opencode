import { Icon } from "@opencode-ai/ui/icon"
import { Show } from "solid-js"
import { createStore } from "solid-js/store"
import { Portal } from "solid-js/web"
import type { DockApiCatalogCaseSummary } from "@/context/dockapi"
import { useDockApi } from "@/context/dockapi"
import { showToast } from "@/utils/toast"

export function CaseDeleteDialog(props: {
  value?: DockApiCatalogCaseSummary
  onClose: () => void
  onDeleted: () => void
}) {
  const dockapi = useDockApi()
  const [state, setState] = createStore({ deleting: false })

  const close = () => {
    if (state.deleting) return
    props.onClose()
  }

  const remove = async () => {
    const value = props.value
    if (!value || state.deleting) return
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
        <Portal>
          <div
            class="fixed inset-0 z-[620] flex items-center justify-center bg-[rgba(34,39,68,0.28)] p-5 backdrop-blur-[4px]"
            onPointerDown={(event) => {
              if (event.target === event.currentTarget) close()
            }}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="case-delete-title"
              class="isolate w-full max-w-[420px] overflow-hidden rounded-[8px] border border-[#cbd8f0] bg-[#f7f9ff] shadow-[0_22px_60px_rgba(46,66,110,0.20)]"
            >
              <header class="flex h-14 items-center justify-between border-b border-[#dbe4f3] bg-[#eef3ff] px-[18px]">
                <h2 id="case-delete-title" class="text-[15px] font-semibold text-[#27334f]">
                  删除案例
                </h2>
                <button
                  type="button"
                  aria-label="关闭"
                  disabled={state.deleting}
                  class="flex size-7 items-center justify-center rounded-[6px] text-[#6475a1] hover:bg-[#e7eeff] disabled:opacity-50"
                  onClick={close}
                >
                  <Icon name="close" class="size-4" />
                </button>
              </header>
              <div class="px-[18px] py-5">
                <p class="m-0 text-[14px] leading-6 text-[#364159]">
                  确定永久删除“{value.caseName}”吗？
                </p>
                <p class="mt-4 rounded-[7px] border border-red-500/30 bg-red-500/8 px-3 py-2 text-[12px] leading-5 text-[#68738b]">
                  案例快照、封面和案例产物将被删除且无法恢复，原历史任务不会受到影响。
                </p>
              </div>
              <footer class="flex justify-end gap-2 border-t border-[#e3e9f4] bg-[#f2f5fc] px-[18px] py-4">
                <button
                  type="button"
                  disabled={state.deleting}
                  class="h-9 rounded-[6px] border border-[#d9e1ef] bg-white px-4 text-[13px] text-[#5d6880] hover:bg-[#f7f9fd] disabled:opacity-50"
                  onClick={close}
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={state.deleting}
                  class="flex h-9 items-center gap-2 rounded-[6px] bg-red-600 px-4 text-[13px] font-medium text-white hover:bg-red-500 disabled:cursor-wait disabled:opacity-60"
                  onClick={() => void remove()}
                >
                  <Show when={state.deleting} fallback={<Icon name="trash" class="size-4" />}>
                    <span class="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" />
                  </Show>
                  {state.deleting ? "正在删除..." : "永久删除"}
                </button>
              </footer>
            </section>
          </div>
        </Portal>
      )}
    </Show>
  )
}
