import { Markdown } from "@opencode-ai/session-ui/markdown"
import type { ECharts } from "echarts"
import { For, Match, Show, Switch, createEffect, onCleanup, onMount, type JSX } from "solid-js"
import type { ZhengqiChartTable, ZhengqiVisualBlock, ZhengqiVisualReport } from "./visual-report"

export function ZhengqiVisualReportView(props: { report: ZhengqiVisualReport; cacheKey: string }) {
  return (
    <article class="mx-auto w-full max-w-[980px] space-y-4 pb-8">
      <header class="rounded-[8px] border border-[#dfe5ef] bg-white px-5 py-4">
        <h2 class="m-0 text-[18px] font-semibold leading-7 text-[#273044]">
          {props.report.title || "政企谈参高拜可视化报告"}
        </h2>
        <Show when={props.report.subtitle}>
          {(subtitle) => <p class="m-0 mt-1 text-[12px] leading-5 text-[#7c879b]">{subtitle()}</p>}
        </Show>
        <For each={props.report.warnings}>
          {(warning) => (
            <p class="m-0 mt-2 rounded-[6px] bg-[#fff8e8] px-3 py-2 text-[11px] leading-5 text-[#8a681f]">{warning}</p>
          )}
        </For>
      </header>

      <For each={props.report.sections}>
        {(section) => (
          <section class="rounded-[8px] border border-[#dfe5ef] bg-white px-5 py-5 sm:px-6">
            <Show when={section.heading}>
              {(heading) => <h3 class="m-0 mb-4 text-[15px] font-semibold leading-6 text-[#30394c]">{heading()}</h3>}
            </Show>
            <div class="space-y-4">
              <For each={section.blocks}>
                {(block, index) => (
                  <VisualBlockView block={block} cacheKey={`${props.cacheKey}:${section.id}:${index()}`} />
                )}
              </For>
            </div>
          </section>
        )}
      </For>

      <Show when={props.report.references.length > 0}>
        <section class="rounded-[8px] border border-[#dfe5ef] bg-white px-5 py-5 sm:px-6">
          <h3 class="m-0 mb-3 text-[15px] font-semibold leading-6 text-[#30394c]">参考文献</h3>
          <ol class="m-0 space-y-2 pl-5 text-[11px] leading-5 text-[#596477]">
            <For each={props.report.references}>
              {(reference) => (
                <li>
                  <Show when={reference.url} fallback={reference.title}>
                    {(url) => (
                      <a class="break-all text-[#4268b3] hover:underline" href={url()} target="_blank" rel="noreferrer">
                        {reference.title}
                      </a>
                    )}
                  </Show>
                </li>
              )}
            </For>
          </ol>
        </section>
      </Show>
    </article>
  )
}

function VisualBlockView(props: { block: ZhengqiVisualBlock; cacheKey: string }) {
  return (
    <Switch>
      <Match when={props.block.type === "markdown" ? props.block : undefined}>
        {(block) => (
          <Markdown
            text={block().content}
            cacheKey={props.cacheKey}
            class="select-text text-[13px] leading-7 text-[#343c4d]"
          />
        )}
      </Match>
      <Match when={props.block.type === "chart" ? props.block : undefined}>
        {(block) => (
          <VisualPanel title={block().title} description={block().description} insight={block().insight}>
            <Show when={block().option} fallback={<ChartTable table={block().fallback} />}>
              {(option) => <EChart option={option()} />}
            </Show>
          </VisualPanel>
        )}
      </Match>
      <Match when={props.block.type === "table" ? props.block : undefined}>
        {(block) => (
          <VisualPanel title={block().title} description={block().description} insight={block().source}>
            <DataTable columns={block().columns} rows={block().rows} />
          </VisualPanel>
        )}
      </Match>
      <Match when={props.block.type === "stat_grid" ? props.block : undefined}>
        {(block) => (
          <VisualPanel title={block().title} description={block().description}>
            <div class="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <For each={block().items}>
                {(item) => (
                  <div class="min-w-0 rounded-[7px] border border-[#dfe7f4] bg-[#f5f8fd] px-3 py-3">
                    <span class="block text-[10px] leading-4 text-[#7e899c]">{item.label}</span>
                    <strong class="mt-1 block break-words text-[17px] font-semibold leading-6 text-[#2f4f88]">
                      {item.value}
                      <Show when={item.unit}>
                        {(unit) => <small class="ml-1 text-[10px] font-normal">{unit()}</small>}
                      </Show>
                    </strong>
                    <Show when={item.caption}>
                      {(caption) => (
                        <small class="mt-1 block break-words text-[9px] leading-4 text-[#929aab]">{caption()}</small>
                      )}
                    </Show>
                  </div>
                )}
              </For>
            </div>
          </VisualPanel>
        )}
      </Match>
    </Switch>
  )
}

