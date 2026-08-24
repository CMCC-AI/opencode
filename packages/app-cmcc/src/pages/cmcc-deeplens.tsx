import { Icon } from "@opencode-ai/ui/icon"
import { createEffect, createMemo, For, onCleanup, onMount } from "solid-js"
import { createStore } from "solid-js/store"
import jiutianLogo from "@/assets/home-v6/jiutian-logo.png"
import deeplensQr from "@/assets/deeplens/qr-code.png"
import homeScreen from "@/assets/deeplens/screens/home.webp"
import analysisOverviewScreen from "@/assets/deeplens/screens/analysis-overview.webp"
import analysisDetailScreen from "@/assets/deeplens/screens/analysis-detail.webp"
import analysisHubScreen from "@/assets/deeplens/screens/analysis-hub.webp"
import qaScreen from "@/assets/deeplens/screens/qa.webp"
import tableScreen from "@/assets/deeplens/screens/table.webp"
import questionsScreen from "@/assets/deeplens/screens/questions.webp"
import researchScreen from "@/assets/deeplens/screens/research.webp"
import "./cmcc-deeplens.css"

type DeepLensCapability = "qa" | "table" | "questions" | "research"

type DeepLensScene = {
  kicker: string
  title: string
  description: string
  phase: 0 | 1 | 2
  capability?: DeepLensCapability
  duration: number
  image: string
  imageAlt: string
}

const DESIGN_WIDTH = 1360
const DESIGN_HEIGHT = 860

export const DEEPLENS_SCENES: readonly DeepLensScene[] = [
  {
    kicker: "核心主流程",
    title: "拍照或上传资料",
    description: "会议 PPT、学术海报和技术资料，都可以成为深度理解的起点。",
    phase: 0,
    duration: 2300,
    image: homeScreen,
    imageAlt: "DeepLens 拍照和上传首页",
  },
  {
    kicker: "核心主流程",
    title: "识别材料与文档类型",
    description: "自动理解版面与主题，保留原始材料，生成可追溯的分析结果。",
    phase: 1,
    duration: 2300,
    image: analysisOverviewScreen,
    imageAlt: "DeepLens 分析结果概览",
  },
  {
    kicker: "核心主流程",
    title: "形成结构化深度洞见",
    description: "从核心摘要到关键数据，逐层解释材料中的观点、证据与技术路线。",
    phase: 1,
    duration: 2500,
    image: analysisDetailScreen,
    imageAlt: "DeepLens 深度解析结果",
  },
  {
    kicker: "能力扩展",
    title: "从看懂走向持续探索",
    description: "围绕同一份材料进入四项能力，让一次拍照成为进一步研究的起点。",
    phase: 2,
    duration: 2400,
    image: analysisHubScreen,
    imageAlt: "DeepLens 深入探索能力入口",
  },
  {
    kicker: "子模块 01",
    title: "围绕内容多轮问答",
    description: "答案始终基于材料上下文，可继续追问技术、结论和证据依据。",
    phase: 2,
    capability: "qa",
    duration: 2800,
    image: qaScreen,
    imageAlt: "DeepLens 智能问答",
  },
  {
    kicker: "子模块 02",
    title: "表格提取与深度解析",
    description: "不仅识别表格内容，还解释指标关系、趋势变化和数据结论。",
    phase: 2,
    capability: "table",
    duration: 2800,
    image: tableScreen,
    imageAlt: "DeepLens 表格分析",
  },
  {
    kicker: "子模块 03",
    title: "生成与演讲者的提问",
    description: "从主题、方法和潜在局限出发，快速形成专业且有针对性的交流问题。",
    phase: 2,
    capability: "questions",
    duration: 2800,
    image: questionsScreen,
    imageAlt: "DeepLens 追问建议",
  },
  {
    kicker: "子模块 04",
    title: "相关知识深度发散",
    description: "连接相关论文、前沿技术博客与延伸方向，从一份材料触类旁通。",
    phase: 2,
    capability: "research",
    duration: 3000,
    image: researchScreen,
    imageAlt: "DeepLens 相关研究",
  },
]

