import { Show } from "solid-js"
import { createStore } from "solid-js/store"

interface BrowserLocation {
  protocol: string
  hostname: string
  href: string
}

export function resolveStockLabURL(configuredURL: string | undefined, location: BrowserLocation, isDev: boolean) {
  const protocol = location.protocol === "https:" ? "https:" : "http:"
  const hostname = location.hostname || "localhost"
  const baseURL = location.href.startsWith("http") ? location.href : `${protocol}//${hostname}`
  const fallbackURL = isDev ? `${protocol}//${hostname}:3010` : "/stock-app/"
  const url = new URL(configuredURL?.trim() || fallbackURL, baseURL)
  url.searchParams.set("embed", "1")
  return url.toString()
}

const STOCK_LAB_URL = resolveStockLabURL(import.meta.env.VITE_STOCK_LAB_URL, window.location, import.meta.env.DEV)

export function isStockLabPath(pathname: string) {
  return pathname.replace(/\/+$/, "").toLowerCase() === "/stock-lab"
}

export function CmccStockLabFrame(props: { active: boolean }) {
  const [state, setState] = createStore({ loaded: false, failed: false })

  return (
    <div
      aria-hidden={!props.active}
      inert={!props.active}
      class="absolute inset-0 z-10 flex min-h-0 min-w-0 flex-col bg-[#07100c]"
      classList={{ "invisible pointer-events-none": !props.active }}
    >
      <Show when={!state.loaded && !state.failed}>
        <div class="absolute inset-0 grid place-items-center bg-[#07100c] text-sm text-[#84978d]">
          正在加载 AlphaLab 策略实验室…
        </div>
      </Show>
      <Show when={state.failed}>
        <div class="absolute inset-0 z-10 grid place-items-center bg-[#07100c] px-6 text-center text-sm text-[#ffabb0]">
          AlphaLab 策略实验室暂时无法加载，请检查股票产品服务地址。
        </div>
      </Show>
      <iframe
        title="AlphaLab AI 策略实验室"
        class="min-h-0 min-w-0 flex-1 border-0 bg-[#07100c]"
        src={STOCK_LAB_URL}
        onLoad={() => setState({ loaded: true, failed: false })}
        onError={() => setState({ loaded: false, failed: true })}
        allow="clipboard-read; clipboard-write"
        referrerPolicy="strict-origin-when-cross-origin"
        sandbox="allow-downloads allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"
      />
    </div>
  )
}

export function CmccStockLabRoute() {
  return null
}
