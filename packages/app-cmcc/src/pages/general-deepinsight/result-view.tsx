import { createEffect, createMemo, For, Index, onCleanup, Show, untrack, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import { Icon } from "@opencode-ai/ui/icon"
import { Markdown } from "@opencode-ai/session-ui/markdown"
import { array, object, researchUsage, text, type JsonObject, type ResearchDetail } from "./model"
import { researchAssets, progressPhases, sectionAssets } from "./assets"
import {
  coverage,
  coverageStatus,
  latestPayload,
  outputData,
  phaseState,
  reflectionData,
  replayResearch,
  researchOutline,
  safetyData,
  stringList,
  reportNumber,
  referenceTime,
} from "./presentation"
import { ReportBody, VisualReport } from "./visual"
import { exportResearchWord } from "./export-word"
import { ThinkingTimeline } from "./thinking-view"
import { showToast } from "@/utils/toast"
import sendIcon from "@/assets/chat/send.svg"
import "./reference.css"
import "./result-view.css"

export function ResearchResultView(props: {
  detail: ResearchDetail
  elapsed: string
  busy: boolean
  readOnly: boolean
  small: boolean
  editor?: JSX.Element
  editing: boolean
  interrupt?: JSX.Element
  onNew: () => void
  onSame: () => void
  onStop: () => void
  onEdit: () => void
  onRewrite: () => void
  onMarkdown: () => void
  onPdf: () => void
  onHtml: () => void
}) {
  const [view, setView] = createStore({
    mode: "thinking",
    reportMode: "markdown",
    mobile: "content",
    outline: false,
    report: false,
    expanded: {} as Record<string, boolean>,
    replaying: false,
    progress: 0,
    replayStarted: 0,
    wordExporting: false,
  })
  let content!: HTMLDivElement
  let timeline!: HTMLDivElement
  let reportScroll!: HTMLDivElement
  let reportContent: HTMLDivElement | undefined
  let wordContent: HTMLDivElement | undefined
  let followContent = true
  let followTimeline = true
  let followReport = true
  let replayTimer: ReturnType<typeof setInterval> | undefined
  const stopReplay = () => {
    if (replayTimer) clearInterval(replayTimer)
    replayTimer = undefined
    setView("replaying", false)
  }
  const visible = createMemo(() => (view.replaying ? replayResearch(props.detail, view.progress) : props.detail))
  const data = () => visible().conversationData
  const steps = () => data().steps
  const running = () => visible().session.status === "running"
  const interrupted = () => visible().session.status === "interrupted"
  const completed = () => visible().session.status === "completed"
  const activeNode = () =>
    view.replaying
      ? props.detail.conversationData.steps[
          Math.floor(view.progress * (props.detail.conversationData.steps.length + 1))
        ]?.name
      : text(data().runningNode)
  const canReplay = () => props.detail.session.status === "completed" && !!props.detail.reportContent && !props.editing
  const query = () => visible().session.query
  const heading = () => (Array.from(query()).length > 20 ? Array.from(query()).slice(0, 20).join("") + "..." : query())
  const plan = () => latestPayload(data(), ["generate_query", "query_generation"])
  const recommendation = () => object(plan()?.word_count_reason)
  const outline = () => researchOutline(data())
  const safety = () => safetyData(data())
  const history = () => array(data().interruptHistory).map(object)
  const rounds = () => steps().filter((step) => step.name === "web_search" || step.name === "reflection")
  const labels: Record<string, string> = {
    safety_check: "安全性验证",
    sensitive_word_check: "安全性验证",
    intent_check: "意图分析",
    intent_analysis: "意图分析",
    inductive_check: "诱导性检测",
    file_extract: "文件解析",
    generate_query: "研究计划",
    query_generation: "研究计划",
    plan_draft_generation: "研究计划草拟",
    web_search: "网络搜索",
    reflection: "深度反思",
    continue_research: "继续研究",
    generate_outline: "生成大纲",
    enhance_outline: "完善大纲",
    finalize_answer: "报告撰写",
    viz_generation: "生成可视化内容",
    viz_post_process: "可视化报告",
  }
  const sessionKey = createMemo(() =>
    props.readOnly
      ? `case:${props.detail.caseInfo?.caseCode ?? props.detail.session.id}`
      : `session:${props.detail.session.id}`,
  )
  createEffect(() => {
    sessionKey()
    untrack(() => {
      stopReplay()
      setView({
        mode: props.detail.reportContent ? "report" : "thinking",
        reportMode: props.detail.conversationData.visualReport ? "visual" : "markdown",
        outline: false,
        report: false,
        expanded: {},
      })
    })
  })
  const reportStarted = createMemo(() => !!props.detail.reportContent && props.detail.session.status === "running")
  createEffect(() => {
    if (reportStarted() && !view.replaying) setView("mode", "report")
  })
  const follow = (container: HTMLDivElement | undefined, enabled: boolean) => {
    if (container && enabled) container.scrollTop = container.scrollHeight
  }
  createEffect(() => {
    steps().length
    visible().reportContent
    view.mode
    view.replaying
    queueMicrotask(() => {
      follow(content, followContent)
      if (view.mode === "thinking") follow(timeline, followTimeline)
      else if (running()) follow(reportScroll, followReport)
    })
  })
  const replay = () => {
    if (view.replaying) {
      stopReplay()
      return
    }
    if (!canReplay()) return
    setView({ replaying: true, progress: 0, replayStarted: Date.now(), mode: "thinking" })
    followContent = true
    followTimeline = true
    replayTimer = setInterval(() => {
      const progress = Math.min(1, (Date.now() - view.replayStarted) / 60000)
      setView("progress", progress)
      if (progress >= 1) {
        stopReplay()
        setView("mode", "report")
      }
    }, 100)
  }
  onCleanup(stopReplay)
  const exportWord = async () => {
    if (view.wordExporting) return
    setView("wordExporting", true)
    try {
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
      if (wordContent) exportResearchWord(wordContent, "research-report.doc")
    } catch (error) {
      showToast({ variant: "error", title: "Word 导出失败", description: String(error) })
    } finally {
      setView("wordExporting", false)
    }
  }
  const count = () => (view.replaying ? researchUsage(data()) : visible().session)
  const stats = () => [
    { icon: researchAssets.time, label: "思考时间", value: view.replaying ? "回放中" : referenceTime(props.elapsed) },
    { icon: researchAssets.token, label: "消耗token", value: reportNumber(count().tokenCount) },
    {
      icon: researchAssets.analysis,
      label: "深度分析",
      value: count().sourcesCount == null ? "--" : `${count().sourcesCount}个信息源`,
    },
    {
      icon: researchAssets.length,
      label: "报告篇幅",
      value:
        view.replaying || visible().session.reportLength == null
          ? "--"
          : `${reportNumber(visible().session.reportLength, true)}字`,
    },
  ]
  const section = (
    title: string,
    status: string | undefined,
    child: JSX.Element,
    extra?: { avatar?: boolean; expand?: () => void; expanded?: () => boolean; meta?: string; safe?: boolean },
  ) => (
    <>
      <div class="detect-header-row" classList={{ "detect-header-with-avatar": extra?.avatar }}>
        <Show when={extra?.avatar}>
          <img src={researchAssets.assistant} alt="灵犀" class="detect-avatar" />
        </Show>
        <img src={sectionAssets[title]} alt="" class="header-inline-icon" />
        <span class="detect-header-text">{title}</span>
        <Show when={status}>
          <span class="detect-header-sep">|</span>
          <span class="detect-header-status" classList={{ safe: extra?.safe, normal: !extra?.safe }}>
            {status}
          </span>
        </Show>
        <Show when={extra?.meta}>
          <span class="detect-header-sep">|</span>
          <span class="detect-header-status normal">{extra?.meta}</span>
        </Show>
        <Show when={extra?.expand}>
          <span class="detect-header-sep">|</span>
          <button type="button" class="detect-header-status normal expand-toggle" onClick={extra?.expand}>
            {extra?.expanded?.() ? "收起" : "展开"}
          </button>
          <button
            type="button"
            class="expand-arrow"
            classList={{ expanded: extra?.expanded?.() }}
            title={extra?.expanded?.() ? "收起" : "展开"}
            onClick={extra?.expand}
          >
            <Icon name="chevron-down" />
          </button>
        </Show>
      </div>
      {child}
    </>
  )
  const card = (body: JSX.Element, className = "") => (
    <div class={`detect-card card-with-margin ${className}`}>
      <div class="card-body">{body}</div>
    </div>
  )
  const sourceList = (payload: JsonObject) => (
    <>
      <Show when={array(payload.web_query_findings).length}>
        <div class="finding-section">
          <h5 class="section-label">
            查询发现 <span class="count">共{array(payload.web_query_findings).length}个查询</span>
          </h5>
          <For each={array(payload.web_query_findings).map(object)}>
            {(finding, index) => (
              <div class="finding-item">
                <div class="finding-num">{index() + 1}</div>
                <div class="finding-content">
                  <Show when={text(finding.query)}>
                    <div class="finding-query-row">
                      <span class="finding-query-label">搜索关键词：</span>
                      <span class="finding-query-keyword">{text(finding.query)}</span>
                    </div>
                  </Show>
                  <div class="finding-insight">{text(finding.insight) || stringList(finding.findings).join("\n")}</div>
                </div>
              </div>
            )}
          </For>
        </div>
      </Show>
      <Show when={array(payload.sources_gathered).length}>
        <div class="sources-section">
          <h5 class="section-label">
            来源链接 <span class="count">共{array(payload.sources_gathered).length}个来源</span>
          </h5>
          <div class="source-list">
            <For each={array(payload.sources_gathered).map(object)}>
              {(source) => (
                <a
                  href={/^https?:\/\//.test(text(source.url)) ? text(source.url) : undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="source-item"
                >
                  <span class="source-domain">{domain(text(source.url))}</span>
                  <span class="source-title">{text(source.title)}</span>
                </a>
              )}
            </For>
          </div>
        </div>
      </Show>
    </>
  )
  const discovery = (payload: JsonObject) => {
    const value = () => reflectionData(payload)
    const summary = () => coverage(value())
    return (
      <>
        <Show when={summary()}>
          {(summary) => (
            <div class="research-progress-block">
              <div class="research-progress-head">
                <span>整体进度</span>
                <strong>
                  {summary().covered}/{summary().total} 步骤
                </strong>
              </div>
              <div class="research-progress-track">
                <div class="research-progress-fill" style={{ width: `${summary().percent}%` }} />
              </div>
              <Show when={summary().full !== undefined}>
                <div class="research-progress-meta">
                  <span>充分覆盖 {summary().full}</span>
                  <span>部分覆盖 {summary().partial}</span>
                  <span>未覆盖 {summary().uncovered}</span>
                  <Show when={summary().unknown}>
                    <span>状态未知 {summary().unknown}</span>
                  </Show>
                </div>
              </Show>
            </div>
          )}
        </Show>
        <Show when={array(value().step_coverage_analysis).length}>
          <div class="reflection-section">
            <div class="research-section-title">
              <span class="research-section-icon">✣</span>
              <span>步骤覆盖详情</span>
              <span class="count">共{array(value().step_coverage_analysis).length}个步骤</span>
            </div>
            <div class="coverage-step-list">
              <For each={array(value().step_coverage_analysis).map(object)}>
                {(row) => (
                  <div class={`coverage-step-item status-${coverageStatus(row.coverage_status)}`}>
                    <div class="coverage-step-marker">{String(row.step_number ?? "?")}</div>
                    <div class="coverage-step-content">
                      <div class="coverage-step-head">
                        <span class="coverage-status-chip">{text(row.coverage_status).trim() || "状态未知"}</span>
                        <span class="coverage-step-title">{text(row.step_content)}</span>
                      </div>
                      <Show when={text(row.coverage_details)}>
                        <div class="coverage-step-desc">{text(row.coverage_details)}</div>
                      </Show>
                      <Show when={text(row.required_info)}>
                        <div class="coverage-step-desc pending">待补充：{text(row.required_info)}</div>
                      </Show>
                    </div>
                  </div>
                )}
              </For>
            </div>
          </div>
        </Show>
        <Show when={summary()?.uncoveredSteps.length}>
          <div class="research-info-section">
            <div class="research-section-title">
              <span class="research-section-icon danger">×</span>
              <span>未覆盖步骤</span>
              <span class="count">共 {summary()!.uncoveredSteps.length} 步</span>
            </div>
            <div class="uncovered-step-chips">
              <For each={summary()!.uncoveredSteps}>{(step) => <span>步骤 {step}</span>}</For>
            </div>
          </div>
        </Show>
        <For
          each={[
            { key: "knowledge_gaps_list", title: "知识缺口", icon: "缺" },
            { key: "next_steps", title: "后续查询建议", icon: "问" },
          ]}
        >
          {(entry) => (
            <Show when={stringList(value()[entry.key]).length}>
              <div class="research-info-section">
                <div class="research-section-title">
                  <span class="research-section-icon">{entry.icon}</span>
                  <span>{entry.title}</span>
                </div>
                <ul class="research-list">
                  <For each={stringList(value()[entry.key])}>{(line) => <li>{line}</li>}</For>
                </ul>
              </div>
            </Show>
          )}
        </For>
        <Show when={text(value().round_assessment) || typeof value().confidence_level === "number"}>
          <div class="research-info-section">
            <div class="research-section-title">
              <span class="research-section-icon">评</span>
              <span>本轮评估</span>
              <Show when={typeof value().confidence_level === "number"}>
                <span class="confidence-pill">置信度 {String(value().confidence_level)}/10</span>
              </Show>
            </div>
            <Show when={typeof value().confidence_level === "number"}>
              <div class="confidence-track">
                <span style={{ width: `${Math.max(0, Math.min(100, Number(value().confidence_level) * 10))}%` }} />
              </div>
            </Show>
            <p class="research-paragraph">{text(value().round_assessment)}</p>
          </div>
        </Show>
        <For
          each={[
            { key: "research_summary", title: "研究总结", icon: "总" },
            { key: "gap_analysis", title: "缺口分析", icon: "析" },
          ]}
        >
          {(entry) => (
            <Show when={text(value()[entry.key])}>
              <div class="research-info-section">
                <div class="research-section-title">
                  <span class="research-section-icon">{entry.icon}</span>
                  <span>{entry.title}</span>
                </div>
                <p class="research-paragraph">{text(value()[entry.key])}</p>
              </div>
            </Show>
          )}
        </For>
      </>
    )
  }
  const outlineBody = () => (
    <Show
      when={array(outline().sections).length}
      fallback={
        <Markdown
          text={
            text(latestPayload(data(), ["generate_outline", "enhance_outline"])?.outline) ||
            text(
              object(array(latestPayload(data(), ["generate_outline", "enhance_outline"])?.thinking_processes)[0])
                .pretty_output,
            )
          }
          class="markdown-body"
        />
      }
    >
      <Show when={typeof outline().target_word_count === "number"}>
        <div class="outline-meta">
          <span class="outline-target-count">目标字数：{String(outline().target_word_count)}字</span>
        </div>
      </Show>
      <div class="outline-sections">
        <For each={array(outline().sections).map(object)}>
          {(item) => (
            <div class="outline-section-block">
              <div class="outline-section-header">
                <span class="outline-sec-num">{text(item.section_number)}</span>
                <span class="outline-sec-title">{text(item.section_title)}</span>
                <Show when={typeof item.target_words === "number"}>
                  <span class="outline-sec-words">{String(item.target_words)}字</span>
                </Show>
              </div>
              <div class="outline-subsections">
                <For each={array(item.subsections).map(object)}>
                  {(sub) => (
                    <div class="outline-sub-block">
                      <div class="outline-sub-header">
                        <span class="outline-sub-num">{text(sub.subsection_number)}</span>
                        <span class="outline-sub-title">{text(sub.subsection_title)}</span>
                        <Show when={typeof sub.target_words === "number"}>
                          <span class="outline-sub-words">{String(sub.target_words)}字</span>
                        </Show>
                      </div>
                    </div>
                  )}
                </For>
              </div>
              <Show when={text(item.draft_content)}>
                <div class="outline-sec-content">
                  <p>{text(item.draft_content)}</p>
                </div>
              </Show>
            </div>
          )}
        </For>
      </div>
    </Show>
  )
  const left = () => (
    <div class="left-panel">
      <div class="query-header">
        <span class="query-header-title">{heading()}</span>
      </div>
      <div class="thinking-header">
        <div class="step-progress">
          <For each={progressPhases}>
            {(phase, index) => {
              const status = () => phaseState(steps(), phase.nodes, activeNode())
              return (
                <>
                  <div
                    class="step-item"
                    classList={{ active: status() === "active", completed: status() === "completed" }}
                  >
                    <div class="step-icon-wrap">
                      <img src={phase.icon} alt={phase.label} />
                    </div>
                    <div class="step-text">
                      <span class="step-label">{phase.label}</span>
                      <Show when={status() !== "waiting"}>
                        <img
                          src={status() === "active" ? researchAssets.loading : researchAssets.done}
                          alt={status() === "active" ? "执行中" : "完成"}
                          class="step-status-icon"
                          classList={{ spinning: status() === "active" }}
                        />
                      </Show>
                    </div>
                  </div>
                  <Show when={index() < progressPhases.length - 1}>
                    <div class="step-connector">
                      <img
                        src={status() === "completed" ? researchAssets.lineDone : researchAssets.lineLoading}
                        alt=""
                      />
                    </div>
                  </Show>
                </>
              )
            }}
          </For>
        </div>
      </div>
      <div
        class="main-content"
        ref={content}
        onScroll={() => (followContent = content.scrollHeight - content.scrollTop - content.clientHeight < 80)}
        onWheel={(event) => {
          if (event.deltaY < 0) followContent = false
        }}
      >
        <div class="content-flow">
          <div class="user-question">
            <div class="question-bubble">{query()}</div>
            <div class="user-avatar">
              <img src={researchAssets.user} alt="用户" />
            </div>
          </div>
          <Show when={safety()}>
            {(value) => (
              <div class="detect-unified-card">
                <div class="detect-header-row detect-header-with-avatar">
                  <img src={researchAssets.assistant} alt="灵犀" class="detect-avatar" />
                  <span class="detect-header-text">⚠ 安全性验证</span>
                  <span class="detect-header-sep">|</span>
                  <span
                    class="detect-header-status"
                    classList={{ safe: value().safe === true, danger: value().safe === false }}
                  >
                    {value().safe === true ? "验证通过" : value().safe === false ? "已拦截" : "状态未知"}
                  </span>
                </div>
                <div class="detect-white-card">
                  <div class="detect-row">
                    <span class="label">验证结果</span>
                    <span
                      class="value value-right"
                      classList={{ safe: value().safe === true, danger: value().safe === false }}
                    >
                      {value().safe === true ? "内容安全" : value().safe === false ? "未通过" : "--"}
                    </span>
                  </div>
                  <div class="detect-divider" />
                  <div class="detect-row">
                    <span class="label">拦截类型</span>
                    <span class="value value-right">{safetyType(text(value().type))}</span>
                  </div>
                  <div class="detect-divider" />
                  <div class="detect-row">
                    <span class="label">拦截原因</span>
                    <span class="value">{text(value().reason) || (value().safe === true ? "无" : "--")}</span>
                  </div>
                </div>
              </div>
            )}
          </Show>
          <Show when={typeof recommendation().word_count === "number"}>
            {section(
              "字数推荐",
              "建议字数",
              <div class="word-count-card card-with-margin">
                <div class="word-count-header">
                  <span class="word-count-label">建议字数</span>
                  <span class="word-count-value">{Number(recommendation().word_count).toLocaleString()}字</span>
                </div>
                <Show when={text(recommendation().reason)}>
                  <div class="word-count-divider" />
                  <p class="word-count-reason">{text(recommendation().reason)}</p>
                </Show>
              </div>,
            )}
          </Show>
          <Show when={!view.replaying && (running() || interrupted()) && data().pendingInterrupt && !props.readOnly}>
            {section("研究计划确认", interrupted() ? "等待确认" : "等待任务暂停", props.interrupt, { avatar: true })}
          </Show>
          <For each={history()}>
            {(entry) =>
              section(
                "研究计划确认",
                "已确认",
                <>
                  {card(
                    <div class="plan-list">
                      <For each={stringList(object(entry.resume).research_plan ?? object(entry.payload).research_plan)}>
                        {(item, index) => (
                          <div class="plan-item">
                            <span class="plan-num">{index() + 1}</span>
                            <span class="plan-text">{item}</span>
                          </div>
                        )}
                      </For>
                    </div>,
                    "plan-confirmation-history-card",
                  )}
                  <div class="plan-confirmation-reply">
                    <div class="reply-bubble">{confirmation(entry.resume)}</div>
                    <div class="reply-avatar">
                      <img src={researchAssets.user} alt="用户" />
                    </div>
                  </div>
                </>,
                { avatar: true },
              )
            }
          </For>
          <Show when={stringList(plan()?.research_plan).length}>
            {section(
              "研究计划",
              `共${stringList(plan()?.research_plan).length}个步骤`,
              card(
                <div class="plan-list">
                  <For each={stringList(plan()?.research_plan)}>
                    {(item, index) => (
                      <div class="plan-item">
                        <span class="plan-num">{index() + 1}</span>
                        <span class="plan-text">{item}</span>
                      </div>
                    )}
                  </For>
                </div>,
              ),
            )}
          </Show>
          <Show when={stringList(plan()?.pending_queries).length}>
            {section(
              "网络搜索",
              `共${stringList(plan()?.pending_queries).length}个查询`,
              card(
                <div class="query-tags">
                  <For each={stringList(plan()?.pending_queries)}>
                    {(item) => <span class="query-tag">{item}</span>}
                  </For>
                </div>,
              ),
            )}
          </Show>
          <For each={rounds()}>
            {(step) =>
              step.name === "web_search"
                ? section(
                    "搜索结果",
                    Array.isArray(step.payload.sources_gathered)
                      ? `${array(step.payload.sources_gathered).length}个来源`
                      : undefined,
                    card(sourceList(step.payload)),
                  )
                : section(
                    "研究发现",
                    step.payload.round_completed === true ? "已完成" : "进行中",
                    card(discovery(step.payload), "research-discovery-card"),
                    {
                      safe: step.payload.round_completed === true,
                      get meta() {
                        const summary = coverage(reflectionData(step.payload))
                        return summary ? `研究计划已覆盖 ${summary.covered}/${summary.total}` : undefined
                      },
                    },
                  )
            }
          </For>
          <Show when={latestPayload(data(), ["generate_outline", "enhance_outline"])}>
            {section("生成大纲", undefined, <Show when={view.outline}>{card(outlineBody())}</Show>, {
              expand: () => setView("outline", !view.outline),
              expanded: () => view.outline,
            })}
          </Show>
          <Show when={visible().reportContent}>
            {section(
              "撰写报告",
              undefined,
              <Show when={view.report}>
                {card(<ReportBody content={visible().reportContent} data={data()} streaming={running()} />)}
              </Show>,
              { expand: () => setView("report", !view.report), expanded: () => view.report },
            )}
          </Show>
          <Show when={completed()}>
            <div class="detect-header-row detect-header-with-avatar">
              <img src={researchAssets.assistant} alt="灵犀" class="detect-avatar" />
              <div class="chat-bubble">
                <img src={sectionAssets["任务执行完成"]} alt="" class="header-inline-icon" />
                <span class="detect-header-text">任务执行完成</span>
              </div>
            </div>
          </Show>
        </div>
      </div>
      <div class="chat-input-container">
        <Show
          when={!props.readOnly && !view.replaying && (running() || (interrupted() && !!data().pendingInterrupt))}
          fallback={
            <Show when={!view.replaying}>
              <div class="session-ended-bar" onClick={props.onNew}>
                <span>当前会话已结束，可点创建任务开始新的会话。</span>
                <button class="new-btn" title="创建新任务" onClick={props.onNew}>
                  <img src={sendIcon} width="14" height="14" alt="" />
                </button>
              </div>
            </Show>
          }
        >
          <Show
            when={data().pendingInterrupt}
            fallback={
              <div class="executing-bar">
                <span class="exec-text">正在执行任务中...</span>
                <div class="exec-right">
                  <span class="exec-smiley">◌</span>
                  <button class="stop-btn-link" disabled={props.busy} onClick={props.onStop}>
                    停止执行
                  </button>
                </div>
              </div>
            }
          >
            <div class="plan-confirm-waiting-bar">
              <span>请在上方确认研究计划后继续执行</span>
              <button class="stop-btn-link" disabled={props.busy} onClick={props.onStop}>
                停止执行
              </button>
            </div>
          </Show>
        </Show>
      </div>
    </div>
  )
  const right = () => (
    <div class="right-panel">
      <div class="panel-header">
        <span class="header-title">AI思考过程</span>
        <div class="header-actions">
          <Show
            when={view.mode === "thinking"}
            fallback={
              <>
                <Show when={!props.editing && props.detail.reportContent && !view.replaying}>
                  <button class="view-btn" onClick={props.onMarkdown}>
                    导出Markdown
                  </button>
                  <Show when={!props.readOnly && completed()}>
                    <button class="view-btn" disabled={props.busy} onClick={props.onPdf}>
                      导出 PDF
                    </button>
                    <Show when={data().visualReport}>
                      <button class="view-btn" disabled={props.busy} onClick={props.onHtml}>
                        导出 HTML
                      </button>
                    </Show>
                  </Show>
                  <button
                    class="view-btn"
                    disabled={props.busy}
                    onClick={() => {
                      void exportWord()
                    }}
                  >
                    导出 Word
                  </button>
                </Show>
                <button class="view-btn secondary" onClick={() => setView("mode", "thinking")}>
                  查看思考过程
                </button>
              </>
            }
          >
            <button
              class="view-btn"
              onClick={() => {
                followReport = false
                setView("mode", "report")
              }}
            >
              <Icon name="review" />
              查看报告
            </button>
          </Show>
        </div>
      </div>
      <div class="stats-row">
        <Index each={stats()}>
          {(stat) => (
            <div class="stat-card">
              <img src={stat().icon} alt={stat().label} class="stat-icon" />
              <div class="stat-content">
                <div class="stat-label">{stat().label}</div>
                <div class="stat-value">{stat().value}</div>
              </div>
            </div>
          )}
        </Index>
      </div>
      <Show
        when={view.mode === "thinking"}
        fallback={
          <div
            class="report-view"
            ref={reportScroll}
            onScroll={() =>
              (followReport = reportScroll.scrollHeight - reportScroll.scrollTop - reportScroll.clientHeight < 80)
            }
            onWheel={(event) => {
              if (event.deltaY < 0) followReport = false
            }}
          >
            <Show when={!props.editing} fallback={props.editor}>
              <Show when={data().visualReport}>
                <div class="report-tabs" role="tablist">
                  <button
                    role="tab"
                    aria-selected={view.reportMode === "markdown"}
                    classList={{ active: view.reportMode === "markdown" }}
                    onClick={() => setView("reportMode", "markdown")}
                  >
                    文字报告
                  </button>
                  <button
                    role="tab"
                    aria-selected={view.reportMode === "visual"}
                    classList={{ active: view.reportMode === "visual" }}
                    onClick={() => setView("reportMode", "visual")}
                  >
                    可视化报告
                  </button>
                </div>
              </Show>
              <Show
                when={view.reportMode === "visual" && data().visualReport}
                fallback={
                  <div class="report-document-shell" ref={(element) => (reportContent = element)}>
                    <Show when={completed() && !props.readOnly && !view.replaying}>
                      <button class="report-edit-control" onClick={props.onEdit}>
                        修改文章
                      </button>
                      <button class="gd-rewrite-control" onClick={props.onRewrite}>
                        文字重写
                      </button>
                    </Show>
                    <Show
                      when={visible().reportContent}
                      fallback={
                        <div class="empty-state">
                          <p>暂无文字报告</p>
                        </div>
                      }
                    >
                      <div
                        class="report-content markdown-body"
                        classList={{ "has-report-edit-control": completed() && !props.readOnly }}
                      >
                        <ReportBody content={visible().reportContent} data={data()} streaming={running()} />
                      </div>
                    </Show>
                  </div>
                }
              >
                <div ref={(element) => (reportContent = element)}>
                  <VisualReport data={data()} />
                </div>
              </Show>
            </Show>
          </div>
        }
      >
        <div
          class="timeline-container"
          ref={timeline}
          onScroll={() => (followTimeline = timeline.scrollHeight - timeline.scrollTop - timeline.clientHeight < 80)}
          onWheel={(event) => {
            if (event.deltaY < 0) followTimeline = false
          }}
        >
          <ThinkingTimeline
            sessionId={props.detail.session.id}
            data={data()}
            status={visible().session.status}
            replaying={view.replaying}
            activeNode={activeNode() ?? ""}
            expanded={view.expanded}
            onToggle={(key) => setView("expanded", key, !view.expanded[key])}
          />
        </div>
      </Show>
      <Show when={!props.editing && (view.mode === "report" || view.replaying) && canReplay()}>
        <div class="replay-floating-bar">
          <div class="replay-brand">
            <span class="replay-logo">深</span>
            <span>深度洞察</span>
          </div>
          <Show when={view.replaying}>
            <div class="replay-status">
              <span>{labels[activeNode()!] ?? "正在回放"}</span>
              <div class="replay-progress-track">
                <span style={{ width: `${Math.round(view.progress * 100)}%` }} />
              </div>
            </div>
          </Show>
          <button class="replay-btn" classList={{ active: view.replaying }} onClick={replay}>
            {view.replaying ? "停止回放" : "看回放"}
          </button>
          <button class="replay-btn" onClick={props.onSame}>
            做同款
          </button>
        </div>
      </Show>
    </div>
  )
  return (
    <div
      class="general-research-result"
      data-status={props.detail.session.status}
      data-read-only={props.readOnly ? "" : undefined}
    >
      <Show when={view.wordExporting}>
        <div class="gd-word-export" ref={(element) => (wordContent = element)}>
          <ReportBody content={props.detail.reportContent} data={props.detail.conversationData} />
        </div>
      </Show>
      <Show when={props.small}>
        <div class="gd-mobile-tabs">
          <button aria-pressed={view.mobile === "content"} onClick={() => setView("mobile", "content")}>
            研究内容
          </button>
          <button aria-pressed={view.mobile === "results"} onClick={() => setView("mobile", "results")}>
            研究结果
          </button>
        </div>
      </Show>
      <div class="main-area">
        <Show when={!props.small || view.mobile === "content"}>{left()}</Show>
        <Show when={!props.small || view.mobile === "results"}>{right()}</Show>
      </div>
    </div>
  )
}

function domain(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "")
  } catch {
    return value
  }
}
function safetyType(value: string) {
  return (
    (
      {
        none: "无",
        safety: "内容安全不合规",
        scope: "超出产品服务范围",
        inductive: "诱导性越狱攻击",
        blacklist: "黑名单拦截",
        llm_error: "模型检测异常",
      } as Record<string, string>
    )[value] ??
    (value || "--")
  )
}
function confirmation(value: unknown) {
  if (typeof value === "string") return value
  const row = object(value)
  return row.action === "confirm"
    ? "确认执行"
    : row.action === "confirm_with_edits"
      ? "已手动编辑计划"
      : text(row.modification) || "已确认"
}
