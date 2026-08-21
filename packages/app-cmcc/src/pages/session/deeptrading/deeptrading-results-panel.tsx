import { For, Match, Switch } from "solid-js"
import { createStore } from "solid-js/store"
import { DeepTradingFilesTab, DeepTradingTextReportTab, DeepTradingVisualReportTab } from "./report-tabs"
import { DeepTradingTeamTab } from "./team-tab"

type DeepTradingTab = "team" | "files" | "text" | "visual"

const TABS: Array<{ id: DeepTradingTab; label: string }> = [
  { id: "team", label: "分析团队" },
  { id: "files", label: "文件" },
  { id: "text", label: "文字报告" },
  { id: "visual", label: "可视化报告" },
]

export function DeepTradingResultsPanel() {
  const [state, setState] = createStore({ active: "team" as DeepTradingTab })

  return (
    <div class="flex size-full min-w-0 flex-col bg-[#f7f8fb]">
      <nav
        class="flex h-12 shrink-0 items-end gap-1 border-b border-[#dfe3ea] bg-white px-3"
        aria-label="DeepTrading 报告页签"
      >
        <For each={TABS}>
          {(tab) => (
            <button
              type="button"
              data-selected={state.active === tab.id ? "" : undefined}
              class="relative h-11 min-w-0 flex-1 px-1 text-[12px] leading-4 text-[#7b8392] hover:text-[#384050] data-[selected]:font-medium data-[selected]:text-[#345897] after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:bg-transparent data-[selected]:after:bg-[#5271b7]"
              onClick={() => setState("active", tab.id)}
            >
              <span class="block truncate">{tab.label}</span>
            </button>
          )}
        </For>
      </nav>
      <div class="min-h-0 flex-1 overflow-hidden">
        <Switch>
          <Match when={state.active === "team"}>
            <div class="size-full overflow-hidden bg-[#f7f8fb]">
              <DeepTradingTeamTab />
            </div>
          </Match>
          <Match when={state.active === "files"}>
            <DeepTradingFilesTab />
          </Match>
          <Match when={state.active === "text"}>
            <DeepTradingTextReportTab />
          </Match>
          <Match when={state.active === "visual"}>
            <DeepTradingVisualReportTab />
          </Match>
        </Switch>
      </div>
    </div>
  )
}
