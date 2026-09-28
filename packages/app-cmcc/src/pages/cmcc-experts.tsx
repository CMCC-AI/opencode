import { Navigate, useNavigate, useParams } from "@solidjs/router"
import { Icon } from "@opencode-ai/ui/icon"
import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import { Portal } from "solid-js/web"
import { useServer } from "@/context/server"
import { useDockApi } from "@/context/dockapi"
import { useServerSDK } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"
import { useTabs } from "@/context/tabs"
import expertFinance from "@/assets/experts/scene-13.png"
import expertGeneral from "@/assets/experts/scene-15.png"
import expertIndustry from "@/assets/experts/scene-06.png"
import expertZhengqi from "@/assets/experts/scene-08.png"
import expertLocation from "@/assets/experts/scene-14.png"
import expertResearch from "@/assets/experts/scene-17.png"
import expertHero from "@/assets/experts/scene-05.png"
import bannerBg from "@/assets/experts/banner.png"
import robotBtn from "@/assets/experts/robot-button.png"
import expertSkillResearch from "@/assets/experts/detail-skill-research.png"
import expertSkillReview from "@/assets/experts/detail-skill-review.png"
import expertSkillWriting from "@/assets/experts/detail-skill-writing.png"
import shoppersDemoGif from "@/assets/experts/shoppers-demo.gif"
import {
  cmccArtifactWorkspace,
  cmccEnsureWorkspace,
  cmccRememberConversationWorkspace,
} from "@/utils/cmcc-workspace"
import {
  CMCC_EXPERTS,
  CMCC_TEAM_EXPERTS,
  cmccExpertCenterHref,
  cmccExpertHref,
  cmccMemberAvatarUrl,
  type CmccExpert,
  type ExternalExpert,
  type TeamExpert,
  type TeamMember,
} from "@/utils/cmcc-experts"
import { showToast } from "@/utils/toast"

export { CMCC_EXPERTS, cmccExpertCenterHref, cmccExpertHref }

const EXPERT_PRESENTATION: Record<string, { eyebrow: string; summary: string; image: string }> = {
  chat: {
    eyebrow: "AI + 深度研究",
    summary: "把复杂问题拆解为可靠的研究、判断与行动",
    image: expertGeneral,
  },
  workspace: {
    eyebrow: "AI + 产业追踪",
    summary: "追踪行业动态，快速识别趋势与信号",
    image: expertIndustry,
  },
  deeptrading: {
    eyebrow: "AI + 财经",
    summary: "多智能体协作完成标的识别、四维分析与可视化报告",
    image: expertFinance,
  },
  "shoppers-pro": {
    eyebrow: "AI + 推荐",
    summary: "务实需求洞察、多平台比价、真实口碑分析，交付可点击的购买决策报告",
    image: expertHero,
  },
  deepinspect: {
    eyebrow: "AI + 巡查",
    summary: "多智能体协作完成现场风险识别、问题归并与结构化巡查报告交付",
    image: expertIndustry,
  },
  "zhengqi-visit-intel": {
    eyebrow: "AI + 政企",
    summary: "融合内部门户数据与公开情报，交付可溯源的谈参高拜决策报告",
    image: expertZhengqi,
  },
  deepgeo: {
    eyebrow: "AI + 位置",
    summary: "把客流、客群、商业生态与财务数据转化为可复算的位置决策报告",
    image: expertLocation,
  },
  "ai-for-science-team": {
    eyebrow: "AI + 科研",
    summary: "文献综述、论文复现、实验设计与科研写作，交付可审计研究包",
    image: expertResearch,
  },
}