const capabilities: Array<{
  id: DeepLensCapability
  class: string
  icon: "prompt" | "review" | "help" | "share"
  title: string
  description: string
  scene: number
}> = [
  {
    id: "qa",
    class: "left capability-qa",
    icon: "prompt",
    title: "围绕内容多轮问答",
    description: "基于原文持续追问，深入理解技术与结论",
    scene: 4,
  },
  {
    id: "table",
    class: "left capability-table",
    icon: "review",
    title: "表格提取与深度解析",
    description: "识别数据结构，解释指标、趋势与关联关系",
    scene: 5,
  },
  {
    id: "questions",
    class: "right capability-questions",
    icon: "help",
    title: "生成与演讲者的提问",
    description: "从材料出发，形成有深度、有依据的交流问题",
    scene: 6,
  },
  {
    id: "research",
    class: "right capability-research",
    icon: "share",
    title: "相关知识深度发散",
    description: "连接相关论文、前沿技术博客与延伸方向",
    scene: 7,
  },
]

const workflow = [
  { label: "拍照上传", scene: 0, phase: 0 },
  { label: "生成深度解析", scene: 1, phase: 1 },
  { label: "追问与发散", scene: 3, phase: 2 },
] as const

export function isDeepLensPath(pathname: string) {
  return pathname.replace(/\/+$/, "").toLowerCase() === "/deeplens"
}

