import { Icon } from "@opencode-ai/ui/icon"
import { For, Show, type Component } from "solid-js"
import type { KnowledgeNotebook } from "@/utils/cmcc-knowledge"

type CmccKnowledgePickerProps = {
  notebooks: KnowledgeNotebook[]
  onClose: () => void
  onManage: () => void
  onSelect: (notebook: KnowledgeNotebook) => void
}

export const CmccKnowledgePicker: Component<CmccKnowledgePickerProps> = (props) => (
  <div class="fixed inset-0 z-[210] flex items-center justify-center bg-black/40 px-4 py-5" onClick={props.onClose}>
    <section
      class="flex max-h-[min(620px,calc(100dvh-32px))] w-full max-w-[560px] flex-col overflow-hidden rounded-[14px] bg-v2-background-bg-layer-01 shadow-[0_24px_80px_rgba(0,0,0,0.28)]"
      role="dialog"
      aria-modal="true"
      aria-label="选择知识库"
      onClick={(event) => event.stopPropagation()}
    >
      <header class="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-v2-border-border-base px-6">
        <div class="min-w-0">
          <h2 class="text-[16px] font-medium leading-6 text-v2-text-text-base">选择知识库</h2>
          <p class="truncate text-[12px] leading-5 text-v2-text-text-muted">新对话将使用所选知识库中的内容</p>
        </div>
        <button
          type="button"
          class="flex size-8 shrink-0 items-center justify-center rounded-[7px] text-v2-icon-icon-muted hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-icon-icon-base"
          onClick={props.onClose}
          aria-label="关闭知识库选择"
        >
          <Icon name="close" class="size-4" />
        </button>
      </header>

      <Show
        when={props.notebooks.length > 0}
        fallback={
          <div class="flex min-h-64 flex-col items-center justify-center gap-3 px-8 py-10 text-center">
            <div class="flex size-12 items-center justify-center rounded-[12px] bg-v2-background-bg-layer-02">
              <Icon name="brain" class="size-6 text-v2-icon-icon-muted" />
            </div>
            <div>
              <p class="text-[14px] font-medium leading-6 text-v2-text-text-base">还没有可用的知识库</p>
              <p class="mt-1 text-[12px] leading-5 text-v2-text-text-muted">
                先创建或导入一个知识库，再从这里发起对话。
              </p>
            </div>
            <button
              type="button"
              class="h-9 rounded-[8px] bg-v2-text-text-base px-4 text-[13px] font-medium text-v2-background-bg-layer-01"
              onClick={props.onManage}
            >
              前往知识库
            </button>
          </div>
        }
      >
        <div class="min-h-0 flex-1 overflow-y-auto p-3">
          <For each={props.notebooks}>
            {(notebook) => (
              <button
                type="button"
                class="flex w-full items-center gap-3 rounded-[10px] px-3 py-3 text-left hover:bg-v2-overlay-simple-overlay-hover"
                onClick={() => props.onSelect(notebook)}
              >
                <span class="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-v2-background-bg-layer-02 text-xl">
                  {notebook.emoji}
                </span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-[14px] font-medium leading-5 text-v2-text-text-base">
                    {notebook.name}
                  </span>
                  <span class="mt-0.5 block truncate text-[12px] leading-5 text-v2-text-text-muted">
                    {notebook.description || `${notebook.sourceCount ?? 0} 个知识文件`}
                  </span>
                </span>
                <Icon name="chevron-right" size="small" class="size-3.5 shrink-0 text-v2-icon-icon-muted" />
              </button>
            )}
          </For>
        </div>
        <footer class="flex shrink-0 justify-end border-t border-v2-border-border-base px-5 py-3">
          <button
            type="button"
            class="h-8 rounded-[7px] px-3 text-[12px] text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base"
            onClick={props.onManage}
          >
            管理知识库
          </button>
        </footer>
      </Show>
    </section>
  </div>
)