const EXPERT_SKILL_IMAGES = [expertSkillResearch, expertSkillReview, expertSkillWriting]
// 3 列网格的固定排序：财经/政企/巡查 + 推荐/位置/科研
const INDUSTRY_ORDER = ["deeptrading", "zhengqi-visit-intel", "deepinspect", "shoppers-pro", "deepgeo", "ai-for-science-team"]
const INDUSTRY_EXPERTS = [
  ...INDUSTRY_ORDER.flatMap((id) => {
    const expert = CMCC_EXPERTS.find((item) => item.id === id)
    return expert ? [expert] : []
  }),
  ...CMCC_EXPERTS.filter((expert) => expert.id !== "chat" && expert.id !== "workspace" && expert.id !== "deepinsight" && !INDUSTRY_ORDER.includes(expert.id)),
]

function FeaturedCarousel(props: { experts: TeamExpert[]; onOpen: (expert: TeamExpert) => void }) {
  const [index, setIndex] = createSignal(0)
  const total = () => props.experts.length
  const current = createMemo(() => props.experts[index() % total()])

  let timer: ReturnType<typeof setInterval>
  onMount(() => {
    timer = setInterval(() => setIndex((i) => (i + 1) % total()), 4000)
  })
  onCleanup(() => clearInterval(timer))

  return (
    <div class="relative mt-5 flex min-h-[240px] w-full overflow-hidden rounded-[16px] border border-[#d7def7] bg-[#fff] p-0 shadow-[0_8px_30px_rgba(67,66,116,0.06)] max-sm:min-h-[200px]">
      <img
        src={bannerBg}
        alt=""
        class="pointer-events-none absolute inset-0 size-full object-cover"
      />
      <div class="pointer-events-none absolute inset-0 bg-gradient-to-r from-white/95 via-white/80 to-white/30" />

      <div class="relative z-10 flex w-full flex-col px-7 pt-12 pb-5 max-sm:px-5 max-sm:pt-8">
        <div class="mb-5 flex gap-1.5">
          <For each={props.experts}>
            {(_, i) => (
              <button
                type="button"
                class="h-2 w-2 rounded-full border-0 bg-[#c4b5fd] p-0 transition-all"
                classList={{ "w-5 bg-[#7c3aed]": i() === index() % total() }}
                onClick={() => setIndex(i())}
              />
            )}
          </For>
        </div>

        <div class="flex flex-1 items-center gap-6">
          <div class="min-w-0 flex-1">
            <div class="text-[22px] font-semibold leading-8 text-[#7c3aed]">{current().name}</div>
            <p class="m-0 mt-1.5 line-clamp-2 text-[13px] leading-5 text-[#6b7280]">{current().description}</p>
          </div>

          <button
            type="button"
            class="flex shrink-0 cursor-pointer flex-col items-center gap-1 border-0 bg-transparent p-0"
            onClick={() => props.onOpen(current())}
          >
            <img src={robotBtn} alt="" class="h-28 w-auto object-contain transition hover:scale-105" />
          </button>
        </div>
      </div>
    </div>
  )
}

export function CmccExpertCenterRoute() {
  const navigate = useNavigate()
  const launch = useCmccExpertDraftLauncher()
  const [active, setActive] = createSignal<CmccExpert>()

  return (
    <div class="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-[#fbfcff] text-[#2a155a]">
      <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(239,226,255,0.58),transparent_31%),radial-gradient(circle_at_82%_78%,rgba(220,239,255,0.62),transparent_34%)]" />
      <div class="relative mx-auto flex w-full max-w-[1320px] flex-col px-6 pb-10 pt-14 max-sm:px-4 max-sm:pt-8">
        <header class="w-full">
          <h1 class="m-0 bg-gradient-to-r from-[#8800ff] to-[#2c5dff] bg-clip-text text-[32px] font-medium leading-10 tracking-[-0.5px] text-transparent max-sm:text-[28px]">
            产业洞察专家团
          </h1>
          <p class="m-0 mt-2 text-[16px] leading-6 text-[#3c4055] max-sm:text-[14px]">
            让 AI 进入真实产业场景，完成研究、判断与行动
          </p>
        </header>

        <FeaturedCarousel experts={CMCC_TEAM_EXPERTS.filter((e) => e.id !== "deepinsight")} onOpen={(expert) => setActive(expert)} />

        <section class="mt-7 w-full">
          <h2 class="m-0 text-[16px] font-medium leading-6 text-[#49386e]">AI + 产业洞察</h2>
          <p class="m-0 mt-1 text-[14px] leading-5 text-[#49386e]/55">选择一个专家或专家团，进入专属工作台</p>
          <div class="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <For each={INDUSTRY_EXPERTS}>
              {(expert) => <ExpertCard expert={expert} onClick={() => setActive(expert)} />}
            </For>
          </div>
        </section>
      </div>

      <Show when={active()}>
        {(expert) => (
          <ExpertDetailDialog
            expert={expert()}
            onClose={() => setActive(undefined)}
            onOpenExternal={(item) => navigate(cmccExpertHref(item))}
            onSummon={(item, prompt) => void launch(item, prompt)}
          />
        )}
      </Show>
    </div>
  )
}

