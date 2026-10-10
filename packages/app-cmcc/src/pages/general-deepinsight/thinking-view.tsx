import { createMemo, For, Index, Match, Show, Switch } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"
import { Markdown } from "@opencode-ai/session-ui/markdown"
import { array, object, text, type ResearchData, type ResearchStatus } from "./model"
import { outputData, reflectionData, stringList } from "./presentation"
import { timelineAssets } from "./assets"
import {
  hiddenThinkingNodes,
  thinkingColors,
  thinkingCompletion,
  thinkingItems,
  thinkingLabels,
  thinkingOutline,
  thinkingResume,
  thinkingSourceHref,
  type ThinkingItem,
} from "./thinking-timeline"

export function ThinkingTimeline(props: {
  sessionId: string
  data: ResearchData
  status: ResearchStatus
  replaying: boolean
  activeNode: string
  expanded: Record<string, boolean>
  onToggle: (key: string) => void
}) {
  const items = createMemo(() => thinkingItems(props.data, props.status, props.replaying))
  const running = () => props.status === "running"
  const badge = (item: ThinkingItem) => {
    if (item.kind === "confirmation")
      return item.pending ? "待确认" : item.record?.resume != null ? "已确认" : "确认记录"
    if (item.node === "web_search" && Array.isArray(item.payload.sources_gathered))
      return `本轮搜索${item.payload.sources_gathered.length}个来源`
    if (item.node === "reflection" && item.payload.round_completed === true) return "轮次完成"
    return thinkingCompletion(item.node)
  }
  return (
    <div class="timeline" data-component="research-thinking-timeline">
      <Index each={items()}>
        {(item, index) => {
          const expanded = () => !!props.expanded[item().key]
          const active = () =>
            running() &&
            (item().node === props.activeNode ||
              (item().kind === "plan" && ["generate_query", "query_generation"].includes(props.activeNode)))
          const id = () => `thinking-${props.sessionId}-${item().key}`
          return (
            <div
              class="timeline-item"
              data-node={item().node}
              data-kind={item().kind}
              classList={{ expanded: expanded(), active: active() }}
            >
              <div class="timeline-left">
                <div class={`timeline-dot ${thinkingColors[item().node] ?? "gray"}`}>
                  <Show when={timelineAssets[item().node]}>
                    <img src={timelineAssets[item().node]} alt="" />
                  </Show>
                </div>
                <Show when={index < items().length - 1 || running()}>
                  <div class="timeline-line" />
                </Show>
              </div>
              <div class="timeline-right">
                <Show
                  when={!thinkingCompletion(item().node)}
                  fallback={
                    <div class="timeline-header">
                      <span class="timeline-title">{thinkingLabels[item().node] ?? item().node}</span>
                    </div>
                  }
                >
                  <button
                    type="button"
                    class="timeline-header"
                    aria-expanded={expanded()}
                    aria-controls={id()}
                    onClick={() => props.onToggle(item().key)}
                  >
                    <span class="timeline-title">{thinkingLabels[item().node] ?? item().node}</span>
                    <span class="timeline-arrow" classList={{ expanded: expanded() }}>
                      <Icon name="chevron-down" class="size-[14px]" />
                    </span>
                  </button>
                </Show>
                <Show when={badge(item())}>
                  <div class="timeline-summary">
                    <span class="timeline-badge">{badge(item())}</span>
                    <Show when={item().node === "web_search"}>
                      <button type="button" class="timeline-link" onClick={() => props.onToggle(item().key)}>
                        查看详细来源
                      </button>
                    </Show>
                  </div>
                </Show>
                <Show when={expanded() && !thinkingCompletion(item().node)}>
                  <div class="timeline-detail" id={id()}>
                    <ThinkingDetails item={item()} />
                  </div>
                </Show>
              </div>
            </div>
          )
        }}
      </Index>
      <Show
        when={
          running() &&
          !hiddenThinkingNodes.has(props.activeNode) &&
          !items().some((item) => item.node === props.activeNode)
        }
      >
        <div class="timeline-item active-item">
          <div class="timeline-left">
            <div class="timeline-dot pulse" />
          </div>
          <div class="timeline-right">
            <span class="active-label">
              {thinkingLabels[props.activeNode] ? `${thinkingLabels[props.activeNode]}中...` : "正在研究..."}
            </span>
          </div>
        </div>
      </Show>
      <Show when={!items().length && !running()}>
        <div class="empty-state">
          <p>AI 思考过程将在这里显示</p>
        </div>
      </Show>
    </div>
  )
}

