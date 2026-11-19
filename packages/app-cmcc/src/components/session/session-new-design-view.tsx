import { children, For, Show, type JSX } from "solid-js"
import { DropdownMenu } from "@opencode-ai/ui/dropdown-menu"
import { Icon } from "@opencode-ai/ui/icon"
import lingxiAvatar from "@/assets/chat/draft-lingxi.png"
import { CmccPageBrandBar } from "@/components/cmcc-page-brand-bar"
import { CMCC_DEFAULT_RESEARCH_EXPERT, CMCC_TEAM_EXPERTS, type TeamExpert } from "@/utils/cmcc-experts"
import "./session-new-design-view.css"

const homeTeamChoices = CMCC_TEAM_EXPERTS.filter((team) => team.id !== "ai-for-science-team")

const teamAvatars = import.meta.glob<string>("../../assets/chat/team-avatars/*.png", {
  eager: true,
  import: "default",
  query: "?url",
})

export function NewSessionComposerLoading() {
  return (
    <div
      role="status"
      aria-label="正在准备对话"
      class="cmcc-home-composer-surface flex w-full flex-col justify-between px-4 py-3"
    >
      <div aria-hidden="true" class="h-3 w-48 max-w-full rounded bg-surface-base" />
      <div aria-hidden="true" class="h-3 w-24 rounded bg-surface-base" />
    </div>
  )
}

export function NewSessionLoading(props: { team?: TeamExpert; teamPicker?: boolean } = {}) {
  return (
    <NewSessionDesignView team={props.team} teamPicker={props.teamPicker}>
      <NewSessionComposerLoading />
    </NewSessionDesignView>
  )
}

function TeamAvatar(props: { team?: TeamExpert }) {
  const artwork = () => props.team ? teamAvatars[`../../assets/chat/team-avatars/${props.team.id}.png`] : lingxiAvatar
  return (
    <span class="cmcc-home-team-avatar" aria-hidden="true">
      <Show when={artwork()} fallback={<Icon name="mcp" />}>
        {(src) => <img src={src()} width={36} height={36} alt="" />}
      </Show>
    </span>
  )
}

export function NewSessionDesignView(props: {
  children: JSX.Element
  footer?: JSX.Element
  team?: TeamExpert
  teamPicker?: boolean
  onTeamChange?: (team?: TeamExpert) => void
  teamDisabled?: boolean
}) {
  const footer = children(() => props.footer)
  const name = () => props.team?.name ?? "灵犀"
  const choice = (team?: TeamExpert) => (
    <DropdownMenu.Item
      class="cmcc-home-team-item"
      onSelect={() => props.onTeamChange?.(team)}
      data-selected-team={props.team?.id === team?.id ? "" : undefined}
    >
      <TeamAvatar team={team} />
      <DropdownMenu.ItemLabel>{team?.name ?? "灵犀"}</DropdownMenu.ItemLabel>
      <Show when={props.team?.id === team?.id}><Icon name="check" size="small" /></Show>
    </DropdownMenu.Item>
  )
  return (
    <div
      data-component="session-new-design"
      data-home-mode={props.onTeamChange || props.teamPicker || props.team?.id === CMCC_DEFAULT_RESEARCH_EXPERT.id ? "research" : "chat"}
      class="cmcc-home relative grid size-full min-h-0 min-w-0 justify-items-center overflow-y-auto"
    >
      <CmccPageBrandBar />
      <div class="cmcc-home-heading">
        <div class="cmcc-home-greeting">
          <TeamAvatar team={props.team} />
          <div class="cmcc-home-greeting-line">
            <span>{props.team ? "您好，我是您的 " : "您好，我是 "}</span>
            <Show when={props.onTeamChange} fallback={<strong>{name()}</strong>}>
              <DropdownMenu modal={false} placement="bottom-start" gutter={6} overflowPadding={12} fitViewport>
                <DropdownMenu.Trigger type="button" class="cmcc-home-team-trigger" aria-label={`切换专家团，当前：${name()}`} disabled={props.teamDisabled}>
                  <strong>{name()}</strong>
                  <Icon name="chevron-down" size="small" />
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content aria-label="切换专家团" class="cmcc-home-team-menu">
                    <For each={homeTeamChoices}>{(team) => choice(team)}</For>
                    {choice()}
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu>
            </Show>
          </div>
        </div>
        <div class="cmcc-home-brand">
          <h1>DeepInsight深度洞察</h1>
        </div>
        <p>您的私人研究助理，一键生成博士级深度研究报告，AI赋能产业洞察</p>
      </div>
      <div class="cmcc-home-composer relative z-10 mx-auto">{props.children}</div>
      <Show when={footer()} fallback={<div aria-hidden="true" />}>
        <div class="cmcc-home-footer w-full min-w-0 self-start">{footer()}</div>
      </Show>
    </div>
  )
}