export function CmccExpertRoute() {
  const params = useParams<{ id?: string }>()
  const expert = createMemo(() => CMCC_EXPERTS.find((item) => item.id === params.id))

  return (
    <Show when={expert()} fallback={<Navigate href={cmccExpertCenterHref()} />}>
      {(item) => (
        <Show when={item().kind === "team"} fallback={<ExternalExpertFrame expert={item() as ExternalExpert} />}>
          <TeamExpertView expert={item() as TeamExpert} />
        </Show>
      )}
    </Show>
  )
}

function ExternalExpertFrame(props: { expert: ExternalExpert }) {
  return (
    <div class="flex size-full min-h-0 min-w-0 flex-col bg-v2-background-bg-base">
      <iframe
        title={props.expert.name}
        class="min-h-0 flex-1 border-0 bg-[#fff]"
        src={props.expert.url}
        sandbox="allow-forms allow-popups allow-same-origin allow-scripts"
      />
    </div>
  )
}

function TeamExpertView(props: { expert: TeamExpert }) {
  const launch = useCmccExpertDraftLauncher()

  return (
    <div class="min-h-0 flex-1 overflow-y-auto bg-v2-background-bg-deep">
      <div class="mx-auto flex w-full max-w-[1120px] flex-col gap-5 px-6 py-6">
        <div class="flex min-w-0 flex-wrap items-start justify-between gap-4 border-b border-v2-border-border-base pb-5">
          <div class="flex min-w-0 flex-col gap-2">
            <div class="flex items-center gap-2 text-[13px] leading-4 text-v2-text-text-muted">
              <Icon name="mcp" class="size-4" />
              <span>本地专家团</span>
              <span>{props.expert.members.length} 位成员</span>
            </div>
            <h1 class="m-0 text-[26px] font-semibold leading-8 text-v2-text-text-base">{props.expert.name}</h1>
            <p class="m-0 max-w-[760px] text-[14px] leading-6 text-v2-text-text-muted">{props.expert.description}</p>
            <TagList tags={props.expert.tags} />
          </div>
          <button
            type="button"
            class="flex h-9 shrink-0 items-center gap-2 rounded-[6px] bg-v2-text-text-base px-3 text-[13px] leading-4 text-v2-background-bg-layer-01 hover:opacity-90"
            onClick={() => void launch(props.expert)}
          >
            <Icon name="new-session" class="size-4" />
            召唤专家团
          </button>
        </div>

        <div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          <For each={props.expert.members}>{(member) => <MemberCard member={member} />}</For>
        </div>
      </div>
    </div>
  )
}

