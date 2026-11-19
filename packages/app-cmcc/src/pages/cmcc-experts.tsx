import { Navigate, useNavigate, useParams } from "@solidjs/router"
import { Icon } from "@opencode-ai/ui/icon"
import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import { Portal } from "solid-js/web"
import { CmccPageBrandBar } from "@/components/cmcc-page-brand-bar"
import { useServer } from "@/context/server"
import { useDockApi } from "@/context/dockapi"
import { useServerSDK } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"
import { useTabs } from "@/context/tabs"
import expertFinance from "@/assets/experts/scene-13.optimized.webp"
import expertGeneral from "@/assets/experts/scene-15.optimized.webp"
import expertIndustry from "@/assets/experts/scene-06.optimized.webp"
import expertZhengqi from "@/assets/experts/scene-08.optimized.webp"
import expertLocation from "@/assets/experts/scene-14.optimized.webp"
import expertResearch from "@/assets/experts/scene-17.optimized.webp"
import expertHero from "@/assets/experts/scene-05.optimized.webp"
import overviewFinance from "@/assets/experts/overview-deeptrading.webp"
import overviewZhengqi from "@/assets/experts/overview-zhengqi-visit-intel.webp"
import overviewInspect from "@/assets/experts/overview-deepinspect.webp"
import overviewRecommend from "@/assets/experts/overview-shoppers-pro.webp"
import overviewResearch from "@/assets/experts/overview-ai-for-science-team.webp"
import overviewLocation from "@/assets/experts/overview-deepgeo.webp"
import overviewBannerBadges from "@/assets/experts/overview-banner-badges.svg"
import overviewCreateTask from "@/assets/experts/overview-create-task.svg"
import shoppersDemoGif from "@/assets/experts/shoppers-demo.optimized.webp"
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
import { createDialogMotion } from "@/components/cmcc-motion"
import "./cmcc-overview-layout.css"
import "./cmcc-experts.css"

export { CMCC_EXPERTS, cmccExpertCenterHref, cmccExpertHref }

const EXPERT_PRESENTATION: Record<string, { eyebrow: string; summary: string; image: string; overviewImage?: string }> = {
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
    overviewImage: overviewFinance,
  },
  "shoppers-pro": {
    eyebrow: "AI + 推荐",
    summary: "务实需求洞察、多平台比价、真实口碑分析，交付可点击的购买决策报告",
    image: expertHero,
    overviewImage: overviewRecommend,
  },
  deepinspect: {
    eyebrow: "AI + 巡察",
    summary: "多智能体协作完成现场风险识别、问题归并与结构化巡察报告交付",
    image: expertIndustry,
    overviewImage: overviewInspect,
  },
  "zhengqi-visit-intel": {
    eyebrow: "AI + 政企",
    summary: "融合内部门户数据与公开情报，交付可溯源的谈参高拜决策报告",
    image: expertZhengqi,
    overviewImage: overviewZhengqi,
  },
  deepgeo: {
    eyebrow: "AI + 位置",
    summary: "把客流、客群、商业生态与财务数据转化为可复算的位置决策报告",
    image: expertLocation,
    overviewImage: overviewLocation,
  },
  "ai-for-science-team": {
    eyebrow: "AI + 科研",
    summary: "文献综述、论文复现、实验设计与科研写作，交付可审计研究包",
    image: expertResearch,
    overviewImage: overviewResearch,
  },
}

const INDUSTRY_ORDER = ["deeptrading", "zhengqi-visit-intel", "ai-for-science-team", "deepgeo", "shoppers-pro", "deepinspect"]
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
    <div class="cmcc-expert-banner">
      <div class="cmcc-expert-banner-dots">
        <For each={props.experts}>
          {(expert, i) => (
            <button
              type="button"
              class="cmcc-expert-banner-dot"
              aria-label={`查看${expert.name}`}
              aria-pressed={i() === index() % total()}
              onClick={() => setIndex(i())}
            />
          )}
        </For>
      </div>
      <img class="cmcc-expert-banner-badges" src={overviewBannerBadges} alt="" width={379} height={60} />
      <div class="cmcc-expert-banner-actions">
        <div class="cmcc-expert-banner-copy">
          <div class="cmcc-expert-banner-title">{current().name}</div>
          <p class="line-clamp-2">{current().description}</p>
        </div>
        <button
          type="button"
          aria-label="创建任务"
          class="cmcc-expert-create"
          onClick={() => props.onOpen(current())}
        >
          <img src={overviewCreateTask} alt="" width="142" height="48" />
        </button>
      </div>
    </div>
  )
}