function VisualPanel(props: { title?: string; description?: string; insight?: string; children: JSX.Element }) {
  return (
    <section class="rounded-[8px] border border-[#dfe5ef] bg-[#fbfcff] px-4 py-4">
      <Show when={props.title}>
        {(title) => <h4 class="m-0 text-[13px] font-semibold leading-5 text-[#30394c]">{title()}</h4>}
      </Show>
      <Show when={props.description}>
        {(description) => <p class="m-0 mt-1 text-[10px] leading-5 text-[#8993a6]">{description()}</p>}
      </Show>
      <div class="mt-3">{props.children}</div>
      <Show when={props.insight}>
        {(insight) => (
          <p class="m-0 mt-3 rounded-[6px] bg-[#f2f5fa] px-3 py-2 text-[11px] leading-5 text-[#5c6679]">{insight()}</p>
        )}
      </Show>
    </section>
  )
}

function EChart(props: { option: Record<string, unknown> }) {
  let container: HTMLDivElement | undefined
  let chart: ECharts | undefined
  let disposed = false
  let observer: ResizeObserver | undefined
  onMount(() => {
    void import("echarts").then((echarts) => {
      if (disposed || !container) return
      chart = echarts.init(container, undefined, { renderer: "canvas" })
      chart.setOption(props.option, true)
      observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(() => chart?.resize())
      observer?.observe(container)
    })
    onCleanup(() => {
      disposed = true
      observer?.disconnect()
      chart?.dispose()
      chart = undefined
    })
  })
  createEffect(() => {
    const option = props.option
    if (chart) chart.setOption(option, true)
  })
  return <div ref={container} class="h-[300px] w-full min-w-0" />
}

function ChartTable(props: { table?: ZhengqiChartTable }) {
  return (
    <Show
      when={props.table}
      fallback={<p class="m-0 text-[11px] text-[#8b94a6]">该图表类型暂不转换，且没有可展示的结构化数据。</p>}
    >
      {(table) => (
        <div>
          <p class="m-0 mb-2 text-[10px] text-[#8b94a6]">该图表类型暂不转换，以下展示原始可比数据。</p>
          <DataTable columns={table().columns} rows={table().rows} />
        </div>
      )}
    </Show>
  )
}

function DataTable(props: { columns: string[]; rows: Array<Array<string | number | null>> }) {
  return (
    <div class="overflow-x-auto rounded-[7px] border border-[#e1e6ee] bg-white">
      <table class="w-full min-w-[520px] border-collapse text-left text-[11px] leading-5 text-[#465066]">
        <thead class="bg-[#f4f6fa]">
          <tr>
            <For each={props.columns}>
              {(column) => <th class="border-b border-[#e0e5ed] px-3 py-2 font-medium">{column}</th>}
            </For>
          </tr>
        </thead>
        <tbody>
          <For each={props.rows}>
            {(row) => (
              <tr>
                <For each={row}>{(cell) => <td class="border-b border-[#edf0f4] px-3 py-2">{cell}</td>}</For>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </div>
  )
}
