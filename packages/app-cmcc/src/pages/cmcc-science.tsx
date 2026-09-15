import { A } from "@solidjs/router"
import { Icon } from "@opencode-ai/ui/icon"
import { createMemo, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { CMCC_TEAM_EXPERTS } from "@/utils/cmcc-experts"
import { SCIENCE_MODULES, sciencePrompt } from "@/utils/cmcc-science"
import { useCmccExpertDraftLauncher } from "./cmcc-experts"
import "./cmcc-science.css"

export default function CmccScienceRoute() {
  const launch = useCmccExpertDraftLauncher()
  return (
    <ScienceWorkbench
      onLaunch={async (prompt) => {
        const expert = CMCC_TEAM_EXPERTS.find((item) => item.id === "ai-for-science-team")
        if (expert) await launch(expert, prompt)
      }}
    />
  )
}

export function ScienceWorkbench(props: { onLaunch: (prompt: string) => Promise<void> }) {
  const [state, setState] = createStore({
    mode: "single" as "single" | "flow",
    selected: ["review"],
    topic: "",
    materials: "",
    group: "全部",
    busy: false,
  })
  const active = createMemo(() => SCIENCE_MODULES.find((item) => item.id === state.selected[0]) ?? SCIENCE_MODULES[0])
  const visible = createMemo(() =>
    SCIENCE_MODULES.filter((item) => state.group === "全部" || item.group === state.group),
  )
  const choose = (id: string) => {
    if (state.mode === "single") return setState("selected", [id])
    if (state.selected.includes(id))
      return setState(
        "selected",
        state.selected.filter((item) => item !== id),
      )
    setState(
      "selected",
      SCIENCE_MODULES.filter((item) => item.id === id || state.selected.includes(item.id)).map((item) => item.id),
    )
  }
  const submit = async (event: SubmitEvent) => {
    event.preventDefault()
    const prompt = sciencePrompt({
      ids: state.selected,
      mode: state.mode,
      topic: state.topic,
      materials: state.materials,
    })
    if (!prompt || state.busy) return
    setState("busy", true)
    try {
      await props.onLaunch(prompt)
    } finally {
      setState("busy", false)
    }
  }
  return (
    <div class="science-page">
      <div class="science-shell">
        <header class="science-header">
          <span class="science-brand">
            <span class="science-mark">✳</span> AI for Science <span class="science-beta">科研工作台</span>
          </span>
          <A href="/expert/ai-for-science-team">认识科研专家团 ↗</A>
        </header>
        <section class="science-hero">
          <div class="science-hero-copy">
            <div class="science-eyebrow">FROM CURIOSITY TO DISCOVERY</div>
            <h1>
              让每一个研究想法，
              <br />
              向发现再进一步<span>。</span>
            </h1>
            <p>
              从第一篇文献到最后一轮审稿。
              <br />
              与你的 AI 科研专家团一起，把问题变成有据可循的成果。
            </p>
            <div class="science-hero-meta">
              <span>20 位领域专家</span>
              <i />
              按需协作
              <i />
              全程证据追溯
            </div>
          </div>
          <div class="science-orbit" aria-hidden="true">
            <div class="science-orbit-ring ring-one" />
            <div class="science-orbit-ring ring-two" />
            <div class="science-orbit-ring ring-three" />
            <span class="science-orbit-core">
              探索
              <br />
              <small>DISCOVER</small>
            </span>
            <span class="orbit-label label-one">Evidence</span>
            <span class="orbit-label label-two">Experiment</span>
            <span class="orbit-label label-three">Insight</span>
            <span class="orbit-dot" />
          </div>
        </section>
        <section class="science-path" aria-label="科研路径概览">
          <div class="science-path-title">
            <span class="science-eyebrow">YOUR RESEARCH JOURNEY</span>
            <strong>从任意一步开始</strong>
          </div>
          <div class="science-path-steps">
            <For each={["发现文献", "形成假设", "实验验证", "论证写作", "审查交付"]}>
              {(label, i) => (
                <span>
                  <small>0{i() + 1}</small>
                  {label}
                  <b aria-hidden="true">→</b>
                </span>
              )}
            </For>
          </div>
        </section>
        <div class="science-workspace">
          <section class="science-catalog" aria-label="科研能力">
            <div class="science-section-heading">
              <div>
                <h2>选择你的研究起点</h2>
                <p>独立解决一个问题，或串联一段研究旅程。</p>
              </div>
              <span class="science-count">6 个研究环节 + DeepXiv</span>
            </div>
            <A class="science-deepxiv" href="/deepxiv">
              <div class="science-deepxiv-icon">
                <Icon name="review" />
              </div>
              <div>
                <div class="science-eyebrow">DISCOVERY ENGINE</div>
                <h3>
                  DeepXiv <span>前沿论文发现</span>
                </h3>
                <p>浏览前沿论文，找到下一次研究的灵感。</p>
              </div>
              <span class="science-deepxiv-action">进入探索 ↗</span>
            </A>
            <div class="science-filter" aria-label="筛选科研环节">
              <For each={["全部", "发现", "验证", "表达"]}>
                {(group) => (
                  <button
                    type="button"
                    aria-pressed={state.group === group}
                    classList={{ active: state.group === group }}
                    onClick={() => setState("group", group)}
                  >
                    {group}
                  </button>
                )}
              </For>
            </div>
            <div class="science-cards">
              <For each={visible()}>
                {(item) => (
                  <button
                    type="button"
                    class="science-card"
                    classList={{ selected: state.selected.includes(item.id) }}
                    aria-pressed={state.selected.includes(item.id)}
                    onClick={() => choose(item.id)}
                  >
                    <div class="science-card-top">
                      <span class="science-card-icon">
                        <Icon name={item.icon} />
                      </span>
                      <span class="science-card-number">0{SCIENCE_MODULES.indexOf(item) + 1}</span>
                    </div>
                    <h3>
                      {item.title}
                      <span aria-hidden="true">↗</span>
                    </h3>
                    <div class="science-card-english">{item.english}</div>
                    <p>{item.description}</p>
                    <div class="science-card-output">{item.output}</div>
                  </button>
                )}
              </For>
            </div>
            <div class="science-note">
              <span>✳</span>
              <p>
                研究可以往返，证据需要积累。
                <br />
                <strong>每个环节都可独立开始，已有材料会成为下一步的起点。</strong>
              </p>
            </div>
          </section>
          <aside class="science-config">
            <form onSubmit={submit}>
              <div class="science-eyebrow">START YOUR RESEARCH</div>
              <h2>这次，想探索什么？</h2>
              <div class="science-mode">
                <button
                  type="button"
                  aria-pressed={state.mode === "single"}
                  classList={{ active: state.mode === "single" }}
                  onClick={() => setState({ mode: "single", selected: [state.selected[0] ?? "review"] })}
                >
                  独立环节
                </button>
                <button
                  type="button"
                  aria-pressed={state.mode === "flow"}
                  classList={{ active: state.mode === "flow" }}
                  onClick={() => setState({ mode: "flow", selected: SCIENCE_MODULES.map((item) => item.id) })}
                >
                  串联流程
                </button>
              </div>
              <Show
                when={state.mode === "single"}
                fallback={
                  <div class="science-selection">
                    <strong>本次研究路径 · {state.selected.length} 个环节</strong>
                    <p>
                      {state.selected.map((id) => SCIENCE_MODULES.find((item) => item.id === id)?.title).join(" → ") ||
                        "请在左侧选择至少一个环节"}
                    </p>
                    <small>点击环节可加入或移出，按路径顺序执行。</small>
                  </div>
                }
              >
                <div class="science-selection">
                  <strong>{active().title}</strong>
                  <p>{active().input}</p>
                  <small>协作专家：{active().experts}</small>
                </div>
              </Show>
              <label for="science-topic">
                研究需求 <span>必填</span>
              </label>
              <textarea
                id="science-topic"
                required
                maxlength={8000}
                value={state.topic}
                onInput={(event) => setState("topic", event.currentTarget.value)}
                placeholder="描述你的研究主题、目标，或希望解决的问题…"
                rows={4}
              />
              <button
                type="button"
                class="science-example"
                onClick={() => setState("topic", "研究大语言模型在科研假设生成中的应用，重点关注可验证性与评估方法。")}
              >
                试试：大模型如何辅助科研假设生成 ↗
              </button>
              <label for="science-materials">
                已有材料 <span>选填</span>
              </label>
              <textarea
                id="science-materials"
                maxlength={12000}
                value={state.materials}
                onInput={(event) => setState("materials", event.currentTarget.value)}
                placeholder="论文链接、工作区文件路径、已有结果或资源约束…"
                rows={3}
              />
              <p class="science-helper">可在进入对话后补充文件与详细要求。</p>
              <button
                class="science-submit"
                type="submit"
                disabled={state.busy || !state.topic.trim() || !state.selected.length}
              >
                {state.busy ? "正在准备对话…" : "进入科研对话"}
                <span>→</span>
              </button>
              <p class="science-submit-note" role="status">
                先生成可编辑的任务草稿，发送后启动专家协作。
              </p>
              <div class="science-assurance">
                <span>研究质量，贯穿始终</span>
                <p>范围确认 · 实验授权 · 方案核验 · 结论审查</p>
              </div>
            </form>
          </aside>
        </div>
        <footer class="science-footer">
          <span>AI FOR SCIENCE</span>以好奇心为起点，以可信证据为终点。
        </footer>
      </div>
    </div>
  )
}