export function CmccDeepLensFrame(props: { active: boolean }) {
  let page: HTMLDivElement | undefined
  let stage: HTMLDivElement | undefined
  let timer: number | undefined
  let resizeObserver: ResizeObserver | undefined
  let intersectionObserver: IntersectionObserver | undefined
  let motionQuery: MediaQueryList | undefined
  const [state, setState] = createStore({
    scale: 1,
    scene: 0,
    pointerInside: false,
    inViewport: true,
    reduceMotion: false,
    documentHidden: false,
  })

  const activeScene = createMemo(() => DEEPLENS_SCENES[state.scene])
  const sceneCount = createMemo(
    () => `${String(state.scene + 1).padStart(2, "0")} / ${String(DEEPLENS_SCENES.length).padStart(2, "0")}`,
  )

  const updateScale = () => {
    if (!page?.clientWidth || !page.clientHeight) return
    setState("scale", Math.min(1, page.clientWidth / DESIGN_WIDTH, page.clientHeight / DESIGN_HEIGHT))
  }

  const stopTimer = () => {
    if (timer === undefined) return
    window.clearTimeout(timer)
    timer = undefined
  }

  const selectScene = (index: number) => {
    setState("scene", ((index % DEEPLENS_SCENES.length) + DEEPLENS_SCENES.length) % DEEPLENS_SCENES.length)
  }

  createEffect(() => {
    stopTimer()
    const scene = activeScene()
    if (!props.active || state.reduceMotion || state.documentHidden || state.pointerInside || !state.inViewport) return
    timer = window.setTimeout(() => selectScene(state.scene + 1), scene.duration)
  })

  onMount(() => {
    updateScale()
    setState("documentHidden", document.hidden)
    window.addEventListener("resize", updateScale)

    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(updateScale)
      if (page) resizeObserver.observe(page)
    }

    if (typeof IntersectionObserver !== "undefined" && stage) {
      intersectionObserver = new IntersectionObserver(
        ([entry]) => setState("inViewport", entry?.isIntersecting ?? true),
        {
          threshold: 0.2,
        },
      )
      intersectionObserver.observe(stage)
    }

    const handleVisibilityChange = () => setState("documentHidden", document.hidden)
    document.addEventListener("visibilitychange", handleVisibilityChange)

    motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)")
    setState("reduceMotion", motionQuery.matches)
    const handleMotionPreferenceChange = (event: MediaQueryListEvent) => setState("reduceMotion", event.matches)
    motionQuery.addEventListener("change", handleMotionPreferenceChange)

    onCleanup(() => {
      stopTimer()
      resizeObserver?.disconnect()
      intersectionObserver?.disconnect()
      motionQuery?.removeEventListener("change", handleMotionPreferenceChange)
      window.removeEventListener("resize", updateScale)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    })
  })

  return (
    <div
      aria-hidden={!props.active}
      inert={!props.active}
      class="absolute inset-0 z-10 flex min-h-0 min-w-0 flex-col bg-white"
      classList={{ "invisible pointer-events-none": !props.active }}
    >
      <div ref={page} class="cmcc-deeplens-page" data-testid="cmcc-deeplens-showcase">
        <main
          class="deeplens-canvas"
          style={{ transform: `translate(-50%, -50%) scale(${state.scale})` }}
          data-scene-index={state.scene}
        >
          <header class="brand-header">
            <div class="brand-lockup">
              <img src={jiutianLogo} alt="九天" class="brand-symbol" />
              <div class="product-name">
                <span>DeepLens</span>
                <strong>拍照即懂</strong>
              </div>
            </div>
            <p class="brand-subtitle">拍照或上传会议PPT、海报、学术资料，AI秒级提取结构化洞见，支持深度追问互动</p>
          </header>

          <section class="experience" aria-label="DeepLens 产品体验">
            <aside class="scan-column">
              <div class="scan-kicker">移动端即扫即用</div>
              <h1 class="scan-title">
                扫描二维码
                <br />
                用手机看懂眼前内容
              </h1>
              <div class="qr-card">
                <div class="qr-frame">
                  <img src={deeplensQr} alt="DeepLens 手机体验二维码" />
                </div>
                <div class="scan-action" aria-hidden="true">
                  <Icon name="photo" class="size-5" />
                  手机扫一扫
                </div>
              </div>
              <p class="scan-note">
                扫码进入 DeepLens 移动端
                <br />
                即开即用，无需安装
              </p>
            </aside>

            <div
              ref={stage}
              class="demo-stage"
              onMouseEnter={() => setState("pointerInside", true)}
              onMouseLeave={() => setState("pointerInside", false)}
            >
              <div class="stage-halo" aria-hidden="true" />

              <div class="stage-intro" aria-live="polite">
                <small>{activeScene().kicker}</small>
                <h2>{activeScene().title}</h2>
                <p>{activeScene().description}</p>
              </div>

              <For each={capabilities}>
                {(capability) => (
                  <button
                    class={`capability ${capability.class}`}
                    classList={{ active: activeScene().capability === capability.id }}
                    type="button"
                    aria-pressed={activeScene().capability === capability.id}
                    aria-label={`查看${capability.title}`}
                    onClick={() => selectScene(capability.scene)}
                  >
                    <span class="capability-icon">
                      <Icon name={capability.icon} class="size-5" />
                    </span>
                    <span>
                      <strong>{capability.title}</strong>
                      <span>{capability.description}</span>
                    </span>
                  </button>
                )}
              </For>

              <div class="phone" aria-label="DeepLens 手机端功能演示">
                <div class="phone-status">
                  <span>9:41</span>
                  <span>5G&nbsp;&nbsp;●</span>
                </div>
                <div class="phone-notch" aria-hidden="true" />
                <div class="phone-screen">
                  <For each={DEEPLENS_SCENES}>
                    {(scene, index) => (
                      <img
                        src={scene.image}
                        alt={scene.imageAlt}
                        class="scene-image"
                        classList={{ active: index() === state.scene }}
                        aria-hidden={index() !== state.scene}
                        draggable={false}
                      />
                    )}
                  </For>
                </div>
                <div class="phone-caption">
                  <span class="live-state">自动演示中</span>
                  <span class="scene-count">{sceneCount()}</span>
                </div>
              </div>

              <div class="scene-progress" aria-label="演示场景选择">
                <For each={DEEPLENS_SCENES}>
                  {(_, index) => (
                    <button
                      class="scene-dot"
                      classList={{ active: index() === state.scene }}
                      type="button"
                      aria-label={`场景 ${index() + 1}`}
                      aria-current={index() === state.scene ? "true" : undefined}
                      onClick={() => selectScene(index())}
                    />
                  )}
                </For>
              </div>

              <nav class="workflow" aria-label="DeepLens 核心流程">
                <For each={workflow}>
                  {(step, index) => (
                    <button
                      class="workflow-step"
                      classList={{ active: activeScene().phase === step.phase }}
                      type="button"
                      aria-current={activeScene().phase === step.phase ? "step" : undefined}
                      onClick={() => selectScene(step.scene)}
                    >
                      <span class="step-index">{index() + 1}</span>
                      {step.label}
                    </button>
                  )}
                </For>
              </nav>
            </div>
          </section>
        </main>
      </div>
    </div>
  )
}

export function CmccDeepLensRoute() {
  return null
}
