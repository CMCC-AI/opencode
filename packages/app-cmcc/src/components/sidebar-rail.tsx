import { IconButton } from "@opencode-ai/ui/icon-button"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { useLocation, useNavigate } from "@solidjs/router"
import { For } from "solid-js"
import { useDockApi } from "@cmcc/dockapi"

const items = [
  { label: "专家团", icon: "glasses" as const, href: "/expert" },
  { label: "知识库", icon: "brain" as const, href: "/knowledge" },
  { label: "插件中心", icon: "mcp" as const, href: "/plugins" },
]

export function CmccSidebarRail(props: { mobile?: boolean }) {
  const dockapi = useDockApi()
  const location = useLocation()
  const navigate = useNavigate()
  return (
    <div class="flex w-full flex-col items-center gap-2 border-b border-border-weaker-base pb-3">
      <For each={items}>
        {(item) => (
          <Tooltip placement={props.mobile ? "bottom" : "right"} value={item.label}>
            <IconButton
              icon={item.icon}
              variant={location.pathname.startsWith(item.href) ? "primary" : "ghost"}
              size="large"
              aria-label={item.label}
              onClick={() => navigate(item.href)}
            />
          </Tooltip>
        )}
      </For>
      <Tooltip placement={props.mobile ? "bottom" : "right"} value={`退出登录 · ${dockapi.user?.name ?? "当前用户"}`}>
        <IconButton
          icon="arrow-left"
          variant="ghost"
          size="large"
          aria-label="退出登录"
          onClick={() => void dockapi.auth.logout()}
        />
      </Tooltip>
    </div>
  )
}
