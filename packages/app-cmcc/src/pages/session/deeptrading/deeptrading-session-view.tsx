import { Markdown } from "@opencode-ai/session-ui/markdown"
import { createAutoScroll } from "@opencode-ai/ui/hooks"
import { For, Show, createEffect, createMemo, on, type JSX } from "solid-js"
import type { AgentNodeStatus } from "../agent-workbench/model"
import { DEEPTRADING_LEAD_AGENT, deepTradingAvatar } from "./config"
import { useDeepTradingWorkbench } from "./workbench-context"

const STATUS_LABEL: Record<AgentNodeStatus, string> = {
  waiting: "等待中",
  running: "分析中",
  completed: "已完成",
  failed: "异常",
}

export function DeepTradingSessionView() {
  const context = useDeepTradingWorkbench()
  let scroller: HTMLDivElement | undefined
  const selected = createMemo(() => {
    const data = context.workbench()
    if (context.selectedAgentId() === "overview") {
      return {
        id: "overview",
        name: "总览",
        profession: "DeepTrading A股投研专家团",
        status: data.overviewStatus,
        markdown: data.overviewMarkdown,
        avatar: deepTradingAvatar(DEEPTRADING_LEAD_AGENT),
      }
    }
    const agent = data.agents.find((item) => item.id === context.selectedAgentId())
    return agent ? { ...agent, avatar: deepTradingAvatar(agent.id) } : undefined
  })
  const autoScroll = createAutoScroll({
    working: () => selected()?.status === "running",
    overflowAnchor: "dynamic",
    bottomThreshold: 80,
  })

  createEffect(
    on(
      context.selectedAgentId,
      () => {
        if (selected()?.status === "running") {
          autoScroll.resume()
          return
        }
        if (scroller) scroller.scrollTop = 0
      },
      { defer: true },
    ),
  )

  return (
    <div class="relative flex size-full min-h-0 flex-col overflow-hidden bg-[#f7f8fb] text-[#202636]">
      <div
        ref={(element) => {
          scroller = element
          autoScroll.scrollRef(element)
        }}
        class="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        onScroll={autoScroll.handleScroll}
        onPointerDown={autoScroll.handleInteraction}
      >
        <div ref={autoScroll.contentRef} class="mx-auto w-full max-w-[1040px] px-5 pb-32 pt-5 sm:px-8">
          <Show when={context.workbench().query}>
            {(query) => (
              <div class="mb-5 flex justify-end">
                <div class="max-w-[78%] whitespace-pre-wrap rounded-[8px] bg-[#e9ecf3] px-4 py-3 text-[14px] leading-6 text-[#323949]">
                  {query()}
                </div>
              </div>
            )}
          </Show>

          <Show
            when={selected()}
            fallback={<EmptyPanel title="正在读取分析团队" description="正在加载当前 DeepTrading 会话。" />}
          >
            {(item) => (
              <section class="min-w-0">
                <header class="mb-4 flex min-w-0 items-center gap-3 border-b border-[#e4e7ed] pb-4">
                  <AgentAvatar src={item().avatar} name={item().name} size="large" />
                  <div class="min-w-0 flex-1">
                    <div class="flex min-w-0 items-center gap-2">
                      <h2 class="m-0 truncate text-[16px] font-semibold leading-6 text-[#1f2533]">{item().name}</h2>
                      <StatusBadge status={item().status} />
                    </div>
                    <p class="m-0 mt-0.5 truncate text-[12px] leading-5 text-[#7a8292]">{item().profession}</p>
                  </div>
                  <Show
                    when={
                      item().id !== "overview" &&
                      "sessionId" in item() &&
                      item().sessionId &&
                      item().status === "failed"
                    }
                  >
                    <button
                      type="button"
                      class="h-8 shrink-0 rounded-[6px] border border-[#cad3e8] bg-white px-3 text-[12px] text-[#4f68a8] hover:bg-[#f2f5fb]"
                      onClick={() => {
                        const value = item()
                        if ("sessionId" in value && value.sessionId) void context.retrySession(value.sessionId)
                      }}
                    >
                      重试加载
                    </button>
                  </Show>
                </header>

                <Show
                  when={item().markdown}
                  fallback={
                    <EmptyPanel
                      title={item().status === "waiting" ? "等待该专家开始分析" : "该节点暂未返回正文"}
                      description={
                        item().status === "failed"
                          ? "当前节点执行或加载异常，请查看节点状态。"
                          : "内容返回后会在这里逐步显示。"
                      }
                    />
                  }
                >
                  {(markdown) => (
                    <div class="rounded-[8px] border border-[#e3e6ed] bg-white px-5 py-5 shadow-[0_2px_10px_rgba(36,42,60,0.04)] sm:px-7">
                      <Markdown
                        text={markdown()}
                        cacheKey={`${context.workbench().rootSessionId}:${item().id}`}
                        streaming={item().status === "running"}
                        class="select-text text-[14px] leading-7 text-[#2f3543]"
                      />
                    </div>
                  )}
                </Show>
              </section>
            )}
          </Show>

          <Show when={context.workbench().error}>
            {(error) => <Notice tone="error">DeepTrading 会话加载失败：{error()}</Notice>}
          </Show>
          <For each={context.workbench().ambiguities}>{(message) => <Notice tone="warning">{message}</Notice>}</For>
        </div>
      </div>

      <AgentStrip />
    </div>
  )
}

