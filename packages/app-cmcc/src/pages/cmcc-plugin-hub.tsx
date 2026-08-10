import type { McpLocalConfig, McpRemoteConfig, McpStatus } from "@opencode-ai/sdk/v2/client"
import { Icon } from "@opencode-ai/ui/icon"
import { useQuery, useQueryClient } from "@tanstack/solid-query"
import { createMemo, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { directoryKey, showToast, useServerSDK, useServerSync } from "@opencode-ai/app/extension"
import { cmccDefaultWorkspace } from "@cmcc/utils/cmcc-workspace"

type HubTab = "skills" | "mcp"

const mcpStatusLabel: Record<McpStatus["status"], string> = {
  connected: "已连接",
  failed: "异常",
  needs_auth: "需要授权",
  needs_client_registration: "需要注册",
  disabled: "未启用",
}

type CmccMcpStatus = McpStatus | { status: "pending" }

export function CmccPluginHubRoute() {
  const serverSDK = useServerSDK()
  const sync = useServerSync()
  const queryClient = useQueryClient()
  const directory = createMemo(() => cmccDefaultWorkspace(sync().data.path.home))
  const activeDirectory = createMemo(() => directory() ?? "")
  const [state, setState] = createStore({
    tab: "skills" as HubTab,
    query: "",
    addSkillOpen: false,
    addMcpOpen: false,
    mcpKind: "remote" as "remote" | "local",
    mcpName: "",
    mcpUrl: "",
    mcpCommand: "",
    mcpEnvironment: "",
    savingMcp: false,
  })

  const skills = useQuery(() => ({
    queryKey: [serverSDK().scope, activeDirectory(), "cmcc-plugin-hub", "skills"] as const,
    queryFn: () =>
      serverSDK()
        .createClient({ directory: activeDirectory(), throwOnError: true })
        .app.skills()
        .then((r) => r.data ?? []),
    enabled: Boolean(activeDirectory()),
  }))

  const child = createMemo(() => sync().child(activeDirectory(), { bootstrap: false, mcp: true })[0])
  const mcps = createMemo(() =>
    Object.entries(child().mcp ?? {})
      .map(([name, status]) => ({ name, status }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  )
  const filteredSkills = createMemo(() => {
    const q = state.query.trim().toLowerCase()
    const list = skills.data ?? []
    if (!q) return list
    return list.filter(
      (skill) =>
        skill.name.toLowerCase().includes(q) ||
        skill.location.toLowerCase().includes(q) ||
        skill.description?.toLowerCase().includes(q),
    )
  })
  const filteredMcps = createMemo(() => {
    const q = state.query.trim().toLowerCase()
    const list = mcps()
    if (!q) return list
    return list.filter((mcp) => mcp.name.toLowerCase().includes(q) || mcp.status.status.toLowerCase().includes(q))
  })

  const addMcp = async () => {
    const name = state.mcpName.trim()
    if (!name) return showToast({ title: "请输入 MCP 名称" })

    const config = mcpConfig()
    if (!config) return

    setState("savingMcp", true)
    await serverSDK()
      .createClient({ directory: activeDirectory(), throwOnError: true })
      .mcp.add({ name, config })
      .then(async () => {
        await queryClient.refetchQueries(sync().queryOptions.mcp(directoryKey(activeDirectory())))
        setState({
          addMcpOpen: false,
          mcpName: "",
          mcpUrl: "",
          mcpCommand: "",
          mcpEnvironment: "",
          savingMcp: false,
        })
        showToast({ variant: "success", title: `已添加 MCP：${name}` })
      })
      .catch((error) => {
        setState("savingMcp", false)
        showToast({ variant: "error", title: "添加 MCP 失败", description: error instanceof Error ? error.message : undefined })
      })
  }

  const mcpConfig = (): McpRemoteConfig | McpLocalConfig | undefined => {
    if (state.mcpKind === "remote") {
      const url = state.mcpUrl.trim()
      if (!url) {
        showToast({ title: "请输入远程 MCP URL" })
        return
      }
      return { type: "remote", url, enabled: true }
    }

    const command = state.mcpCommand.trim().split(/\s+/).filter(Boolean)
    if (command.length === 0) {
      showToast({ title: "请输入本地 MCP 启动命令" })
      return
    }
    return { type: "local", command, enabled: true, environment: parseEnvironment(state.mcpEnvironment) }
  }

  return (
    <div class="min-h-0 flex-1 overflow-y-auto bg-v2-background-bg-deep">
      <div class="mx-auto flex w-full max-w-[1280px] flex-col gap-5 px-6 py-6">
        <div class="flex min-w-0 flex-wrap items-center justify-between gap-3">
          <div class="flex min-w-0 items-center gap-2">
            <TabButton label="技能" active={state.tab === "skills"} onClick={() => setState("tab", "skills")} />
            <TabButton label="连接器" active={state.tab === "mcp"} onClick={() => setState("tab", "mcp")} />
          </div>
          <div class="flex min-w-0 items-center gap-2">
            <label class="flex h-8 w-[260px] min-w-0 items-center gap-2 rounded-[6px] border border-v2-border-border-base bg-v2-background-bg-layer-01 px-2 text-v2-text-text-muted">
              <Icon name="magnifying-glass" class="size-4 shrink-0" />
              <input
                class="min-w-0 flex-1 bg-transparent text-[13px] leading-4 text-v2-text-text-base outline-none placeholder:text-v2-text-text-faint"
                placeholder={state.tab === "skills" ? "搜索技能" : "搜索连接器"}
                value={state.query}
                onInput={(event) => setState("query", event.currentTarget.value)}
              />
            </label>
            <button
              type="button"
              class="flex h-8 shrink-0 items-center gap-1 rounded-[6px] bg-v2-background-bg-layer-03 px-3 text-[13px] leading-4 text-v2-text-text-base hover:bg-v2-overlay-simple-overlay-hover"
              onClick={() => (state.tab === "skills" ? setState("addSkillOpen", true) : setState("addMcpOpen", true))}
            >
              <Icon name="plus" class="size-4" />
              {state.tab === "skills" ? "添加技能" : "添加 MCP"}
            </button>
          </div>
        </div>

        <Show when={state.tab === "skills"} fallback={<McpPanel items={filteredMcps()} />}>
          <SkillPanel items={filteredSkills()} loading={skills.isLoading} />
        </Show>
      </div>

      <Show when={state.addSkillOpen}>
        <Overlay title="添加技能" close={() => setState("addSkillOpen", false)}>
          <div class="flex flex-col gap-3 text-[13px] leading-5 text-v2-text-text-muted">
            <p>当前后端支持读取 Skills，但还没有公开的写入接口。可以把技能放到 DeepInsight Skills 目录后刷新页面。</p>
            <div class="rounded-[6px] border border-v2-border-border-base bg-v2-background-bg-layer-02 p-3">
              <div class="mb-2 text-v2-text-text-base">推荐文件结构</div>
              <pre class="overflow-x-auto text-[12px] leading-5 text-v2-text-text-muted">{`my-skill/
  SKILL.md`}</pre>
            </div>
            <div class="rounded-[6px] border border-v2-border-border-base bg-v2-background-bg-layer-02 p-3">
              <div class="mb-2 text-v2-text-text-base">SKILL.md 模板</div>
              <pre class="max-h-[240px] overflow-auto text-[12px] leading-5 text-v2-text-text-muted">{`---
name: my-skill
description: Describe when this skill should be used.
---

Write the operating instructions for the skill here.`}</pre>
            </div>
          </div>
        </Overlay>
      </Show>

      <Show when={state.addMcpOpen}>
        <Overlay title="添加 MCP" close={() => setState("addMcpOpen", false)}>
          <div class="flex flex-col gap-3">
            <Segmented
              value={state.mcpKind}
              options={[
                { value: "remote", label: "远程" },
                { value: "local", label: "本地" },
              ]}
              onChange={(value) => setState("mcpKind", value)}
            />
            <Field label="名称" value={state.mcpName} placeholder="github" onInput={(value) => setState("mcpName", value)} />
            <Show
              when={state.mcpKind === "remote"}
              fallback={
                <>
                  <Field
                    label="启动命令"
                    value={state.mcpCommand}
                    placeholder="npx -y @modelcontextprotocol/server-filesystem /tmp"
                    onInput={(value) => setState("mcpCommand", value)}
                  />
                  <Field
                    label="环境变量"
                    value={state.mcpEnvironment}
                    multiline
                    placeholder={"TOKEN=...\nAPI_BASE=..."}
                    onInput={(value) => setState("mcpEnvironment", value)}
                  />
                </>
              }
            >
              <Field
                label="URL"
                value={state.mcpUrl}
                placeholder="https://example.com/mcp"
                onInput={(value) => setState("mcpUrl", value)}
              />
            </Show>
            <button
              type="button"
              class="mt-1 flex h-9 items-center justify-center rounded-[6px] bg-v2-text-text-base px-3 text-[13px] leading-4 text-v2-background-bg-layer-01 disabled:opacity-50"
              disabled={state.savingMcp}
              onClick={addMcp}
            >
              {state.savingMcp ? "添加中..." : "添加"}
            </button>
          </div>
        </Overlay>
      </Show>
    </div>
  )
}

function SkillPanel(props: {
  items: Array<{ name: string; description?: string; location: string; content: string }>
  loading: boolean
}) {
  return (
    <Show when={!props.loading} fallback={<EmptyState label="正在加载技能..." />}>
      <div class="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
        <For each={props.items} fallback={<EmptyState label="没有找到匹配的技能" />}>
          {(skill) => (
            <MarketCard
              icon="skill"
              name={skill.name}
              description={skill.description || firstContentLine(skill.content) || "DeepInsight Skill"}
              meta={skill.location}
            />
          )}
        </For>
      </div>
    </Show>
  )
}

function McpPanel(props: { items: Array<{ name: string; status: CmccMcpStatus }> }) {
  return (
    <div class="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <For each={props.items} fallback={<EmptyState label="还没有配置 MCP 连接器" />}>
        {(mcp) => (
            <MarketCard
              icon="mcp"
              name={mcp.name}
            description={
              mcp.status.status === "pending" ? "正在建立连接" : mcpError(mcp.status) || "DeepInsight MCP 连接器"
            }
            meta={mcp.status.status === "pending" ? "连接中" : mcpStatusLabel[mcp.status.status]}
            status={mcp.status.status}
          />
        )}
      </For>
    </div>
  )
}

function MarketCard(props: {
  icon: "skill" | "mcp"
  name: string
  description: string
  meta: string
  status?: CmccMcpStatus["status"]
}) {
  return (
    <div class="group flex min-h-[92px] min-w-0 items-start gap-3 rounded-[8px] border border-v2-border-border-base bg-v2-background-bg-layer-01 p-4 hover:border-v2-border-border-strong hover:bg-v2-background-bg-layer-02">
      <div class="flex size-9 shrink-0 items-center justify-center rounded-[7px] bg-v2-background-bg-layer-03 text-v2-icon-icon-base">
        <Icon name={props.icon === "skill" ? "brain" : "mcp"} class="size-5" />
      </div>
      <div class="min-w-0 flex-1">
        <div class="flex min-w-0 items-center gap-2">
          <h3 class="truncate text-[14px] font-medium leading-5 text-v2-text-text-base">{props.name}</h3>
          <Show when={props.status === "connected"}>
            <Icon name="check" class="size-4 shrink-0 text-v2-icon-icon-base" />
          </Show>
        </div>
        <p class="mt-1 line-clamp-2 text-[12px] leading-5 text-v2-text-text-muted">{props.description}</p>
        <p class="mt-2 truncate text-[11px] leading-4 text-v2-text-text-faint">{props.meta}</p>
      </div>
      <span class="shrink-0 rounded-full border border-v2-border-border-base px-2 py-1 text-[11px] leading-4 text-v2-text-text-faint">
        {props.icon === "skill"
          ? "可用"
          : props.status === "pending"
            ? "连接中"
            : props.status
              ? mcpStatusLabel[props.status]
              : "可用"}
      </span>
    </div>
  )
}

function TabButton(props: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      class="h-8 rounded-[6px] px-3 text-[14px] leading-4 text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base data-[selected]:bg-v2-background-bg-layer-03 data-[selected]:text-v2-text-text-base"
      data-selected={props.active ? "" : undefined}
      onClick={props.onClick}
    >
      {props.label}
    </button>
  )
}

function Overlay(props: { title: string; close: () => void; children: import("solid-js").JSX.Element }) {
  return (
    <div class="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 px-4" onClick={props.close}>
      <div
        class="w-full max-w-[520px] rounded-[8px] border border-v2-border-border-base bg-v2-background-bg-layer-01 p-4 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div class="mb-4 flex items-center justify-between gap-3">
          <h2 class="text-[16px] font-medium leading-6 text-v2-text-text-base">{props.title}</h2>
          <button
            type="button"
            class="flex size-8 items-center justify-center rounded-[6px] text-v2-icon-icon-muted hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-icon-icon-base"
            onClick={props.close}
          >
            <Icon name="close" class="size-4" />
          </button>
        </div>
        {props.children}
      </div>
    </div>
  )
}

function Segmented(props: {
  value: "remote" | "local"
  options: Array<{ value: "remote" | "local"; label: string }>
  onChange: (value: "remote" | "local") => void
}) {
  return (
    <div class="grid grid-cols-2 rounded-[6px] bg-v2-background-bg-layer-02 p-1">
      <For each={props.options}>
        {(option) => (
          <button
            type="button"
            class="h-8 rounded-[5px] text-[13px] leading-4 text-v2-text-text-muted data-[selected]:bg-v2-background-bg-layer-01 data-[selected]:text-v2-text-text-base"
            data-selected={props.value === option.value ? "" : undefined}
            onClick={() => props.onChange(option.value)}
          >
            {option.label}
          </button>
        )}
      </For>
    </div>
  )
}

function Field(props: {
  label: string
  value: string
  placeholder: string
  multiline?: boolean
  onInput: (value: string) => void
}) {
  return (
    <label class="flex flex-col gap-1">
      <span class="text-[12px] leading-4 text-v2-text-text-muted">{props.label}</span>
      <Show
        when={props.multiline}
        fallback={
          <input
            class="h-9 rounded-[6px] border border-v2-border-border-base bg-v2-background-bg-layer-02 px-3 text-[13px] leading-4 text-v2-text-text-base outline-none placeholder:text-v2-text-text-faint focus:border-v2-border-border-active"
            value={props.value}
            placeholder={props.placeholder}
            onInput={(event) => props.onInput(event.currentTarget.value)}
          />
        }
      >
        <textarea
          class="min-h-[96px] resize-y rounded-[6px] border border-v2-border-border-base bg-v2-background-bg-layer-02 px-3 py-2 text-[13px] leading-5 text-v2-text-text-base outline-none placeholder:text-v2-text-text-faint focus:border-v2-border-border-active"
          value={props.value}
          placeholder={props.placeholder}
          onInput={(event) => props.onInput(event.currentTarget.value)}
        />
      </Show>
    </label>
  )
}

function EmptyState(props: { label: string }) {
  return (
    <div class="col-span-full flex min-h-[180px] items-center justify-center rounded-[8px] border border-dashed border-v2-border-border-base text-[13px] leading-5 text-v2-text-text-faint">
      {props.label}
    </div>
  )
}

function firstContentLine(content: string) {
  return content
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("---") && !line.startsWith("#"))
}

function mcpError(status: McpStatus) {
  if ("error" in status) return status.error
}

function parseEnvironment(input: string) {
  const entries = input
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const index = line.indexOf("=")
      if (index < 1) return
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()] as const
    })
    .filter((entry): entry is readonly [string, string] => Boolean(entry))

  if (entries.length === 0) return undefined
  return Object.fromEntries(entries)
}