function ExpertCard(props: { expert: CmccExpert; onClick: () => void }) {
  const presentation = EXPERT_PRESENTATION[props.expert.id] ?? {
    eyebrow: props.expert.name,
    summary: props.expert.description,
    image: expertGeneral,
  }

  return (
    <button
      type="button"
      class="group relative h-[200px] min-w-0 overflow-hidden rounded-[16px] border border-[#e6e8f4] bg-[linear-gradient(169deg,#e4eaff_3%,#f5f6fb_48%)] p-0 text-left shadow-[0_4px_8px_rgba(26,13,82,0.12)] transition hover:-translate-y-1 hover:border-[#c8cff0] hover:shadow-[0_14px_28px_rgba(67,66,116,0.16)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5b4cff] xl:h-[220px]"
      onClick={props.onClick}
    >
      <img
        src={presentation.image}
        alt=""
        class="pointer-events-none absolute inset-0 size-full object-cover transition duration-300 group-hover:scale-[1.035]"
      />
      <div class="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#eef1ff] via-[#eef1ff]/72 to-transparent" />
      <div class="relative z-10 flex h-full max-w-[78%] flex-col px-4 py-4">
        <h3 class="m-0 text-[17px] font-medium leading-6 text-[#2a155a]">{presentation.eyebrow}</h3>
        <p class="m-0 mt-0.5 line-clamp-2 text-[11px] leading-4 text-[#2a155a]/52">{presentation.summary}</p>
        <div class="mt-auto flex min-w-0 items-center">
          <span class="max-w-full truncate rounded-full bg-[linear-gradient(90deg,#eceaff,#dedcff)] px-2.5 py-1 text-[11px] leading-4 text-[#5b4cff]">
            {props.expert.name}
          </span>
        </div>
      </div>
    </button>
  )
}

function GifDemoModal(props: { onClose: () => void }) {
  return (
    <Portal>
      <div
        class="fixed inset-0 z-[230] flex items-center justify-center bg-[#050112]/60 px-4 py-4 backdrop-blur-[2px]"
        onClick={props.onClose}
      >
        <div
          class="relative flex max-h-[90dvh] max-w-[420px] flex-col overflow-hidden rounded-[16px] bg-[#fff] shadow-[0_28px_90px_rgba(24,14,57,0.35)]"
          onClick={(event) => event.stopPropagation()}
        >
          <header class="flex h-12 shrink-0 items-center justify-between border-b border-[#edf0f7] px-5">
            <h3 class="m-0 text-[14px] font-semibold leading-5 text-[#252839]">手机演示</h3>
            <button
              type="button"
              class="flex size-7 shrink-0 items-center justify-center rounded-[6px] text-[#697085] transition hover:bg-[#f3f5fa] hover:text-[#252839]"
              onClick={props.onClose}
              aria-label="关闭演示"
            >
              <Icon name="close" class="size-3.5" />
            </button>
          </header>
          <div class="flex items-center justify-center bg-[#f5f6fb] p-3">
            <img src={shoppersDemoGif} alt="Shoppers Pro 手机演示" class="max-h-[calc(90dvh-90px)] w-auto rounded-[10px] object-contain" />
          </div>
        </div>
      </div>
    </Portal>
  )
}

