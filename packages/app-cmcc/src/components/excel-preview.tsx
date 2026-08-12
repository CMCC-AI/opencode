import { For, Show, createEffect, onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import { parseExcelPreview, type ExcelPreviewWorkbook } from "@/pages/session/excel-preview"

export function ExcelPreview(props: { data: ArrayBuffer }) {
  const [state, setState] = createStore({
    loading: true,
    error: undefined as string | undefined,
    workbook: undefined as ExcelPreviewWorkbook | undefined,
    activeSheet: 0,
  })

  createEffect(() => {
    const data = props.data
    let active = true
    setState({ loading: true, error: undefined, workbook: undefined, activeSheet: 0 })

    void parseExcelPreview(data)
      .then((workbook) => {
        if (!active) return
        setState({ loading: false, workbook })
      })
      .catch((error: unknown) => {
        if (!active) return
        setState({ loading: false, error: error instanceof Error ? error.message : String(error) })
      })

    onCleanup(() => {
      active = false
    })
  })

  const sheet = () => state.workbook?.sheets[state.activeSheet]

  return (
    <div data-cmcc-excel-preview class="relative flex size-full min-h-0 min-w-0 flex-col bg-white text-black">
      <Show when={sheet()}>
        {(current) => (
          <>
            <div class="flex h-9 shrink-0 items-center gap-2 border-b border-black/10 bg-[#f8f9fa] px-3 text-[11px] text-black/55">
              <span>
                {current().totalRows} 行 × {current().totalColumns} 列
              </span>
              <span class="min-w-0 flex-1 truncate text-right">兼容预览模式 · 图表及复杂对象请下载查看</span>
            </div>
            <div class="min-h-0 min-w-0 flex-1 overflow-auto">
              <table class="border-separate border-spacing-0 text-[12px] leading-5">
                <colgroup>
                  <col style={{ width: "44px" }} />
                  <For each={current().columnWidths}>{(width) => <col style={{ width: `${width}px` }} />}</For>
                </colgroup>
                <thead class="sticky top-0 z-20 bg-[#f1f3f4]">
                  <tr>
                    <th class="sticky left-0 z-30 h-7 min-w-11 border-b border-r border-black/10 bg-[#f1f3f4]" />
                    <For each={current().columnWidths}>
                      {(_, column) => (
                        <th class="h-7 border-b border-r border-black/10 px-2 text-center font-normal text-black/55">
                          {columnName(column())}
                        </th>
                      )}
                    </For>
                  </tr>
                </thead>
                <tbody>
                  <For each={current().rows}>
                    {(row, rowIndex) => (
                      <tr>
                        <th class="sticky left-0 z-10 h-7 border-b border-r border-black/10 bg-[#f1f3f4] px-2 text-right font-normal text-black/55">
                          {rowIndex() + 1}
                        </th>
                        <For each={row}>
                          {(cell) => (
                            <Show when={!cell.hidden}>
                              <td
                                colSpan={cell.colSpan}
                                rowSpan={cell.rowSpan}
                                class="h-7 min-w-16 border-b border-r border-black/10 bg-white px-2 align-top whitespace-pre-wrap break-words"
                                title={cell.value}
                              >
                                {cell.value}
                              </td>
                            </Show>
                          )}
                        </For>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
              <Show when={current().truncated}>
                <div class="sticky bottom-0 left-0 border-t border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
                  文件较大，在线预览仅展示前 1,000 行和前 100 列，请下载查看完整内容。
                </div>
              </Show>
            </div>
          </>
        )}
      </Show>
      <Show when={(state.workbook?.sheets.length ?? 0) > 0}>
        <div class="flex h-9 shrink-0 items-stretch gap-0.5 overflow-x-auto border-t border-black/10 bg-[#f8f9fa] px-2">
          <For each={state.workbook?.sheets ?? []}>
            {(item, index) => (
              <button
                type="button"
                class="max-w-48 shrink-0 truncate border-b-2 border-transparent px-3 text-[12px] text-black/55 hover:bg-black/5 hover:text-black/80 data-[selected]:border-green-600 data-[selected]:bg-white data-[selected]:text-black"
                data-selected={state.activeSheet === index() ? "" : undefined}
                title={item.name}
                onClick={() => setState("activeSheet", index())}
              >
                {item.name}
              </button>
            )}
          </For>
        </div>
      </Show>
      <Show when={!state.loading && !state.error && state.workbook?.sheets.length === 0}>
        <div class="flex flex-1 items-center justify-center px-8 text-center text-[13px] text-black/60">
          工作簿中没有可预览的工作表。
        </div>
      </Show>
      <Show when={state.loading}>
        <div class="absolute inset-0 flex items-center justify-center bg-white/90 text-[13px] text-black/60">
          正在解析工作簿...
        </div>
      </Show>
      <Show when={state.error}>
        {(error) => (
          <div class="absolute inset-0 flex items-center justify-center bg-white px-8 text-center text-[13px] text-black/60">
            Excel 预览失败：{error()}
          </div>
        )}
      </Show>
    </div>
  )
}

function columnName(column: number): string {
  const current = Math.floor(column / 26)
  const value = String.fromCharCode(65 + (column % 26))
  if (current === 0) return value
  return `${columnName(current - 1)}${value}`
}
