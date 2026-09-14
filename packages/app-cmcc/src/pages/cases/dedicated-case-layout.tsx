import { createMediaQuery } from "@solid-primitives/media"
import { Show, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import type { DockApiCaseSnapshot } from "@/context/dockapi"
import type { DeepTradingArtifactSource } from "@/pages/session/deeptrading/workbench-context"
import { DeepTradingSplitLayout } from "@/pages/session/deeptrading/split-layout"
import "./dedicated-case.css"

export type DedicatedCaseProps = {
  snapshot: () => DockApiCaseSnapshot
  artifactSource: DeepTradingArtifactSource
  header: JSX.Element
  onCreateSame: () => void
}

export function DedicatedCaseLayout(props: {
  header: JSX.Element
  left: JSX.Element
  right: JSX.Element
  persistKey?: string
  label?: string
  dagRows?: number
}) {
  const desktop = createMediaQuery("(min-width: 768px)")
  const [state, setState] = createStore({ mobileView: "content" as "content" | "results" })
  const results = () =>
    props.dagRows ? (
      <div class="case-dedicated-results size-full min-h-0" style={{ "--case-dag-height": `${props.dagRows * 42}px` }}>
        {props.right}
      </div>
    ) : (
      props.right
    )
  return (
    <div
      class="flex size-full min-h-0 flex-col overflow-hidden bg-[#f7f8fb]"
      classList={{ "max-md:pt-10": !!props.dagRows }}
    >
      {props.header}
      <div class="min-h-0 flex-1">
        <Show
          when={desktop()}
          fallback={
            <div class="flex size-full min-h-0 flex-col">
              <div class="grid h-10 shrink-0 grid-cols-2 border-b border-[#e0e4eb] bg-white p-1">
                <button
                  type="button"
                  data-selected={state.mobileView === "content" ? "" : undefined}
                  class="rounded-[6px] text-[12px] text-[#7a8498] data-[selected]:bg-[#edf3ff] data-[selected]:text-[#3474e8]"
                  onClick={() => setState("mobileView", "content")}
                >
                  分析内容
                </button>
                <button
                  type="button"
                  data-selected={state.mobileView === "results" ? "" : undefined}
                  class="rounded-[6px] text-[12px] text-[#7a8498] data-[selected]:bg-[#edf3ff] data-[selected]:text-[#3474e8]"
                  onClick={() => setState("mobileView", "results")}
                >
                  分析结果
                </button>
              </div>
              <div class="min-h-0 flex-1 overflow-hidden">
                {state.mobileView === "content" ? props.left : results()}
              </div>
            </div>
          }
        >
          <DeepTradingSplitLayout
            left={props.left}
            right={results()}
            persistKey={props.persistKey}
            label={props.label}
          />
        </Show>
      </div>
    </div>
  )
}