function AgentStrip() {
  const context = useDeepTradingWorkbench()
  const overview = createMemo(() => ({
    id: "overview",
    name: "总览",
    profession: "全部",
    status: context.workbench().overviewStatus,
    avatar: deepTradingAvatar(DEEPTRADING_LEAD_AGENT),
  }))
  const items = createMemo(() => [
    overview(),
    ...context.workbench().agents.map((agent) => ({ ...agent, avatar: deepTradingAvatar(agent.id) })),
  ])

  return (
    <div class="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center px-4">
      <nav
        aria-label="DeepTrading 分析团队"
        class="pointer-events-auto flex max-w-full gap-1.5 overflow-x-auto rounded-[8px] border border-[#dfe3eb] bg-white/95 p-2 shadow-[0_10px_30px_rgba(29,38,61,0.14)] backdrop-blur"
      >
        <For each={items()}>
          {(item) => (
            <button
              type="button"
              data-selected={context.selectedAgentId() === item.id ? "" : undefined}
              class="flex h-[54px] w-[94px] shrink-0 items-center gap-2 rounded-[6px] border border-transparent px-2 text-left transition hover:bg-[#f2f5fa] data-[selected]:border-[#aebce2] data-[selected]:bg-[#eef2fb]"
              title={`${item.name} · ${item.profession}`}
              onClick={() => context.selectAgent(item.id)}
            >
              <span class="relative shrink-0">
                <AgentAvatar src={item.avatar} name={item.name} size="small" />
                <i
                  aria-hidden="true"
                  data-status={item.status}
                  class="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-white bg-[#b7bdc8] data-[status=completed]:bg-[#16a36a] data-[status=failed]:bg-[#d84b4b] data-[status=running]:bg-[#4d72d7]"
                />
              </span>
              <span class="min-w-0">
                <strong class="block truncate text-[12px] font-medium leading-4 text-[#272e3d]">{item.name}</strong>
                <small class="mt-0.5 block truncate text-[10px] leading-4 text-[#8a91a0]">{item.profession}</small>
              </span>
            </button>
          )}
        </For>
      </nav>
    </div>
  )
}

export function AgentAvatar(props: { src?: string; name: string; size: "compact" | "small" | "large" }) {
  return (
    <Show
      when={props.src}
      fallback={
        <span
          class="flex shrink-0 items-center justify-center rounded-full bg-[#dfe6f6] font-semibold text-[#526ba8]"
          classList={{
            "size-8 text-[11px]": props.size === "compact",
            "size-9 text-[12px]": props.size === "small",
            "size-11 text-[14px]": props.size === "large",
          }}
        >
          {props.name.slice(0, 1)}
        </span>
      }
    >
      {(src) => (
        <img
          src={src()}
          alt=""
          class="shrink-0 rounded-full border border-[#e1e5ed] bg-white object-cover"
          classList={{
            "size-8": props.size === "compact",
            "size-9": props.size === "small",
            "size-11": props.size === "large",
          }}
        />
      )}
    </Show>
  )
}

export function StatusBadge(props: { status: AgentNodeStatus }) {
  return (
    <span
      data-status={props.status}
      class="shrink-0 rounded-[4px] bg-[#eef0f4] px-1.5 py-0.5 text-[10px] leading-4 text-[#747c8c] data-[status=completed]:bg-[#e9f7f1] data-[status=completed]:text-[#15875b] data-[status=failed]:bg-[#fff0f0] data-[status=failed]:text-[#bf4141] data-[status=running]:bg-[#edf2ff] data-[status=running]:text-[#4c6bc2]"
    >
      {STATUS_LABEL[props.status]}
    </span>
  )
}

function EmptyPanel(props: { title: string; description: string }) {
  return (
    <div class="flex min-h-52 flex-col items-center justify-center rounded-[8px] border border-dashed border-[#d9dde6] bg-white/70 px-6 text-center">
      <strong class="text-[14px] font-medium text-[#424a5b]">{props.title}</strong>
      <span class="mt-1 text-[12px] leading-5 text-[#8a91a0]">{props.description}</span>
    </div>
  )
}

function Notice(props: { tone: "warning" | "error"; children: JSX.Element }) {
  return (
    <div
      data-tone={props.tone}
      class="mt-3 rounded-[6px] border border-[#f0d99e] bg-[#fffaf0] px-3 py-2 text-[12px] leading-5 text-[#8a641f] data-[tone=error]:border-[#efc7c7] data-[tone=error]:bg-[#fff5f5] data-[tone=error]:text-[#a33d3d]"
    >
      {props.children}
    </div>
  )
}
