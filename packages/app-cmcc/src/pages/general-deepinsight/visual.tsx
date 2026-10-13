import { createEffect, createMemo, For, Index, onCleanup, onMount, Show } from "solid-js"
import type { ECharts, EChartsOption } from "echarts"
import { Markdown } from "@opencode-ai/session-ui/markdown"
import { array, object, text, type JsonObject, type ResearchData } from "./model"
import { citationNumbers } from "./report-citations"
import { ReportMarkdown } from "./report-markdown"

function Chart(props: { option: JsonObject }) {
  let container!: HTMLDivElement
  let chart: ECharts | undefined
  let observer: ResizeObserver | undefined
  let disposed = false
  onMount(() => {
    void import("echarts").then((echarts) => {
      if (disposed) return
      chart = echarts.init(container)
      chart.setOption(props.option as EChartsOption, true)
      observer = new ResizeObserver(() => chart?.resize())
      observer.observe(container)
    })
  })
  createEffect(() => {
    const option = props.option
    chart?.setOption(option as EChartsOption, true)
  })
  onCleanup(() => {
    disposed = true
    observer?.disconnect()
    chart?.dispose()
  })
  return <div ref={container} class="research-chart chart-host" />
}

function DataTable(props: { data: JsonObject }) {
  return (
    <div class="research-table table-scroll">
      <table>
        <thead>
          <tr>
            <For each={array(props.data.columns)}>{(column) => <th>{String(column ?? "")}</th>}</For>
          </tr>
        </thead>
        <tbody>
          <For each={array(props.data.rows)}>
            {(row) => (
              <tr>
                <For each={array(row)}>{(cell) => <td>{String(cell ?? "")}</td>}</For>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </div>
  )
}

function Figure(props: { figure: JsonObject; table?: JsonObject }) {
  const asset = () => text(props.figure.asset_url)
  const validAsset = () => /^https?:\/\//i.test(asset())
  return (
    <figure class="research-figure">
      <Show when={text(props.figure.title)}>
        <figcaption>{text(props.figure.title)}</figcaption>
      </Show>
      <Show
        when={Object.keys(object(props.figure.option)).length}
        fallback={
          <Show when={validAsset()}>
            <img src={asset()} alt={text(props.figure.title)} loading="lazy" />
          </Show>
        }
      >
        <Chart option={object(props.figure.option)} />
      </Show>
      <Show when={props.table}>{(table) => <DataTable data={table()} />}</Show>
      <Show when={text(props.figure.caption) || text(props.figure.description)}>
        <p>{text(props.figure.caption) || text(props.figure.description)}</p>
      </Show>
      <Show when={text(props.figure.source)}>
        <small>来源：{text(props.figure.source)}</small>
      </Show>
    </figure>
  )
}

export function ReportBody(props: { content: string; data: ResearchData; streaming?: boolean }) {
  const numbers = createMemo(() => (props.streaming ? undefined : citationNumbers(props.content)))
  const chunks = () => props.content.split(/(\{\{?chart:[^}]+\}\}?)/g)
  const figure = (key: string, map?: Record<string, JsonObject>) => {
    const id = key.replace(/^VIZ-/i, "").replace(/^0+(?!$)/, "")
    return map?.[key] ?? map?.[id] ?? Object.values(map ?? {}).find((row) => String(row.index) === id || row.id === key)
  }
  return (
    <div class="research-markdown">
      <Index each={chunks()}>
        {(chunk) => {
          const key = () => /^\{\{?chart:([^}]+)\}\}?$/.exec(chunk())?.[1]?.trim()
          return (
            <Show
              when={key()}
              fallback={<ReportMarkdown text={chunk()} streaming={props.streaming} numbers={numbers()} />}
            >
              {(key) => {
                const chart = () => figure(key(), props.data.visualizationsMap)
                const table = () => figure(key(), props.data.vizTablesMap)
                return (
                  <Show when={chart() || table()} fallback={<p class="research-notice">图表 {key()} 暂无可用数据</p>}>
                    <Figure figure={chart() ?? {}} table={table()} />
                  </Show>
                )
              }}
            </Show>
          )
        }}
      </Index>
    </div>
  )
}

