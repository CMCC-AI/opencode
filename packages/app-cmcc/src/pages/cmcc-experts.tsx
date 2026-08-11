import { Navigate, useNavigate, useParams } from "@solidjs/router"
import { Icon } from "@opencode-ai/ui/icon"
import { createMemo, createSignal, For, Show } from "solid-js"
import { Portal } from "solid-js/web"
import { useServer } from "@/context/server"
import { useDockApi } from "@/context/dockapi"
import { useServerSDK } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"
import { useTabs } from "@/context/tabs"
import {
  CMCC_EXPERTS,
  CMCC_TEAM_EXPERTS,
  cmccExpertCenterHref,
  cmccExpertHref,
  type CmccExpert,
  type ExternalExpert,
  type TeamExpert,
  type TeamMember,
} from "@/utils/cmcc-experts"
import { showToast } from "@/utils/toast"

export { CMCC_EXPERTS, cmccExpertCenterHref, cmccExpertHref }

export function CmccExpertCenterRoute() {
  const navigate = useNavigate()
  const launch = useCmccExpertDraftLauncher()
  const [active, setActive] = createSignal<CmccExpert>()
  const externalExperts = createMemo(() => CMCC_EXPERTS.filter((expert): expert is ExternalExpert => expert.kind === "external"))

  return (
    <div class="min-h-0 flex-1 overflow-y-auto bg-v2-background-bg-deep">
      <div class="mx-auto flex w-full max-w-[1180px] flex-col gap-6 px-6 py-6">
        <div class="flex min-w-0 flex-wrap items-end justify-between gap-4">
          <div class="flex min-w-0 flex-col gap-2">
            <div class="flex items-center gap-2 text-[13px] leading-4 text-v2-text-text-muted">
              <Icon name="mcp" class="size-4" />
              <span>专家中心</span>
            </div>
            <h1 class="m-0 text-[26px] font-semibold leading-8 text-v2-text-text-base">召唤专家或专家团</h1>
            <p class="m-0 max-w-[760px] text-[14px] leading-6 text-v2-text-text-muted">
              选择一个专家团查看成员和示例问题，召唤后会进入新建对话，并在输入框左侧显示已召唤的专家团。
            </p>
          </div>
          <div class="flex h-8 items-center rounded-[8px] bg-v2-background-bg-layer-01 p-1 text-[12px] leading-4 text-v2-text-text-muted">
            <span class="rounded-[6px] bg-v2-background-bg-layer-03 px-3 py-1 text-v2-text-text-base">专家</span>
            <span class="px-3 py-1">技能</span>
            <span class="px-3 py-1">连接器</span>
          </div>
        </div>

        <section class="flex min-w-0 flex-col gap-3">
          <div class="flex items-center justify-between">
            <h2 class="m-0 text-[17px] font-semibold leading-6 text-v2-text-text-base">精选场景</h2>
          </div>
          <div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            <For each={CMCC_EXPERTS}>
              {(expert) => <ExpertCard expert={expert} onClick={() => setActive(expert)} />}
            </For>
          </div>
        </section>

        <section class="flex min-w-0 flex-col gap-3">
          <div class="flex items-center gap-4">
            <h2 class="m-0 text-[17px] font-semibold leading-6 text-v2-text-text-base">专家团</h2>
            <span class="text-[12px] leading-4 text-v2-text-text-muted">{CMCC_TEAM_EXPERTS.length} 个本地专家团</span>
          </div>
          <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
            <For each={CMCC_TEAM_EXPERTS}>
              {(expert) => <ExpertCard expert={expert} wide onClick={() => setActive(expert)} />}
            </For>
          </div>
        </section>

        <section class="flex min-w-0 flex-col gap-3">
          <div class="flex items-center gap-4">
            <h2 class="m-0 text-[17px] font-semibold leading-6 text-v2-text-text-base">专家应用</h2>
            <span class="text-[12px] leading-4 text-v2-text-text-muted">{externalExperts().length} 个外部专家入口</span>
          </div>
          <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
            <For each={externalExperts()}>
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
        class="min-h-0 flex-1 border-0 bg-white"
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

function ExpertCard(props: { expert: CmccExpert; wide?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      class="min-w-0 rounded-[8px] border border-v2-border-border-base bg-v2-background-bg-layer-01 p-4 text-left shadow-[var(--v2-elevation-flat)] hover:border-v2-border-border-strong hover:bg-v2-background-bg-layer-02"
      classList={{ "md:min-h-[132px]": props.wide }}
      onClick={props.onClick}
    >
      <div class="flex min-w-0 items-start gap-3">
        <ExpertMark expert={props.expert} />
        <div class="min-w-0 flex-1">
          <div class="flex min-w-0 items-center gap-2">
            <h3 class="m-0 truncate text-[15px] font-semibold leading-5 text-v2-text-text-base">{props.expert.name}</h3>
            <Show when={props.expert.kind === "team"}>
              <span class="shrink-0 rounded-[4px] bg-v2-background-bg-layer-03 px-1.5 py-0.5 text-[11px] leading-3 text-v2-text-text-muted">
                专家团
              </span>
            </Show>
          </div>
          <p class="mt-2 line-clamp-2 text-[12px] leading-5 text-v2-text-text-muted">{props.expert.description}</p>
        </div>
      </div>
      <div class="mt-3">
        <TagList tags={props.expert.tags} compact />
      </div>
    </button>
  )
}

function ExpertDetailDialog(props: {
  expert: CmccExpert
  onClose: () => void
  onOpenExternal: (expert: ExternalExpert) => void
  onSummon: (expert: TeamExpert, prompt?: string) => void
}) {
  return (
    <Portal>
      <div class="fixed inset-0 z-[220] flex items-center justify-center bg-black/55 px-4 py-5" onClick={props.onClose}>
        <section
          class="flex max-h-[min(780px,calc(100dvh-32px))] w-full max-w-[560px] flex-col overflow-hidden rounded-[14px] border border-v2-border-border-base bg-v2-background-bg-layer-01 shadow-[0_24px_80px_rgba(0,0,0,0.32)]"
          onClick={(event) => event.stopPropagation()}
        >
          <header class="flex shrink-0 items-start justify-between gap-4 px-5 py-5">
            <div class="flex min-w-0 items-start gap-4">
              <ExpertMark expert={props.expert} large />
              <div class="min-w-0">
                <h2 class="m-0 text-[20px] font-semibold leading-7 text-v2-text-text-base">{props.expert.name}</h2>
                <div class="mt-1 text-[13px] leading-5 text-v2-text-text-muted">
                  {props.expert.kind === "team" ? `${props.expert.members.length} 位成员` : "专家应用"}
                </div>
                <TagList tags={props.expert.tags} />
              </div>
            </div>
            <button
              type="button"
              class="flex size-8 shrink-0 items-center justify-center rounded-[7px] text-v2-icon-icon-muted hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-icon-icon-base"
              onClick={props.onClose}
              aria-label="关闭专家详情"
            >
              <Icon name="close" class="size-4" />
            </button>
          </header>

          <div class="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
            <section class="flex flex-col gap-2">
              <h3 class="m-0 text-[13px] font-semibold leading-5 text-v2-text-text-base">能力介绍</h3>
              <p class="m-0 text-[14px] leading-6 text-v2-text-text-muted">{props.expert.description}</p>
            </section>

            <Show when={props.expert.kind === "team" ? props.expert : undefined}>
              {(item) => (
                <>
                  <section class="mt-5 flex flex-col gap-3">
                    <h3 class="m-0 text-[13px] font-semibold leading-5 text-v2-text-text-base">团队成员</h3>
                    <div class="flex flex-col divide-y divide-v2-border-border-base rounded-[8px] border border-v2-border-border-base">
                      <For each={item().members.slice(0, 8)}>{(member) => <MemberRow member={member} />}</For>
                    </div>
                  </section>

                  <section class="mt-5 flex flex-col gap-3">
                    <h3 class="m-0 text-[13px] font-semibold leading-5 text-v2-text-text-base">试试这样问我</h3>
                    <div class="flex flex-col gap-2">
                      <For each={item().examples}>
                        {(example) => (
                          <button
                            type="button"
                            class="flex min-h-10 items-center justify-between gap-3 rounded-[8px] border border-v2-border-border-base px-3 py-2 text-left text-[13px] leading-5 text-v2-text-text-base hover:bg-v2-overlay-simple-overlay-hover"
                            onClick={() => props.onSummon(item(), example)}
                          >
                            <span class="min-w-0 truncate">“{example}”</span>
                            <Icon name="chevron-right" size="small" class="size-3.5 shrink-0 text-v2-icon-icon-muted" />
                          </button>
                        )}
                      </For>
                    </div>
                  </section>
                </>
              )}
            </Show>
          </div>

          <footer class="shrink-0 px-5 pb-5">
            <Show
              when={props.expert.kind === "team" ? props.expert : undefined}
              fallback={
                <button
                  type="button"
                  class="flex h-11 w-full items-center justify-center gap-2 rounded-[8px] bg-v2-text-text-base px-4 text-[14px] font-semibold leading-5 text-v2-background-bg-layer-01 hover:opacity-90"
                  onClick={() => props.onOpenExternal(props.expert as ExternalExpert)}
                >
                  打开 {props.expert.name}
                </button>
              }
            >
              {(item) => (
                <button
                  type="button"
                  class="flex h-11 w-full items-center justify-center gap-2 rounded-[8px] bg-v2-text-text-base px-4 text-[14px] font-semibold leading-5 text-v2-background-bg-layer-01 hover:opacity-90"
                  onClick={() => props.onSummon(item())}
                >
                  召唤 {item().name}
                </button>
              )}
            </Show>
          </footer>
        </section>
      </div>
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
    const dir = dockapi.workspace?.directoryPath
    if (!dir || !tabs.ready()) return

    const agents = await serverSDK()
      .client.app.agents({ directory: dir }, { throwOnError: true })
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

    void sync().project.loadSessions(dir)
    tabs.newDraft({ server: server.key, directory: dir }, prompt, { agent: expert.leadAgent })
  }
}

function TagList(props: { tags: readonly string[]; compact?: boolean }) {
  return (
    <div class="flex min-w-0 flex-wrap gap-1.5">
      <For each={props.tags}>
        {(tag) => (
          <span
            class="rounded-[5px] border border-v2-border-border-base bg-v2-background-bg-layer-02 text-v2-text-text-muted"
            classList={{ "px-2 py-1 text-[11px] leading-3": props.compact, "px-2.5 py-1 text-[12px] leading-4": !props.compact }}
          >
            {tag}
          </span>
        )}
      </For>
    </div>
  )
}

function MemberCard(props: { member: TeamMember }) {
  return (
    <div class="min-w-0 rounded-[6px] border border-v2-border-border-base bg-v2-background-bg-layer-01 p-3">
      <div class="flex min-w-0 items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="truncate text-[14px] font-medium leading-5 text-v2-text-text-base">{props.member.name}</div>
          <div class="truncate text-[12px] leading-4 text-v2-text-text-muted">{props.member.profession}</div>
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

function MemberRow(props: { member: TeamMember }) {
  return (
    <div class="flex min-w-0 items-center gap-3 px-3 py-2">
      <div class="flex size-7 shrink-0 items-center justify-center rounded-[6px] bg-v2-background-bg-layer-03 text-[12px] font-semibold text-v2-text-text-base">
        {props.member.name.slice(0, 1)}
      </div>
      <div class="min-w-0 flex-1">
        <div class="truncate text-[13px] font-medium leading-5 text-v2-text-text-base">{props.member.name}</div>
        <div class="truncate text-[12px] leading-4 text-v2-text-text-muted">{props.member.profession}</div>
      </div>
      <Show when={props.member.role === "lead"}>
        <span class="rounded-[4px] bg-v2-background-bg-layer-03 px-2 py-1 text-[11px] leading-3 text-v2-text-text-muted">
          主理人
        </span>
      </Show>
    </div>
  )
}

function ExpertMark(props: { expert: CmccExpert; large?: boolean }) {
  return (
    <div
      class="flex shrink-0 items-center justify-center rounded-[12px] bg-v2-background-bg-layer-03 text-v2-text-text-base shadow-sm"
      classList={{ "size-14 text-[18px] font-semibold": props.large, "size-10 text-[14px] font-semibold": !props.large }}
    >
      {props.expert.kind === "team" ? props.expert.name.slice(0, 2) : props.expert.name.slice(0, 1)}
    </div>
  )
}
