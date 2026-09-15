import { createEffect, onCleanup, onMount, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useModels } from "@/context/models"

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
const STOCK_LAB_MODELS_MESSAGE = "cmcc:stock-lab-models"
const STOCK_LAB_MODELS_READY_MESSAGE = "cmcc:stock-lab-models-ready"

export function isStockLabPath(pathname: string) {
  return pathname.replace(/\/+$/, "").toLowerCase() === "/stock-lab"
}

export function CmccStockLabFrame(props: { active: boolean }) {
  const models = useModels()
  const [state, setState] = createStore({ loaded: false, failed: false })
  let frame: HTMLIFrameElement | undefined

  const sendModels = () => {
    frame?.contentWindow?.postMessage(
      {
        type: STOCK_LAB_MODELS_MESSAGE,
        models: models
          .list()
          .filter((model) => models.visible({ providerID: model.provider.id, modelID: model.id }))
          .map((model) => ({
            id: `${model.provider.id}/${model.id}`,
            providerID: model.provider.id,
            modelID: model.id,
            name: model.name,
            providerName: model.provider.name,
            free:
              model.cost.input === 0 &&
              model.cost.output === 0 &&
              model.cost.cache.read === 0 &&
              model.cost.cache.write === 0,
          })),
      },
      new URL(STOCK_LAB_URL).origin,
    )
  }

  createEffect(() => {
    if (!models.ready()) return
    models.list()
    sendModels()
  })

  onMount(() => {
    const receiveReady = (event: MessageEvent) => {
      if (event.source !== frame?.contentWindow) return
      if (!event.data || typeof event.data !== "object" || event.data.type !== STOCK_LAB_MODELS_READY_MESSAGE) return
      sendModels()
    }
    window.addEventListener("message", receiveReady)
    onCleanup(() => window.removeEventListener("message", receiveReady))
  })

  return (
    <div
      aria-hidden={!props.active}
      inert={!props.active}
      class="absolute inset-0 z-10 flex min-h-0 min-w-0 flex-col bg-[#fbfcff]"
      classList={{ "invisible pointer-events-none": !props.active }}
    >
      <Show when={!state.loaded && !state.failed}>
        <div class="absolute inset-0 grid place-items-center bg-[#fbfcff] text-sm text-[#6b7280]">
          正在加载 AlphaLab 策略实验室…
        </div>
      </Show>
      <Show when={state.failed}>
        <div class="absolute inset-0 z-10 grid place-items-center bg-[#fbfcff] px-6 text-center text-sm text-[#d9485f]">
          AlphaLab 策略实验室暂时无法加载，请检查股票产品服务地址。
        </div>
      </Show>
      <iframe
        ref={frame}
        title="AlphaLab AI 策略实验室"
        class="min-h-0 min-w-0 flex-1 border-0 bg-[#fbfcff]"
        src={STOCK_LAB_URL}
        onLoad={() => {
          setState({ loaded: true, failed: false })
          sendModels()
        }}
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