function ExpertDetailDialog(props: {
  expert: CmccExpert
  onClose: () => void
  onOpenExternal: (expert: ExternalExpert) => void
  onSummon: (expert: TeamExpert, prompt?: string) => void
}) {
  const navigate = useNavigate()
  const presentation = createMemo(
    () =>
      EXPERT_PRESENTATION[props.expert.id] ?? {
        eyebrow: props.expert.name,
        summary: props.expert.description,
        image: expertGeneral,
      },
  )
  const capabilities = createMemo(() =>
    props.expert.tags.slice(0, 3).map((tag, index) => ({
      title: tag,
      description:
        props.expert.kind === "team"
          ? (props.expert.examples[index] ?? props.expert.description)
          : props.expert.description,
      image: EXPERT_SKILL_IMAGES[index] ?? expertSkillResearch,
    })),
  )
  const [showDemo, setShowDemo] = createSignal(false)

  return (
    <Portal>
      <div
        class="fixed inset-0 z-[220] flex items-center justify-center bg-[#050112]/40 px-4 py-4 backdrop-blur-[1px]"
        onClick={props.onClose}
      >
        <section
          class="flex h-[600px] max-h-[calc(100dvh-32px)] w-full max-w-[800px] flex-col overflow-hidden rounded-[16px] bg-[#fff] text-[#1f2433] shadow-[0_28px_90px_rgba(24,14,57,0.28)]"
          onClick={(event) => event.stopPropagation()}
        >
          <header class="flex h-16 shrink-0 items-center justify-between border-b border-[#edf0f7] px-6">
            <h2 class="m-0 truncate text-[16px] font-semibold leading-6 text-[#252839]">{presentation().eyebrow}</h2>
            <button
              type="button"
              class="flex size-8 shrink-0 items-center justify-center rounded-[8px] text-[#697085] transition hover:bg-[#f3f5fa] hover:text-[#252839]"
              onClick={props.onClose}
              aria-label="关闭专家详情"
            >
              <Icon name="close" class="size-4" />
            </button>
          </header>

          <div class="min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-12 lg:px-[100px]">
            <section class="relative h-[150px] overflow-hidden rounded-[16px] border border-[#e4e8f6] bg-[linear-gradient(145deg,#edf1ff_0%,#f7f8fd_100%)]">
              <img src={presentation().image} alt="" class="absolute inset-0 size-full object-cover" />
              <div class="absolute inset-0 bg-gradient-to-r from-[#eef2ff] via-[#eef2ff]/82 to-transparent" />
              <div class="relative flex h-full max-w-[72%] flex-col px-6 py-5">
                <h3 class="m-0 text-[18px] font-semibold leading-6 text-[#291759]">{presentation().eyebrow}</h3>
                <p class="m-0 mt-1.5 line-clamp-2 text-[12px] leading-5 text-[#535a70]">{props.expert.description}</p>
                <span class="mt-auto w-fit max-w-full truncate rounded-full bg-[linear-gradient(90deg,#eceaff,#dedcff)] px-3 py-1 text-[11px] leading-4 text-[#5b4cff]">
                  {props.expert.name}
                </span>
              </div>
            </section>

            <section class="mt-5">
              <h3 class="m-0 text-[16px] font-medium leading-6 text-[#252839]">专家团技能:</h3>
              <div class="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <For each={capabilities()}>
                  {(capability, index) => (
                    <button
                      type="button"
                      class="group flex min-h-20 min-w-0 items-center gap-2 rounded-[8px] border border-[#edf0f7] bg-[#f9fbfe] px-2.5 py-2 text-left transition hover:-translate-y-0.5 hover:border-[#cbd4f5] hover:bg-[#fff] hover:shadow-[0_8px_20px_rgba(69,65,116,0.09)]"
                      onClick={() => {
                        if (props.expert.kind === "team") {
                          props.onSummon(props.expert, props.expert.examples[index()] ?? props.expert.defaultPrompt)
                          return
                        }
                        props.onOpenExternal(props.expert)
                      }}
                    >
                      <img src={capability.image} alt="" class="size-[50px] shrink-0 object-contain transition group-hover:scale-105" />
                      <span class="min-w-0">
                        <span class="block truncate text-[13px] font-medium leading-5 text-[#252839]">{capability.title}</span>
                        <span class="mt-0.5 line-clamp-2 block text-[11px] leading-4 text-[#7c8398]">{capability.description}</span>
                      </span>
                    </button>
                  )}
                </For>
              </div>
            </section>

            <Show when={props.expert.kind === "team" ? props.expert : undefined}>
              {(item) => (
                <section class="mt-5">
                  <h3 class="m-0 text-[16px] font-medium leading-6 text-[#252839]">专家协作:</h3>
                  <div class="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <For each={item().members.filter((m) => m.id !== "deeptrading/dt-trader")}>{(member) => <DialogMember member={member} />}</For>
                  </div>
                </section>
              )}
            </Show>
          </div>

          <footer class="flex h-[68px] shrink-0 items-center justify-end gap-3 border-t border-[#edf0f7] px-6 shadow-[0_-5px_16px_rgba(52,42,89,0.04)]" classList={{ "!gap-2 !px-3 sm:!gap-3 sm:!px-6 [&_button]:!px-2 [&_button]:whitespace-nowrap [&_button]:shrink-0 sm:[&_button]:!px-5": props.expert.id === "deeptrading" }}>
            <Show when={props.expert.id === "deeptrading"}>
              <button type="button" class="mr-auto flex h-9 items-center justify-center gap-2 rounded-[8px] bg-[linear-gradient(90deg,#8758f5,#3b6dff)] px-5 text-[13px] font-medium text-[#fff] shadow-[0_6px_14px_rgba(120,95,245,0.25)] transition hover:brightness-105" onClick={() => { props.onClose(); navigate("/mstock") }}>
                <Icon name="fork" class="size-4" style={{ color: "#fff" }} />多股对比
              </button>
            </Show>
            <Show when={props.expert.id === "shoppers-pro"}>
              <button
                type="button"
                class="mr-auto flex h-9 items-center gap-1.5 rounded-[8px] border border-[#d7def7] bg-[#f8f9ff] px-4 text-[13px] font-medium text-[#5b4cff] transition hover:border-[#c4cff7] hover:bg-[#f0f2ff]"
                onClick={() => setShowDemo(true)}
              >
                <svg class="size-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-linecap="square">
                  <rect x="5.5" y="1.5" width="9" height="17" rx="1.5" />
                  <line x1="5.5" y1="4.5" x2="14.5" y2="4.5" />
                  <line x1="5.5" y1="15.5" x2="14.5" y2="15.5" />
                </svg>
                手机演示
              </button>
            </Show>
            <div class="flex items-center gap-3">
              <button
                type="button"
                class="h-9 rounded-[8px] border border-[#637cff] bg-[#fff] px-5 text-[13px] font-medium text-[#536dff] transition hover:bg-[#f5f7ff]"
                onClick={props.onClose}
              >
                取消
              </button>
              <Show
                when={props.expert.kind === "team" ? props.expert : undefined}
                fallback={
                  <button
                    type="button"
                    class="flex h-9 items-center justify-center rounded-[8px] bg-[linear-gradient(90deg,#536dff,#8758f5)] px-5 text-[13px] font-medium text-[#fff] shadow-[0_6px_14px_rgba(92,91,241,0.22)] transition hover:brightness-105"
                    onClick={() => props.onOpenExternal(props.expert as ExternalExpert)}
                  >
                    打开 {props.expert.name}
                  </button>
                }
              >
                {(item) => (
                  <button
                    type="button"
                    class="flex h-9 items-center justify-center rounded-[8px] bg-[linear-gradient(90deg,#8758f5,#3b6dff)] px-5 text-[13px] font-medium text-[#fff] shadow-[0_6px_14px_rgba(120,95,245,0.25)] transition hover:brightness-105"
                    onClick={() => props.onSummon(item())}
                  >
                    召唤产业专家团
                  </button>
                )}
              </Show>
            </div>
          </footer>
        </section>
      </div>
      <Show when={showDemo()}>
        <GifDemoModal onClose={() => setShowDemo(false)} />
      </Show>
    </Portal>
  )
}