function ThinkingDetails(props: { item: ThinkingItem }) {
  const plan = () => stringList(props.item.payload.research_plan ?? outputData(props.item.payload).research_plan)
  const sources = () => array(props.item.payload.sources_gathered).map(object)
  const reflection = () => reflectionData(props.item.payload)
  const nextSteps = () => stringList(reflection().next_steps)
  const source = () => text(props.item.record?.source)
  const outline = createMemo(() => thinkingOutline(props.item.payload))
  return (
    <Switch
      fallback={
        <For each={array(props.item.payload.thinking_processes).map(object)}>
          {(process) => (
            <>
              <Show when={text(process.ai_thought)}>
                <div class="thinking-process">
                  <div class="thinking-process-label">AI思考</div>
                  <Markdown text={text(process.ai_thought)} />
                </div>
              </Show>
              <Show when={process.output_data !== undefined}>
                <pre>{JSON.stringify(process.output_data, null, 2)}</pre>
              </Show>
            </>
          )}
        </For>
      }
    >
      <Match when={props.item.kind === "plan"}>
        <Show when={plan().length}>
          <div class="detail-section">
            <h5>研究计划</h5>
            <For each={plan()}>
              {(line, index) => (
                <div class="plan-item">
                  <span class="plan-num">{index() + 1}</span>
                  <span class="plan-text">{line}</span>
                </div>
              )}
            </For>
          </div>
        </Show>
      </Match>
      <Match when={props.item.kind === "confirmation"}>
        <div class="detail-section">
          <h5>研究计划确认</h5>
          <Show when={text(props.item.payload.question) || text(props.item.payload.prompt)}>
            <p class="reflection-text">{text(props.item.payload.question) || text(props.item.payload.prompt)}</p>
          </Show>
          <Show when={text(props.item.payload.research_topic)}>
            <p class="reflection-text">研究主题：{text(props.item.payload.research_topic)}</p>
          </Show>
          <Show when={thinkingResume(props.item.record?.resume)}>
            <p class="reflection-text">确认内容：{thinkingResume(props.item.record?.resume)}</p>
          </Show>
          <Show when={source() === "auto" || source() === "manual"}>
            <p class="reflection-text">确认方式：{source() === "auto" ? "超时自动确认" : "手动确认"}</p>
          </Show>
        </div>
      </Match>
      <Match when={props.item.node === "web_search"}>
        <Show when={Array.isArray(props.item.payload.sources_gathered)}>
          <div class="detail-section">
            <h5>
              信息来源 <span class="count">共{sources().length}个来源</span>
            </h5>
            <div class="source-list">
              <For each={sources()}>
                {(entry, index) => (
                  <div class="source-item">
                    <span class="source-num">{index() + 1}</span>
                    <Show
                      when={thinkingSourceHref(entry.url)}
                      fallback={<span class="source-title">{text(entry.title)}</span>}
                    >
                      <a
                        class="source-title"
                        href={thinkingSourceHref(entry.url)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {text(entry.title)}
                      </a>
                    </Show>
                  </div>
                )}
              </For>
            </div>
          </div>
        </Show>
      </Match>
      <Match when={props.item.node === "reflection"}>
        <Show when={text(reflection().research_summary)}>
          <div class="detail-section">
            <h5>评估摘要</h5>
            <p class="reflection-text">{text(reflection().research_summary)}</p>
          </div>
        </Show>
        <Show when={text(reflection().gap_analysis)}>
          <div class="detail-section">
            <h5>知识缺口</h5>
            <p class="reflection-text">{text(reflection().gap_analysis)}</p>
          </div>
        </Show>
        <Show when={nextSteps().length}>
          <div class="detail-section">
            <h5>下轮规划</h5>
            <ul class="next-steps-list">
              <For each={nextSteps()}>{(line) => <li>{line}</li>}</For>
            </ul>
          </div>
        </Show>
      </Match>
      <Match when={props.item.node === "generate_outline" || props.item.node === "enhance_outline"}>
        <Show
          when={array(outline().data.sections).length}
          fallback={
            <Show when={outline().preview}>
              <div class="detail-section">
                <div class="outline-preview">{outline().preview}</div>
              </div>
            </Show>
          }
        >
          <div class="detail-section">
            <h5>
              {text(outline().data.title) || "报告大纲"}
              <Show
                when={
                  typeof outline().data.target_word_count === "number" && Number(outline().data.target_word_count) > 0
                }
              >
                <span class="count">目标 {Number(outline().data.target_word_count).toLocaleString()} 字</span>
              </Show>
            </h5>
            <div class="outline-section-list">
              <For each={array(outline().data.sections).map(object)}>
                {(section) => (
                  <div class="outline-section-row">
                    <Show when={section.section_number != null}>
                      <span class="outline-sec-num">{String(section.section_number)}</span>
                    </Show>
                    <span class="outline-sec-title">{text(section.section_title)}</span>
                    <Show when={typeof section.target_words === "number" && section.target_words > 0}>
                      <span class="outline-sec-words">{String(section.target_words)}字</span>
                    </Show>
                  </div>
                )}
              </For>
            </div>
          </div>
        </Show>
      </Match>
    </Switch>
  )
}