function ChartBlock(props: { value: JsonObject }) {
  return (
    <section class="visual-block chart-card">
      <h4>{text(props.value.title) || "图表"}</h4>
      <Show when={text(props.value.description)}>
        <p class="chart-desc">{text(props.value.description)}</p>
      </Show>
      <Show when={Object.keys(object(props.value.option)).length} fallback={<p class="warning">图表配置暂不支持</p>}>
        <Chart option={object(props.value.option)} />
      </Show>
    </section>
  )
}
function Block(props: { value: unknown; data: ResearchData }) {
  const block = () => object(props.value)
  const items = () => array(block().items).map(object)
  const tone = () => text(block().tone) || "neutral"
  return (
    <Show when={text(block().type)}>
      {(type) => {
        switch (type()) {
          case "markdown":
            return (
              <div class="visual-block markdown-block">
                <ReportBody content={text(block().content)} data={props.data} />
              </div>
            )
          case "chart":
            return <ChartBlock value={object(block().chart)} />
          case "table":
            return (
              <section class="visual-block table-card">
                <Show when={text(block().title)}>
                  <h4>{text(block().title)}</h4>
                </Show>
                <DataTable data={block()} />
              </section>
            )
          case "stat_grid":
            return (
              <section class="visual-block stat-grid">
                <Show when={text(block().title)}>
                  <h4>{text(block().title)}</h4>
                </Show>
                <div class="stat-grid-items">
                  <For each={items()}>
                    {(item) => (
                      <article class={`tone-card ${text(item.tone) || "neutral"}`}>
                        <b>{iconText(text(item.icon))}</b>
                        <span>{text(item.label)}</span>
                        <strong>{String(item.value ?? "--")}</strong>
                        <Show when={text(item.caption)}>
                          <small>{text(item.caption)}</small>
                        </Show>
                      </article>
                    )}
                  </For>
                </div>
              </section>
            )
          case "mini_kpi_row":
            return (
              <section class="visual-block mini-kpi-row">
                <For each={items()}>
                  {(item) => (
                    <article class={`mini-kpi ${text(item.tone) || "neutral"}`}>
                      <span>{text(item.label)}</span>
                      <strong>
                        {String(item.value ?? "--")}
                        <Show when={text(item.trend)}>
                          <em>{trendText(text(item.trend))}</em>
                        </Show>
                      </strong>
                    </article>
                  )}
                </For>
              </section>
            )
          case "callout":
            return (
              <section class={`visual-block callout ${tone()}`}>
                <Show when={text(block().title)}>
                  <h4>{text(block().title)}</h4>
                </Show>
                <Markdown text={text(block().content)} />
              </section>
            )
          case "chip_list":
            return (
              <section class="visual-block chip-list">
                <Show when={text(block().title)}>
                  <h4>{text(block().title)}</h4>
                </Show>
                <For each={array(block().items)}>{(item) => <span>{String(item)}</span>}</For>
              </section>
            )
          case "progress_bar":
            return (
              <section class="visual-block progress-block">
                <Show when={text(block().title)}>
                  <h4>{text(block().title)}</h4>
                </Show>
                <For each={items()}>
                  {(item) => (
                    <div class="progress-item">
                      <div>
                        <span>{text(item.label)}</span>
                        <b>
                          {String(item.value ?? "--")}
                          {text(item.suffix)}
                        </b>
                      </div>
                      <Show when={typeof item.value === "number"}>
                        <i>
                          <em
                            style={{
                              width: `${Math.min(100, Math.max(0, (Number(item.value) / (typeof item.max === "number" && item.max > 0 ? item.max : 100)) * 100))}%`,
                            }}
                          />
                        </i>
                      </Show>
                    </div>
                  )}
                </For>
              </section>
            )
          case "timeline":
            return (
              <section class="visual-block visual-timeline">
                <Show when={text(block().title)}>
                  <h4>{text(block().title)}</h4>
                </Show>
                <For each={items()}>
                  {(item) => (
                    <div class="timeline-row">
                      <i />
                      <div>
                        <b>{text(item.label)}</b>
                        <p>{text(item.content)}</p>
                      </div>
                    </div>
                  )}
                </For>
              </section>
            )
          case "quote_card":
            return (
              <section class={`visual-block quote-card ${tone()}`}>
                <blockquote>{text(block().content)}</blockquote>
                <Show when={text(block().source)}>
                  <cite>{text(block().source)}</cite>
                </Show>
              </section>
            )
          case "divider":
            return (
              <div class="visual-divider">
                <i />
                <Show when={text(block().label)}>
                  <span>{text(block().label)}</span>
                </Show>
                <i />
              </div>
            )
          default:
            return <p class="warning">暂不支持的可视化内容：{type()}</p>
        }
      }}
    </Show>
  )
}
export function VisualReport(props: { data: ResearchData }) {
  const report = () => props.data.visualReport
  return (
    <Show when={report()} fallback={<p class="research-empty">暂无可视化报告</p>}>
      {(report) => (
        <article class="visual-report">
          <header class="visual-report-header">
            <h2>{text(report().title) || "可视化研究报告"}</h2>
            <Show when={text(report()._warning)}>
              <p class="warning">{text(report()._warning)}</p>
            </Show>
          </header>
          <For each={array(report().sections)}>
            {(raw) => {
              const section = object(raw)
              return (
                <section class="visual-section">
                  <Show when={text(section.heading)}>
                    <h3>{text(section.heading)}</h3>
                  </Show>
                  <div class="visual-blocks">
                    <For each={array(section.blocks)}>{(block) => <Block value={block} data={props.data} />}</For>
                  </div>
                </section>
              )
            }}
          </For>
          <For each={array(report().charts)}>{(chart) => <ChartBlock value={object(chart)} />}</For>
          <Show when={!array(report().sections).length && !array(report().charts).length}>
            <p class="warning">可视化报告结构暂不支持</p>
          </Show>
        </article>
      )}
    </Show>
  )
}
function iconText(value: string) {
  return (
    (
      {
        trend_up: "↑",
        trend_down: "↓",
        money: "¥",
        risk: "!",
        warning: "!",
        info: "i",
        moat: "◎",
        spark: "*",
        target: "◇",
        calendar: "日",
        activity: "↗",
        flame: "热",
      } as Record<string, string>
    )[value] ?? "•"
  )
}
function trendText(value: string) {
  return ({ up: "▲", down: "▼", flat: "−" } as Record<string, string>)[value] ?? ""
}
