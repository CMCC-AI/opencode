import { Markdown } from "@opencode-ai/session-ui/markdown"
import type { ECharts } from "echarts"
import { For, Match, Show, Switch, createEffect, createMemo, onCleanup, onMount, type JSX } from "solid-js"
import {
  buildDeepInspectMarkdownPlaceholders,
  deepInspectBundleChartOption,
  orderDeepInspectVisualBlocks,
  resolveDeepInspectMarkdownBlock,
  type DeepInspectBundleChart,
  type DeepInspectLayoutBlock,
  type DeepInspectVisualReport,
} from "./visual-report"

export function DeepInspectVisualReportView(props: {
  report: DeepInspectVisualReport
  markdown: string
  cacheKey: string
}) {
  const placeholders = createMemo(() => buildDeepInspectMarkdownPlaceholders(props.markdown))
  const unresolved = createMemo(() => {
    if (props.report.kind !== "layout") return 0
    return props.report.sections
      .flatMap((section) => section.blocks)
      .filter(
        (block) =>
          block.type === "markdown" && resolveDeepInspectMarkdownBlock(block.content, placeholders()).unresolved,
      ).length
  })

  return (
    <article class="mx-auto w-full max-w-[980px] space-y-4 pb-8">
      <header class="rounded-[8px] border border-[#dfe5ef] bg-white px-5 py-4">
        <h2 class="m-0 text-[18px] font-semibold leading-7 text-[#273044]">{props.report.title || "巡查可视化报告"}</h2>
        <Show when={props.report.kind === "layout" ? props.report.subtitle : props.report.summary}>
          {(subtitle) => <p class="m-0 mt-1 text-[12px] leading-5 text-[#7c879b]">{subtitle()}</p>}
        </Show>
        <Show when={unresolved() > 0}>
          <p class="m-0 mt-2 rounded-[6px] bg-[#fff8e8] px-3 py-2 text-[11px] leading-5 text-[#8a681f]">
            有 {unresolved()} 处正文占位符无法与文字报告匹配，已跳过对应空内容。
          </p>
        </Show>
      </header>

      <Show when={props.report.kind === "layout" ? props.report : undefined}>
        {(report) => (
          <For each={report().sections}>
            {(section) => (
              <section class="rounded-[8px] border border-[#dfe5ef] bg-white px-5 py-5 sm:px-6">
                <Show when={section.heading}>
                  {(heading) => (
                    <h3 class="m-0 mb-4 text-[15px] font-semibold leading-6 text-[#30394c]">{heading()}</h3>
                  )}
                </Show>
                <div class="space-y-4">
                  <For each={orderDeepInspectVisualBlocks(section.blocks)}>
                    {(block, index) => (
                      <LayoutBlockView
                        block={block}
                        placeholders={placeholders()}
                        cacheKey={`${props.cacheKey}:${section.id}:${index()}`}
                      />
                    )}
                  </For>
                </div>
              </section>
            )}
          </For>
        )}
      </Show>

      <Show when={props.report.kind === "chart-bundle" ? props.report : undefined}>
        {(report) => (
          <div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <For each={report().charts}>{(chart) => <BundleChartView chart={chart} />}</For>
          </div>
        )}
      </Show>
    </article>
  )
}

