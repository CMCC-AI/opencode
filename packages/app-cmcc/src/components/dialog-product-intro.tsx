import { createSignal, Show } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"

/**
 * 产品介绍按钮 + 右侧抽屉
 * 按钮放置在页面右上角，点击后从右侧滑出全高度抽屉，
 * 通过 iframe 展示 /product-intro/index.html
 * 参考 DeepInsight-UI ProductDescriptionModal.vue 的交互方式。
 */
export function ProductIntroButton(props: { class?: string }) {
  const [open, setOpen] = createSignal(false)
  const [fullscreen, setFullscreen] = createSignal(false)

  return (
    <>
      <button
        type="button"
        data-action="product-intro"
        class={
          props.class ??
          "flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium text-v2-text-text-base transition-colors hover:bg-v2-background-bg-layer-02"
        }
        onClick={() => setOpen(true)}
        title="产品介绍"
      >
        <Icon name="help" class="size-4" />
        产品介绍
      </button>

      <Show when={open()}>
        {/* 遮罩 */}
        <div
          class="fixed inset-0 z-[999] bg-black/40 backdrop-blur-[2px]"
          style={{ display: "flex", "justify-content": "flex-end" }}
          onClick={() => setOpen(false)}
        >
          {/* 抽屉主体 —— 紧贴右侧，高度占满 */}
          <div
            class="flex h-dvh flex-col overflow-hidden bg-[#f5f6fa] shadow-[-8px_0_32px_rgba(0,0,0,0.12)]"
            style={{
              width: fullscreen() ? "100%" : "min(100%, 1400px)",
              "transition-property": "width",
              "transition-duration": "350ms",
              "transition-timing-function": "cubic-bezier(0.22, 1, 0.36, 1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 标题栏 */}
            <div class="flex h-12 shrink-0 items-center justify-between border-b border-[#eee] bg-white px-5">
              <span class="text-[15px] font-semibold text-[#333]">产品介绍</span>
              <div class="flex items-center gap-1">
                {/* 全屏 / 半屏切换 */}
                <button
                  type="button"
                  class="flex h-8 w-8 items-center justify-center rounded-lg text-[#888] transition-all hover:bg-black/6 hover:text-[#333]"
                  onClick={() => setFullscreen((v) => !v)}
                  title={fullscreen() ? "半屏" : "全屏"}
                >
                  <Show
                    when={!fullscreen()}
                    fallback={
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M8 3v3a2 2 0 0 1-2 2H3" />
                        <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
                        <path d="M3 16h3a2 2 0 0 1 2 2v3" />
                        <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
                      </svg>
                    }
                  >
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
                      <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
                      <path d="M3 16v3a2 2 0 0 0 2 2h3" />
                      <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
                    </svg>
                  </Show>
                </button>
                {/* 关闭 */}
                <button
                  type="button"
                  class="flex h-8 w-8 items-center justify-center rounded-lg text-[#888] transition-all hover:bg-black/6 hover:text-[#333]"
                  onClick={() => setOpen(false)}
                  title="关闭"
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>
            {/* iframe 内容区 */}
            <div class="relative min-h-0 flex-1 overflow-hidden">
              <iframe
                src="/product-intro/index.html"
                class="block h-full w-full border-0"
                title="产品介绍"
                allowfullscreen
              />
            </div>
          </div>
        </div>
      </Show>
    </>
  )
}
