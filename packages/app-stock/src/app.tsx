import { createEffect, createMemo, For, onCleanup, onMount, Show, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import type {
  ApiErrorResponse,
  BacktestRequest,
  BacktestResponse,
  CancelChatResponse,
  ChatResponse,
  HealthResponse,
  ModelOption,
  ModelsResponse,
  StrategyArtifact,
} from "./lib/contracts"
import { renderMarkdown } from "./lib/markdown"

const storedModelKey = "alphalab.stock.model"

type ChatMessage = {
  role: "assistant" | "user"
  content: string
  artifact?: StrategyArtifact
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

function defaultDates() {
  const end = new Date()
  const start = new Date(end)
  start.setFullYear(start.getFullYear() - 3)
  return { startDate: isoDate(start), endDate: isoDate(end) }
}

function readStoredModel() {
  try {
    return window.localStorage.getItem(storedModelKey) ?? undefined
  } catch {
    return undefined
  }
}

const initialForm: BacktestRequest = {
  provider: "tushare",
  symbol: "600519",
  ...defaultDates(),
  fastWindow: 20,
  slowWindow: 60,
  initialCash: 100_000,
  commissionRate: 0.0003,
  minimumCommission: 5,
  stampDutyRate: 0.0005,
  slippageBps: 5,
  lotSize: 100,
}

export function App() {
  const embedded = typeof window === "object" && new URLSearchParams(window.location.search).get("embed") === "1"
  const [form, setForm] = createStore<BacktestRequest>(initialForm)
  const [view, setView] = createStore<{
    loading: boolean
    error?: string
    report?: BacktestResponse
    reportInput?: BacktestRequest
    health?: HealthResponse
    healthUnavailable?: boolean
  }>({ loading: false })
  const [chat, setChat] = createStore<{
    input: string
    sending: boolean
    error?: string
    notice?: string
    sessionId?: string
    activeRequestId?: string
    elapsedSeconds: number
    messages: ChatMessage[]
    models: ModelOption[]
    modelsLoading: boolean
    modelId?: string
    modelError?: string
  }>({
    input: "",
    sending: false,
    elapsedSeconds: 0,
    models: [],
    modelsLoading: true,
    messages: [
      {
        role: "assistant",
        content: "告诉我你的策略规则，或先运行左侧回测。我会结合本次参数和结果继续分析。",
      },
    ],
  })
  let chatController: AbortController | undefined
  let messagesElement: HTMLDivElement | undefined

  onMount(() => {
    void request<HealthResponse>("/api/health")
      .then((health) => setView({ health, healthUnavailable: false }))
      .catch(() => setView("healthUnavailable", true))
    void request<ModelsResponse>("/api/models")
      .then((response) => {
        const stored = readStoredModel()
        const modelId = response.models.some((model) => model.id === stored) ? stored : response.defaultModelId
        setChat({ models: response.models, modelsLoading: false, modelId, modelError: undefined })
      })
      .catch(() => setChat({ modelsLoading: false, modelError: "模型列表暂不可用，将使用默认模型" }))
  })

  createEffect(() => {
    if (!chat.sending) return
    const startedAt = Date.now()
    const timer = window.setInterval(
      () => setChat("elapsedSeconds", Math.floor((Date.now() - startedAt) / 1_000)),
      1_000,
    )
    onCleanup(() => window.clearInterval(timer))
  })

  createEffect(() => {
    chat.messages.length
    chat.sending
    queueMicrotask(() => messagesElement?.scrollTo({ top: messagesElement.scrollHeight, behavior: "smooth" }))
  })

  const reportStale = createMemo(() =>
    Boolean(view.reportInput && backtestRequestKey(view.reportInput) !== backtestRequestKey(form)),
  )

  const runBacktest = async (event: SubmitEvent) => {
    event.preventDefault()
    const submittedInput = { ...form }
    setView({ loading: true, error: undefined })
    await request<BacktestResponse>("/api/backtest", submittedInput)
      .then((report) => setView({ report, reportInput: submittedInput, loading: false, error: undefined }))
      .catch((error) => setView({ loading: false, error: errorMessage(error) }))
  }

  const ask = async (event: SubmitEvent) => {
    event.preventDefault()
    const message = chat.input.trim()
    if (!message || chat.sending) return
    const requestId = crypto.randomUUID()
    const model = chat.models.find((item) => item.id === chat.modelId)
    chatController = new AbortController()
    setChat("messages", chat.messages.length, { role: "user", content: message })
    setChat({
      input: "",
      sending: true,
      error: undefined,
      notice: undefined,
      activeRequestId: requestId,
      elapsedSeconds: 0,
    })
    await request<ChatResponse>(
      "/api/chat",
      {
        message,
        sessionId: chat.sessionId,
        requestId,
        model: model ? { providerID: model.providerID, modelID: model.modelID } : undefined,
        strategyContext: strategyContext(form, view.report, view.reportInput, reportStale()),
      },
      chatController.signal,
    )
      .then((response) => {
        if (chat.activeRequestId !== requestId) return
        setChat("sessionId", response.sessionId)
        setChat("messages", chat.messages.length, {
          role: "assistant",
          content: response.answer,
          artifact: response.artifact,
        })
        setChat({ sending: false, activeRequestId: undefined })
      })
      .catch((error) => {
        if (chat.activeRequestId !== requestId || (error instanceof DOMException && error.name === "AbortError")) return
        setChat({ sending: false, activeRequestId: undefined, error: errorMessage(error) })
      })
  }

  const cancelChat = () => {
    const requestId = chat.activeRequestId
    if (!requestId) return
    chatController?.abort()
    setChat({
      sending: false,
      activeRequestId: undefined,
      sessionId: chat.sessionId ?? requestId,
      notice: "已停止本次分析，你可以调整区间后继续。",
    })
    void request<CancelChatResponse>("/api/chat/cancel", { requestId }).catch(() => {})
  }

  const applyPreset = (fastWindow: number, slowWindow: number) => {
    setForm({ fastWindow, slowWindow })
  }

  const selectModel = (modelId: string) => {
    setChat({ modelId, notice: undefined })
    window.localStorage.setItem(storedModelKey, modelId)
  }

  const newChat = () => {
    if (chat.sending) cancelChat()
    setChat({
      input: "",
      sending: false,
      error: undefined,
      notice: undefined,
      sessionId: undefined,
      activeRequestId: undefined,
      elapsedSeconds: 0,
      messages: [
        {
          role: "assistant",
          content: "新研究会话已就绪。你可以继续追问当前回测，或描述另一套策略规则。",
        },
      ],
    })
  }

  return (
    <div class="shell" classList={{ embedded }}>
      <header class="topbar">
        <a class="brand" href="/" aria-label="AlphaLab AI 首页">
          <span class="brand-mark">A</span>
          <span>
            <strong>AlphaLab</strong>
            <small>AI 策略实验室</small>
          </span>
        </a>
        <div class="status-row">
          <StatusDot ready={view.health?.providers.baostock || view.health?.providers.akshare} label="免费 A 股数据" />
          <StatusDot ready={view.health?.providers.alphaVantage} label="美股数据" />
          <StatusDot ready={view.health?.opencode.configured} label="AI 服务" />
          <Show when={view.healthUnavailable}>
            <span class="health-warning">状态服务不可用</span>
          </Show>
        </div>
        <span class="research-badge">研究环境 · 非实盘</span>
      </header>

      <main class="workspace">
        <section class="intro">
          <div>
            <p class="eyebrow">STRATEGY WORKBENCH</p>
            <h1>把投资想法，变成可验证的策略。</h1>
            <p>用真实历史行情回测规则，再让 AI 解释收益来自哪里、风险藏在哪里、下一轮应该验证什么。</p>
          </div>
          <div class="intro-note">
            <span>当前能力</span>
            <strong>单标的双均线 · 沪深300 EPS 选股</strong>
            <small>BaoStock 主数据、AKShare 补充；支持点时财报与月度组合调仓</small>
          </div>
        </section>

        <div class="product-grid">
          <aside class="strategy-panel panel">
            <div class="panel-heading">
              <div>
                <span class="step">01</span>
                <h2>定义策略</h2>
              </div>
              <span class="muted">SMA CROSS</span>
            </div>

            <form onSubmit={runBacktest}>
              <Field label="市场与数据源">
                <select
                  value={form.provider}
                  onChange={(event) => {
                    const provider = event.currentTarget.value as BacktestRequest["provider"]
                    setForm({
                      provider,
                      symbol: provider === "tushare" ? "600519" : "AAPL",
                      lotSize: provider === "tushare" ? 100 : 1,
                    })
                  }}
                >
                  <option value="tushare">A 股 · Tushare</option>
                  <option value="alpha_vantage">美股 · Alpha Vantage</option>
                </select>
              </Field>

              <Field label="股票代码">
                <input
                  value={form.symbol}
                  onInput={(event) => setForm("symbol", event.currentTarget.value)}
                  placeholder={form.provider === "tushare" ? "例如 600519" : "例如 AAPL"}
                  spellcheck={false}
                />
              </Field>

              <div class="field-pair">
                <Field label="开始日期">
                  <input
                    type="date"
                    value={form.startDate}
                    onInput={(event) => setForm("startDate", event.currentTarget.value)}
                  />
                </Field>
                <Field label="结束日期">
                  <input
                    type="date"
                    value={form.endDate}
                    onInput={(event) => setForm("endDate", event.currentTarget.value)}
                  />
                </Field>
              </div>

              <div class="preset-row">
                <span>策略参数</span>
                <button type="button" onClick={() => applyPreset(5, 20)}>
                  5 / 20
                </button>
                <button type="button" onClick={() => applyPreset(10, 30)}>
                  10 / 30
                </button>
                <button type="button" onClick={() => applyPreset(20, 60)}>
                  20 / 60
                </button>
              </div>

              <div class="field-pair">
                <Field label="短期均线">
                  <NumberInput value={form.fastWindow} update={(value) => setForm("fastWindow", value)} />
                </Field>
                <Field label="长期均线">
                  <NumberInput value={form.slowWindow} update={(value) => setForm("slowWindow", value)} />
                </Field>
              </div>

              <Field label={`初始资金（${currencyFor(form.provider)}）`}>
                <NumberInput value={form.initialCash} update={(value) => setForm("initialCash", value)} step={10_000} />
              </Field>

              <details>
                <summary>交易成本与执行假设</summary>
                <div class="assumption-fields">
                  <Field label="佣金率">
                    <NumberInput
                      value={form.commissionRate}
                      update={(value) => setForm("commissionRate", value)}
                      step={0.0001}
                    />
                  </Field>
                  <Field label="最低佣金">
                    <NumberInput
                      value={form.minimumCommission}
                      update={(value) => setForm("minimumCommission", value)}
                    />
                  </Field>
                  <Field label="卖出印花税">
                    <NumberInput
                      value={form.stampDutyRate}
                      update={(value) => setForm("stampDutyRate", value)}
                      step={0.0001}
                    />
                  </Field>
                  <Field label="滑点（bps）">
                    <NumberInput value={form.slippageBps} update={(value) => setForm("slippageBps", value)} />
                  </Field>
                  <Field label="交易单位">
                    <NumberInput value={form.lotSize} update={(value) => setForm("lotSize", value)} />
                  </Field>
                </div>
              </details>

              <Show when={view.error}>
                <div class="error-box">{view.error}</div>
              </Show>

              <button class="primary-button" type="submit" disabled={view.loading}>
                <Show when={!view.loading} fallback="正在获取行情并计算…">
                  运行策略回测 <span>→</span>
                </Show>
              </button>
            </form>
          </aside>

          <aside class="ai-panel panel">
            <div class="panel-heading ai-heading">
              <div>
                <span class="ai-orb">AI</span>
                <div>
                  <h2>策略研究助手</h2>
                  <small>由 OpenCode 驱动</small>
                </div>
              </div>
              <div class="ai-heading-actions">
                <label class="model-picker" title={chat.modelError ?? "仅显示已连接且支持工具调用的模型"}>
                  <span>模型</span>
                  <select
                    value={chat.modelId ?? ""}
                    disabled={chat.sending || chat.modelsLoading || chat.models.length === 0}
                    onChange={(event) => selectModel(event.currentTarget.value)}
                    aria-label="选择 AI 模型"
                  >
                    <Show
                      when={chat.models.length > 0}
                      fallback={<option value="">{chat.modelsLoading ? "加载中…" : "使用默认模型"}</option>}
                    >
                      <For each={chat.models}>
                        {(model) => (
                          <option value={model.id}>
                            {model.providerName} · {model.name} · {model.free ? "免费" : "可能计费"}
                          </option>
                        )}
                      </For>
                    </Show>
                  </select>
                </label>
                <button
                  type="button"
                  class="session-state"
                  classList={{ stop: chat.sending }}
                  onClick={() => (chat.sending ? cancelChat() : newChat())}
                >
                  {chat.sending ? "停止" : chat.sessionId ? "新建会话" : "新会话"}
                </button>
              </div>
            </div>

            <div class="quick-prompts">
              <For each={["这个策略最大的风险是什么？", "该怎么做样本外验证？", "帮我设计参数敏感性测试"]}>
                {(prompt) => (
                  <button type="button" onClick={() => setChat("input", prompt)}>
                    {prompt}
                  </button>
                )}
              </For>
            </div>

            <div class="messages" aria-live="polite" ref={messagesElement}>
              <For each={chat.messages}>
                {(message) => (
                  <article
                    classList={{
                      message: true,
                      user: message.role === "user",
                      assistant: message.role === "assistant",
                    }}
                  >
                    <span>{message.role === "assistant" ? "AI" : "你"}</span>
                    <div class="message-body">
                      <div class="markdown-body" innerHTML={renderMarkdown(message.content)} />
                      <Show when={message.artifact}>
                        {(artifact) => <StrategyArtifactCard artifact={artifact()} />}
                      </Show>
                    </div>
                  </article>
                )}
              </For>
              <Show when={chat.sending}>
                <article class="message assistant pending">
                  <span>AI</span>
                  <p>
                    <strong>{chatProgressText(chat.elapsedSeconds)}</strong>
                    <small>已等待 {formatElapsed(chat.elapsedSeconds)} · 首次构建免费数据缓存可能需要几分钟</small>
                  </p>
                </article>
              </Show>
            </div>

            <Show when={chat.error}>
              <div class="chat-error">{chat.error}</div>
            </Show>
            <Show when={chat.notice}>
              <div class="chat-notice">{chat.notice}</div>
            </Show>
            <form class="chat-form" onSubmit={ask}>
              <textarea
                value={chat.input}
                onInput={(event) => setChat("input", event.currentTarget.value)}
                placeholder="描述你的策略，或追问本次结果…"
                rows={3}
              />
              <div>
                <small>{chat.modelError ?? "会自动携带当前策略参数与回测摘要"}</small>
                <button type="submit" disabled={chat.sending || !chat.input.trim()}>
                  发送
                </button>
              </div>
            </form>
          </aside>

          <section class="results-panel panel">
            <div class="panel-heading">
              <div>
                <span class="step">02</span>
                <h2>验证结果</h2>
              </div>
              <Show when={view.report}>
                {(report) => (
                  <span class="source-chip" classList={{ stale: reportStale() }}>
                    {report().data.symbol} · {providerName(report().data.provider)}
                    {reportStale() ? " · 参数已变化" : ""}
                  </span>
                )}
              </Show>
            </div>

            <Show when={view.report} fallback={<EmptyResult loading={view.loading} />}>
              {(report) => <BacktestReportView report={report()} stale={reportStale()} />}
            </Show>
          </section>
        </div>
      </main>

      <footer>历史回测不代表未来表现。所有结果仅用于研究与工程验证，不构成投资建议。</footer>
    </div>
  )
}

function StrategyArtifactCard(props: { artifact: StrategyArtifact }) {
  return (
    <section class="strategy-artifact">
      <div>
        <small>已生成可复现策略报告</small>
        <strong>{props.artifact.title}</strong>
        <span class={props.artifact.auditStatus}>数据审计：{props.artifact.auditSummary}</span>
      </div>
      <nav>
        <a href={props.artifact.htmlUrl} target="_blank" rel="noreferrer">
          查看报告
        </a>
        <a href={props.artifact.jsonUrl} target="_blank" rel="noreferrer">
          原始 JSON
        </a>
      </nav>
    </section>
  )
}

function Field(props: { label: string; children: JSX.Element }) {
  return (
    <label class="field">
      <span>{props.label}</span>
      {props.children}
    </label>
  )
}

function NumberInput(props: { value: number; update: (value: number) => void; step?: number }) {
  return (
    <input
      type="number"
      value={props.value}
      step={props.step ?? 1}
      onInput={(event) => props.update(Number(event.currentTarget.value))}
    />
  )
}

function StatusDot(props: { ready?: boolean; label: string }) {
  return (
    <span class="status-item" title={props.ready ? `${props.label}已配置` : `${props.label}待配置`}>
      <i classList={{ ready: props.ready === true }} />
      {props.label}
    </span>
  )
}

function EmptyResult(props: { loading: boolean }) {
  return (
    <div class="empty-result">
      <div classList={{ "empty-visual": true, loading: props.loading }}>
        <svg viewBox="0 0 520 180" role="img" aria-label="回测净值曲线占位图">
          <path d="M8 145 C64 138 78 95 130 112 S211 149 260 92 S343 41 384 70 S451 106 512 24" />
          <path class="baseline" d="M8 145 H512" />
        </svg>
      </div>
      <h3>{props.loading ? "回测计算中" : "等待第一次策略验证"}</h3>
      <p>
        {props.loading
          ? "正在拉取复权行情并模拟逐日持仓。"
          : "选择数据源和样本区间，运行后查看收益、回撤、基准对比与全部成交。"}
      </p>
      <div class="empty-checks">
        <span>✓ 避免未来函数</span>
        <span>✓ 计入交易成本</span>
        <span>✓ 对比买入持有</span>
      </div>
    </div>
  )
}

function BacktestReportView(props: { report: BacktestResponse; stale: boolean }) {
  const metrics = () => props.report.result.metrics
  const currency = () => currencyFor(props.report.data.provider)
  return (
    <div class="report">
      <Show when={props.stale}>
        <div class="stale-notice">策略参数已经变化，下方仍是上一次回测结果。重新运行后才会更新结论。</div>
      </Show>
      <div class="kpi-grid">
        <Metric label="策略收益" value={percent(metrics().totalReturn)} tone={tone(metrics().totalReturn)} />
        <Metric label="年化收益" value={percent(metrics().annualizedReturn)} tone={tone(metrics().annualizedReturn)} />
        <Metric label="最大回撤" value={percent(metrics().maximumDrawdown)} tone="negative" />
        <Metric label="夏普比率" value={decimal(metrics().sharpeRatio)} />
        <Metric label="超额收益" value={percent(metrics().excessReturn)} tone={tone(metrics().excessReturn)} />
        <Metric label="胜率" value={percent(metrics().winRate)} />
      </div>

      <section class={`evaluation-card ${props.report.evaluation.rating}`}>
        <div class="evaluation-summary">
          <div>
            <span>策略可行性初筛</span>
            <strong>{ratingLabel(props.report.evaluation.rating)}</strong>
          </div>
          <b>
            {props.report.evaluation.score}/{props.report.evaluation.total}
          </b>
        </div>
        <p>{props.report.evaluation.summary}</p>
        <div class="evaluation-checks">
          <For each={props.report.evaluation.checks}>
            {(check) => (
              <div classList={{ passed: check.pass }}>
                <i>{check.pass ? "✓" : "!"}</i>
                <span>
                  <strong>{check.label}</strong>
                  <small>
                    当前 {feasibilityObserved(check)} · 门槛 {check.threshold}
                  </small>
                </span>
              </div>
            )}
          </For>
        </div>
      </section>

      <div class="chart-card">
        <div class="chart-title">
          <div>
            <strong>策略净值</strong>
            <span>
              {props.report.result.period.start} — {props.report.result.period.end}
            </span>
          </div>
          <strong>{money(metrics().finalEquity, currency())}</strong>
        </div>
        <EquityChart points={props.report.result.equityCurve} />
      </div>

      <div class="summary-grid">
        <div>
          <span>交易日</span>
          <strong>{props.report.result.period.tradingDays}</strong>
        </div>
        <div>
          <span>完整交易</span>
          <strong>{metrics().completedTrades}</strong>
        </div>
        <div>
          <span>持仓比例</span>
          <strong>{percent(metrics().exposure)}</strong>
        </div>
        <div>
          <span>基准收益</span>
          <strong>{percent(metrics().benchmarkReturn)}</strong>
        </div>
      </div>

      <div class="sensitivity-block">
        <div class="subheading">
          <h3>参数敏感性</h3>
          <span>自动测试当前参数附近最多 9 组组合</span>
        </div>
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>短 / 长均线</th>
                <th>总收益</th>
                <th>最大回撤</th>
                <th>夏普</th>
                <th>交易数</th>
              </tr>
            </thead>
            <tbody>
              <For each={props.report.sensitivity}>
                {(point) => (
                  <tr
                    classList={{
                      current:
                        point.fastWindow === props.report.result.config.fastWindow &&
                        point.slowWindow === props.report.result.config.slowWindow,
                    }}
                  >
                    <td>
                      {point.fastWindow} / {point.slowWindow}
                    </td>
                    <td class={tone(point.totalReturn)}>{percent(point.totalReturn)}</td>
                    <td class="negative">{percent(point.maximumDrawdown)}</td>
                    <td>{decimal(point.sharpeRatio)}</td>
                    <td>{point.completedTrades}</td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
        <p class="sensitivity-note">邻近参数表现越一致，策略越不容易只是偶然命中单一参数点。</p>
      </div>

      <div class="trade-block">
        <div class="subheading">
          <h3>最近成交</h3>
          <span>共 {props.report.result.fills.length} 笔委托成交</span>
        </div>
        <Show when={props.report.result.fills.length} fallback={<p class="muted-line">样本区间内没有触发成交。</p>}>
          <div class="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>日期</th>
                  <th>方向</th>
                  <th>数量</th>
                  <th>成交价</th>
                  <th>费用</th>
                  <th>已实现盈亏</th>
                </tr>
              </thead>
              <tbody>
                <For each={props.report.result.fills.slice(-8).reverse()}>
                  {(fill) => (
                    <tr>
                      <td>{fill.date}</td>
                      <td>
                        <span classList={{ side: true, buy: fill.side === "buy" }}>
                          {fill.side === "buy" ? "买入" : "卖出"}
                        </span>
                      </td>
                      <td>{fill.quantity}</td>
                      <td>{fill.price.toFixed(2)}</td>
                      <td>{fill.fees.toFixed(2)}</td>
                      <td class={fill.realizedPnl === undefined ? "" : tone(fill.realizedPnl)}>
                        {fill.realizedPnl === undefined ? "—" : money(fill.realizedPnl, currency())}
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </Show>
      </div>

      <details class="model-notes">
        <summary>查看模型假设与数据口径</summary>
        <ul>
          <For each={props.report.result.assumptions}>{(assumption) => <li>{assumption}</li>}</For>
        </ul>
        <p>
          数据口径：{props.report.data.adjustment === "qfq" ? "前复权" : "数据源复权"} · {props.report.disclaimer}
        </p>
      </details>
    </div>
  )
}

function Metric(props: { label: string; value: string; tone?: string }) {
  return (
    <div class="metric">
      <span>{props.label}</span>
      <strong class={props.tone}>{props.value}</strong>
    </div>
  )
}

function EquityChart(props: { points: Array<{ date: string; value: number }> }) {
  const chart = createMemo(() => {
    const width = 900
    const height = 220
    const padding = 12
    const values = props.points.map((point) => point.value)
    const min = Math.min(...values)
    const max = Math.max(...values)
    const range = Math.max(max - min, 1)
    const coords = props.points.map((point, index) => {
      const x = padding + (index / Math.max(props.points.length - 1, 1)) * (width - padding * 2)
      const y = padding + ((max - point.value) / range) * (height - padding * 2)
      return [x, y] as const
    })
    const line = coords.map(([x, y]) => `${x},${y}`).join(" ")
    const area = coords.length
      ? `M ${coords[0]![0]} ${height} L ${line.replaceAll(",", " ")} L ${coords.at(-1)![0]} ${height} Z`
      : ""
    return { line, area, min, max }
  })
  return (
    <div class="equity-chart">
      <span class="chart-max">{compactMoney(chart().max)}</span>
      <svg viewBox="0 0 900 220" preserveAspectRatio="none" role="img" aria-label="策略权益曲线">
        <defs>
          <linearGradient id="equity-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#38d996" stop-opacity=".32" />
            <stop offset="1" stop-color="#38d996" stop-opacity="0" />
          </linearGradient>
        </defs>
        <path d={chart().area} fill="url(#equity-fill)" />
        <polyline
          points={chart().line}
          fill="none"
          stroke="#38d996"
          stroke-width="3"
          vector-effect="non-scaling-stroke"
        />
      </svg>
      <span class="chart-min">{compactMoney(chart().min)}</span>
      <div class="chart-axis">
        <span>{props.points[0]?.date}</span>
        <span>{props.points.at(-1)?.date}</span>
      </div>
    </div>
  )
}

async function request<T>(url: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  })
  if (!response.ok) {
    const payload = response.headers.get("content-type")?.includes("application/json")
      ? ((await response.json()) as unknown)
      : undefined
    throw new Error(isApiError(payload) ? payload.error : `请求失败：${response.status}`)
  }
  return (await response.json()) as T
}

function chatProgressText(seconds: number) {
  if (seconds < 8) return "正在理解策略并选择工具…"
  if (seconds < 30) return "正在准备股票池与回测参数…"
  if (seconds < 90) return "正在读取历史成分、财报与行情…"
  return "正在构建首次数据缓存并运行组合回测…"
}

function formatElapsed(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return minutes ? `${minutes}分${String(remainder).padStart(2, "0")}秒` : `${remainder}秒`
}

function isApiError(value: unknown): value is ApiErrorResponse {
  return typeof value === "object" && value !== null && "error" in value && typeof value.error === "string"
}

function strategyContext(
  form: BacktestRequest,
  report?: BacktestResponse,
  reportInput?: BacktestRequest,
  reportStale = false,
) {
  return JSON.stringify(
    {
      strategy: "双均线多头",
      draftParameters: form,
      latestBacktest: report
        ? {
            request: reportInput,
            stale: reportStale,
            data: report.data,
            period: report.result.period,
            metrics: report.result.metrics,
            evaluation: report.evaluation,
            sensitivity: report.sensitivity,
            assumptions: report.result.assumptions,
          }
        : null,
    },
    null,
    2,
  )
}

function providerName(provider: BacktestRequest["provider"]) {
  return provider === "tushare" ? "Tushare" : "Alpha Vantage"
}

function percent(value: number | null) {
  return value === null || !Number.isFinite(value) ? "—" : `${(value * 100).toFixed(2)}%`
}

function decimal(value: number | null) {
  return value === null || !Number.isFinite(value) ? "—" : value.toFixed(2)
}

function money(value: number, currency: "CNY" | "USD") {
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency, maximumFractionDigits: 0 }).format(value)
}

function compactMoney(value: number) {
  return new Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 1 }).format(value)
}

function tone(value: number) {
  return value > 0 ? "positive" : value < 0 ? "negative" : ""
}

function ratingLabel(rating: BacktestResponse["evaluation"]["rating"]) {
  if (rating === "promising") return "值得继续验证"
  if (rating === "fragile") return "证据偏弱"
  return "数据不足"
}

function currencyFor(provider: BacktestRequest["provider"]) {
  return provider === "tushare" ? "CNY" : "USD"
}

function backtestRequestKey(value: BacktestRequest) {
  return JSON.stringify(value)
}

function feasibilityObserved(check: BacktestResponse["evaluation"]["checks"][number]) {
  if (check.observed === null) return "—"
  if (check.id === "sample") return `${check.observed} 个交易日`
  if (check.id === "trades") return `${check.observed} 笔`
  if (check.id === "sharpe") return decimal(check.observed)
  return percent(check.observed)
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "请求失败，请稍后重试"
}