function LayoutBlockView(props: {
  block: DeepInspectLayoutBlock
  placeholders: ReadonlyMap<string, string>
  cacheKey: string
}) {
  const markdown = createMemo(() =>
    props.block.type === "markdown"
      ? resolveDeepInspectMarkdownBlock(props.block.content, props.placeholders)
      : undefined,
  )
  return (
    <Switch>
      <Match when={props.block.type === "markdown" && markdown()?.content}>
        <Markdown
          text={markdown()?.content ?? ""}
          cacheKey={props.cacheKey}
          class="select-text text-[13px] leading-7 text-[#343c4d]"
        />
      </Match>
      <Match when={props.block.type === "chart" ? props.block : undefined}>
        {(block) => (
          <VisualPanel title={block().chart.title} description={block().chart.description}>
            <EChart option={block().chart.option} />
          </VisualPanel>
        )}
      </Match>
      <Match when={props.block.type === "callout" ? props.block : undefined}>
        {(block) => (
          <aside
            data-tone={block().tone}
            class="rounded-[7px] border border-[#dce4f2] bg-[#f5f8fd] px-4 py-3 text-[12px] leading-6 text-[#44516a] data-[tone=negative]:border-[#efd1d1] data-[tone=negative]:bg-[#fff5f5] data-[tone=warning]:border-[#ecdcae] data-[tone=warning]:bg-[#fff9eb]"
          >
            <Show when={block().title}>
              {(title) => <strong class="mb-1 block text-[12px] text-[#303a4e]">{title()}</strong>}
            </Show>
            {block().content}
          </aside>
        )}
      </Match>
      <Match when={props.block.type === "table" ? props.block : undefined}>
        {(block) => (
          <div class="overflow-x-auto rounded-[7px] border border-[#e1e6ee]">
            <Show when={block().title}>
              {(title) => (
                <strong class="block border-b border-[#e7ebf1] bg-[#f7f9fc] px-3 py-2 text-[12px]">{title()}</strong>
              )}
            </Show>
            <table class="w-full min-w-[520px] border-collapse text-left text-[11px] leading-5 text-[#465066]">
              <thead class="bg-[#f4f6fa]">
                <tr>
                  <For each={block().columns}>
                    {(column) => <th class="border-b border-[#e0e5ed] px-3 py-2 font-medium">{column}</th>}
                  </For>
                </tr>
              </thead>
              <tbody>
                <For each={block().rows}>
                  {(row) => (
                    <tr>
                      <For each={row}>{(cell) => <td class="border-b border-[#edf0f4] px-3 py-2">{cell}</td>}</For>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        )}
      </Match>
      <Match when={props.block.type === "quote_card" ? props.block : undefined}>
        {(block) => (
          <blockquote class="m-0 rounded-[7px] border-l-4 border-[#7891c6] bg-[#f6f8fc] px-4 py-3 text-[12px] leading-6 text-[#465169]">
            {block().content}
            <Show when={block().source}>
              {(source) => <footer class="mt-1 text-[10px] text-[#8a93a5]">{source()}</footer>}
            </Show>
          </blockquote>
        )}
      </Match>
      <Match when={props.block.type === "timeline" ? props.block : undefined}>
        {(block) => (
          <div class="space-y-2">
            <Show when={block().title}>
              {(title) => <strong class="block text-[12px] text-[#30394c]">{title()}</strong>}
            </Show>
            <For each={block().items}>
              {(item) => (
                <div class="relative border-l-2 border-[#cfd9ec] py-1 pl-4 text-[11px] leading-5 text-[#556078] before:absolute before:-left-[5px] before:top-2 before:size-2 before:rounded-full before:bg-[#6d87bd]">
                  <Show when={item.label}>{(label) => <strong class="block text-[#364056]">{label()}</strong>}</Show>
                  {item.content}
                </div>
              )}
            </For>
          </div>
        )}
      </Match>
      <Match when={props.block.type === "divider" ? props.block : undefined}>
        {(block) => (
          <div class="flex items-center gap-3 py-1 text-[10px] text-[#929bad] before:h-px before:flex-1 before:bg-[#e1e6ee] after:h-px after:flex-1 after:bg-[#e1e6ee]">
            {block().label}
          </div>
        )}
      </Match>
    </Switch>
  )
}

function BundleChartView(props: { chart: DeepInspectBundleChart }) {
  const option = createMemo(() => deepInspectBundleChartOption(props.chart))
  return (
    <VisualPanel title={props.chart.title} description={props.chart.description} insight={props.chart.insight}>
      <Show when={option()} fallback={<ChartDataTable chart={props.chart} />}>
        {(value) => <EChart option={value()} />}
      </Show>
    </VisualPanel>
  )
}

function VisualPanel(props: { title?: string; description?: string; insight?: string; children: JSX.Element }) {
  return (
    <section class="rounded-[8px] border border-[#dfe5ef] bg-white px-4 py-4">
      <Show when={props.title}>
        {(title) => <h4 class="m-0 text-[13px] font-semibold leading-5 text-[#30394c]">{title()}</h4>}
      </Show>
      <Show when={props.description}>
        {(description) => <p class="m-0 mt-1 text-[10px] leading-5 text-[#8993a6]">{description()}</p>}
      </Show>
      <div class="mt-3">{props.children}</div>
      <Show when={props.insight}>
        {(insight) => (
          <p class="m-0 mt-3 rounded-[6px] bg-[#f5f7fb] px-3 py-2 text-[11px] leading-5 text-[#5c6679]">{insight()}</p>
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

function ChartDataTable(props: { chart: DeepInspectBundleChart }) {
  return (
    <div>
      <p class="m-0 mb-2 text-[10px] text-[#8b94a6]">该图表类型暂不转换，以下展示原始可比数据。</p>
      <div class="overflow-hidden rounded-[6px] border border-[#e3e7ee]">
        <For each={props.chart.data}>
          {(item) => (
            <div class="flex items-center justify-between border-b border-[#edf0f4] px-3 py-2 text-[11px] last:border-b-0">
              <span class="text-[#596477]">{item.label}</span>
              <strong class="text-[#354056]">{new Intl.NumberFormat("zh-CN").format(item.value)}</strong>
            </div>
          )}
        </For>
      </div>
    </div>
  )
}