function useCmccExpertDraftLauncher() {
  const server = useServer()
  const dockapi = useDockApi()
  const serverSDK = useServerSDK()
  const sync = useServerSync()
  const tabs = useTabs()

  return async (expert: TeamExpert, prompt = expert.defaultPrompt) => {
    const directory = dockapi.workspace?.directoryPath
    const artifactDirectory = cmccArtifactWorkspace(directory)
    if (!directory || !artifactDirectory || !tabs.ready()) return

    const agents = await serverSDK()
      .client.app.agents({ directory }, { throwOnError: true })
      .catch((error) => {
        showToast({
          title: "无法读取专家配置",
          description: error instanceof Error ? error.message : String(error),
          variant: "error",
        })
        return undefined
      })
    if (!agents?.data?.some((item) => item.name === expert.leadAgent)) {
      showToast({
        title: "专家团配置未加载",
        description: `后端还没有加载 ${expert.leadAgent}，请重启服务后再试。`,
        variant: "error",
      })
      return
    }

    tabs.newDraft({ server: server.key, directory, artifactDirectory, expertID: expert.id }, prompt, {
      agent: expert.leadAgent,
    })
    cmccRememberConversationWorkspace(directory)
    server.projects.touch(directory)
    void cmccEnsureWorkspace(
      artifactDirectory,
      (path) => serverSDK().client.file.createDirectory({ path }, { throwOnError: true }),
      serverSDK().scope,
    ).catch((error) => {
      showToast({
        title: "无法准备专家团产物目录",
        description: error instanceof Error ? error.message : String(error),
        variant: "error",
      })
    })
    void sync().project.loadSessions(directory)
  }
}