export function CmccExpertCenterRoute() {
  const navigate = useNavigate()
  const launch = useCmccExpertDraftLauncher()
  const [active, setActive] = createSignal<CmccExpert>()

  return (
    <div class="cmcc-expert-center cmcc-overview-page relative min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
      <CmccPageBrandBar />
      <div class="cmcc-expert-content">
        <header class="cmcc-expert-intro cmcc-overview-intro">
          <h1>产业洞察专家团</h1>
          <p>让 AI 进入真实产业场景，完成研究、判断与行动</p>
        </header>

        <FeaturedCarousel experts={CMCC_TEAM_EXPERTS.filter((e) => e.id !== "deepinsight")} onOpen={(expert) => setActive(expert)} />

        <section class="cmcc-expert-directory">
          <h2>AI + 产业洞察</h2>
          <p>选择一个专家或专家团，进入专属工作台</p>
          <div class="cmcc-expert-grid">
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
    overviewImage: undefined,
  }

  return (
    <button
      type="button"
      class="cmcc-expert-card"
      onClick={props.onClick}
    >
      <img
        src={presentation.overviewImage ?? presentation.image}
        alt=""
        width="60"
        height="65"
      />
      <div class="cmcc-expert-card-copy">
        <h3>{presentation.eyebrow}</h3>
        <p title={presentation.summary}>{presentation.summary}</p>
      </div>
    </button>
  )
}

