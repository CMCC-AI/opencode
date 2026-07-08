import { Navigate, useParams } from "@solidjs/router"
import { createMemo, Show } from "solid-js"

const deepTradingUrl = (() => {
  const base = "http://81.70.174.140:8083/"
  const token = import.meta.env.VITE_DEEPTRADING_API_KEY
  if (!token) return base
  return `${base}?token=${encodeURIComponent(token)}`
})()

export const CMCC_EXPERTS = [
  {
    id: "chat",
    name: "DeepInsight 深度洞察",
    url: "http://152.136.106.161:3001/chat",
  },
  {
    id: "portal",
    name: "DeepTrading 财经分析",
    url: deepTradingUrl,
  },
  {
    id: "workspace",
    name: "DeepTrack 行业资讯追踪",
    url: "http://81.70.174.140:8888/",
  },
] as const

export function cmccExpertHref(expert: (typeof CMCC_EXPERTS)[number]) {
  return `/expert/${expert.id}`
}

export function CmccExpertRoute() {
  const params = useParams<{ id?: string }>()
  const expert = createMemo(() => CMCC_EXPERTS.find((item) => item.id === params.id))

  return (
    <Show when={expert()} fallback={<Navigate href={cmccExpertHref(CMCC_EXPERTS[0])} />}>
      {(item) => (
        <div class="flex size-full min-h-0 min-w-0 flex-col bg-v2-background-bg-base">
          <iframe
            title={item().name}
            class="min-h-0 flex-1 border-0 bg-white"
            src={item().url}
            sandbox="allow-forms allow-popups allow-same-origin allow-scripts"
          />
        </div>
      )}
    </Show>
  )
}