function TagList(props: { tags: readonly string[]; compact?: boolean }) {
  return (
    <div class="flex min-w-0 flex-wrap gap-1.5">
      <For each={props.tags}>
        {(tag) => (
          <span
            class="rounded-[5px] border border-v2-border-border-base bg-v2-background-bg-layer-02 text-v2-text-text-muted"
            classList={{
              "px-2 py-1 text-[11px] leading-3": props.compact,
              "px-2.5 py-1 text-[12px] leading-4": !props.compact,
            }}
          >
            {tag}
          </span>
        )}
      </For>
    </div>
  )
}

function MemberCard(props: { member: TeamMember }) {
  const avatar = createMemo(() => cmccMemberAvatarUrl(props.member))

  return (
    <div class="min-w-0 rounded-[6px] border border-v2-border-border-base bg-v2-background-bg-layer-01 p-3">
      <div class="flex min-w-0 items-start justify-between gap-3">
        <div class="flex min-w-0 items-center gap-3">
          <Show
            when={avatar()}
            fallback={
              <div class="flex size-10 shrink-0 items-center justify-center rounded-full bg-v2-background-bg-layer-03 text-[13px] font-semibold text-v2-text-text-base">
                {props.member.name.slice(0, 1)}
              </div>
            }
          >
            {(source) => <img src={source()} alt="" class="size-10 shrink-0 rounded-full object-cover" />}
          </Show>
          <div class="min-w-0">
            <div class="truncate text-[14px] font-medium leading-5 text-v2-text-text-base">{props.member.name}</div>
            <div class="truncate text-[12px] leading-4 text-v2-text-text-muted">{props.member.profession}</div>
          </div>
        </div>
        <Show when={props.member.role === "lead"}>
          <span class="rounded-[4px] bg-v2-background-bg-layer-03 px-2 py-1 text-[11px] leading-3 text-v2-text-text-muted">
            主理人
          </span>
        </Show>
      </div>
      <div class="mt-3 truncate font-mono text-[11px] leading-4 text-v2-text-text-faint">{props.member.id}</div>
    </div>
  )
}

function DialogMember(props: { member: TeamMember }) {
  const avatar = createMemo(() => cmccMemberAvatarUrl(props.member))

  return (
    <div class="flex min-w-0 items-center gap-2 rounded-full border border-[#e5e7ef] bg-[#fff] p-1 pr-3">
      <Show
        when={avatar()}
        fallback={
          <div class="flex size-9 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(145deg,#8d77ff,#536dff)] text-[12px] font-semibold text-[#fff] shadow-[0_3px_8px_rgba(83,109,255,0.2)]">
            {props.member.name.slice(0, 1)}
          </div>
        }
      >
        {(source) => <img src={source()} alt="" class="size-9 shrink-0 rounded-full object-cover" />}
      </Show>
      <div class="min-w-0">
        <div class="truncate text-[12px] font-medium leading-4 text-[#252839]">{props.member.profession}</div>
        <div class="truncate text-[11px] leading-4 text-[#8b91a3]">{props.member.name}</div>
      </div>
    </div>
  )
}