function GifDemoModal(props: { onClose: () => void }) {
  const motion = createDialogMotion(props.onClose)
  return (
    <Portal>
      <div
        class="cmcc-modal-overlay fixed inset-0 z-[230] flex items-center justify-center px-4 py-4"
        style={motion.overlay()}
        onClick={motion.close}
      >
        <div
          class="relative flex max-h-[90dvh] max-w-[420px] flex-col overflow-hidden rounded-[16px] bg-[#fff] shadow-[0_28px_90px_rgba(24,14,57,0.35)]"
          role="dialog"
          aria-modal="true"
          aria-label="手机演示"
          data-cmcc-dialog
          inert={motion.closing()}
          style={motion.content()}
          onClick={(event) => event.stopPropagation()}
        >
          <header class="flex h-12 shrink-0 items-center justify-between border-b border-[#edf0f7] px-5">
            <h3 class="m-0 text-[14px] font-semibold leading-5 text-[#252839]">手机演示</h3>
            <button
              type="button"
              class="flex size-7 shrink-0 items-center justify-center rounded-[6px] text-[#697085] transition hover:bg-[#f3f5fa] hover:text-[#252839]"
              onClick={motion.close}
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
  const motion = createDialogMotion(props.onClose)
  const presentation = createMemo(
    () =>
      EXPERT_PRESENTATION[props.expert.id] ?? {
        eyebrow: props.expert.name,
        summary: props.expert.description,
        image: expertGeneral,
        overviewImage: undefined,
      },
  )
  const brand = () => props.expert.name.replace(/\s+\p{Script=Han}.*$/u, "")
  const capabilities = createMemo(() =>
    props.expert.tags.slice(0, 3).map((tag, index) => ({
      title: tag,
      description:
        props.expert.kind === "team"
          ? (props.expert.examples[index] ?? props.expert.description)
          : props.expert.description,
    })),
  )
  const [showDemo, setShowDemo] = createSignal(false)

  return (
    <Portal>
      <div
        class="cmcc-expert-task-overlay fixed inset-0 z-[220] flex items-center justify-center px-4 py-4"
        style={motion.overlay()}
        onClick={motion.close}
      >
        <section
          class="cmcc-expert-dialog flex h-[600px] max-h-[calc(100dvh-32px)] w-full max-w-[800px] flex-col overflow-hidden"
          role="dialog"
          aria-modal="true"
          aria-label={presentation().eyebrow}
          data-cmcc-dialog
          inert={motion.closing()}
          style={motion.content()}
          onClick={(event) => event.stopPropagation()}
        >
          <header class="cmcc-expert-dialog-header">
            <h2>{presentation().eyebrow}</h2>
            <button
              type="button"
              class="cmcc-expert-dialog-close"
              onClick={motion.close}
              aria-label="关闭专家详情"
            >
              <Icon name="close" class="size-5" />
            </button>
          </header>

          <div class="cmcc-expert-dialog-scroll">
            <div class="cmcc-expert-dialog-content">
              <section class="cmcc-expert-summary">
                <div class="cmcc-expert-summary-heading">
                  <img src={presentation().overviewImage ?? presentation().image} alt="" width={51} height={55} />
                  <h3>{presentation().eyebrow}</h3>
                  <span class="cmcc-expert-summary-brand" title={props.expert.name}>
                    <Icon name="circle-check" size="small" />
                    {brand()}
                  </span>
                </div>
                <p>{props.expert.description}</p>
              </section>

              <section class="cmcc-expert-dialog-section">
                <h3>专家团技能:</h3>
                <div class="cmcc-expert-skill-grid">
                  <For each={capabilities()}>
                    {(capability, index) => (
                      <button
                        type="button"
                        class="cmcc-expert-skill"
                        title={capability.description}
                        onClick={() => {
                          if (props.expert.kind === "team") {
                            props.onSummon(props.expert, props.expert.examples[index()] ?? props.expert.defaultPrompt)
                            return
                          }
                          props.onOpenExternal(props.expert)
                        }}
                      >
                        <span>{capability.title}</span>
                        <span class="line-clamp-2">{capability.description}</span>
                      </button>
                    )}
                  </For>
                </div>
              </section>

              <Show when={props.expert.kind === "team" ? props.expert : undefined}>
                {(item) => (
                  <section class="cmcc-expert-dialog-section">
                    <h3>专家协作:</h3>
                    <div class="cmcc-expert-member-grid">
                      <For each={item().members.filter((m) => m.id !== "deeptrading/dt-trader")}>{(member) => <DialogMember member={member} />}</For>
                    </div>
                  </section>
                )}
              </Show>
            </div>
          </div>

          <footer class="cmcc-expert-dialog-footer">
            <Show when={props.expert.id === "deeptrading"}>
              <button type="button" class="cmcc-expert-primary mr-auto" onClick={() => { props.onClose(); navigate("/mstock") }}>
                多股对比
              </button>
            </Show>
            <Show when={props.expert.id === "shoppers-pro"}>
              <button
                type="button"
                class="cmcc-expert-secondary mr-auto"
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
            <div class="cmcc-expert-dialog-actions">
              <button
                type="button"
                class="cmcc-expert-secondary"
                onClick={motion.close}
              >
                取消
              </button>
              <Show
                when={props.expert.kind === "team" ? props.expert : undefined}
                fallback={
                  <button
                    type="button"
                    class="cmcc-expert-primary"
                    onClick={() => props.onOpenExternal(props.expert as ExternalExpert)}
                  >
                    打开 {props.expert.name}
                  </button>
                }
              >
                {(item) => (
                  <button
                    type="button"
                    class="cmcc-expert-primary"
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

    tabs.newDraft({ server: server.key, directory, artifactDirectory, homeTeamPicker: true, expertID: expert.id }, prompt, {
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
    <div class="cmcc-expert-dialog-member">
      <Show
        when={avatar()}
        fallback={
          <div class="cmcc-expert-member-avatar cmcc-expert-member-initial">
            {props.member.name.slice(0, 1)}
          </div>
        }
      >
        {(source) => <img src={source()} alt="" class="cmcc-expert-member-avatar" />}
      </Show>
      <div class="min-w-0">
        <div class="truncate text-[12px] font-medium leading-4 text-[#242635]" title={props.member.profession}>{props.member.profession}</div>
        <div class="truncate text-[11px] leading-4 text-[#737780]" title={props.member.name}>{props.member.name}</div>
      </div>
    </div>
  )
}
