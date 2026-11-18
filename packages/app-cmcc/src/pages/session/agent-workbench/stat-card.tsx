import statIconsUrl from "@/assets/workbench/stat-icons.svg?url"

type Metric =
  | "elapsed"
  | "tokens"
  | "analysis"
  | "experts"
  | "report-length"
  | "charts"
  | "sources"
  | "products"
  | "artifacts"

export function WorkbenchStatCard(props: { metric: Metric; label: string; value: string }) {
  return (
    <div class="flex min-h-[64px] min-w-0 items-center gap-1.5 rounded-[7px] border border-[#dce5f5] bg-white p-2">
      <span class="flex size-7 shrink-0 items-center justify-center">
        <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24">
          <use href={`${statIconsUrl}#${props.metric}`} width="24" height="24" />
        </svg>
      </span>
      <span class="min-w-0">
        <span class="block break-words text-[10px] leading-4 text-[#7d8594]">{props.label}</span>
        <strong class="block break-words text-[13px] font-semibold leading-4 text-[#293142]">{props.value}</strong>
      </span>
    </div>
  )
}
