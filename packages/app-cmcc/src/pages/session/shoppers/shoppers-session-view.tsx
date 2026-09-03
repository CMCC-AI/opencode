import { Markdown } from "@opencode-ai/session-ui/markdown"
import { createAutoScroll } from "@opencode-ai/ui/hooks"
import { For, Show, createEffect, createMemo, on, type JSX } from "solid-js"
import type { AgentNodeStatus, OverviewConversationTurn } from "../agent-workbench/model"
import { AgentAvatar, StatusBadge } from "../deeptrading/deeptrading-session-view"
import { shoppersAvatar, shoppersTeamAvatar } from "./config"
import { useShoppersWorkbench } from "./workbench-context"

export function ShoppersSessionView() {
  const context = useShoppersWorkbench()
  let scroller: HTMLDivElement | undefined
  const selected = createMemo(() => {
    const data = context.workbench()
    if (context.selectedAgentId() === "overview") {
      return {
        id: "overview",
        name: "总览",
        profession: "好买手购买决策专家团",
        status: data.overviewStatus,
        markdown: data.overviewMarkdown,
        avatar: shoppersTeamAvatar(),
      }
    }
    const agent = data.agents.find((item) => item.id === context.selectedAgentId())
    return agent ? { ...agent, avatar: shoppersAvatar(agent.id) } : undefined
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
        class="deeptrading-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain"
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
            fallback={<EmptyPanel title="正在读取推荐团队" description="正在加载当前购买决策会话。" />}
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
                  when={
                    item().id === "overview" &&
                    !context.replay.isReplaying() &&
                    context.workbench().overviewTurns.length
                      ? context.workbench().overviewTurns
                      : undefined
                  }
                  fallback={
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
                        <MarkdownPanel
                          text={markdown()}
                          cacheKey={`${context.workbench().rootSessionId}:${item().id}`}
                          streaming={item().status === "running"}
                        />
                      )}
                    </Show>
                  }
                >
                  {(turns) => (
                    <OverviewConversation
                      turns={turns()}
                      rootSessionId={context.workbench().rootSessionId}
                      status={item().status}
                    />
                  )}
                </Show>
              </section>
            )}
          </Show>

          <Show when={context.workbench().error}>
            {(error) => <Notice tone="error">推荐会话加载失败：{error()}</Notice>}
          </Show>
          <For each={context.workbench().ambiguities}>{(message) => <Notice tone="warning">{message}</Notice>}</For>
        </div>
      </div>

      <AgentStrip />
    </div>
  )
}

function OverviewConversation(props: {
  turns: OverviewConversationTurn[]
  rootSessionId: string
  status: AgentNodeStatus
}) {
  const hasReply = createMemo(() => props.turns.some((turn) => !!turn.markdown.trim()))
  return (
    <Show
      when={hasReply()}
      fallback={
        <EmptyPanel
          title={props.status === "waiting" ? "等待专家团开始推荐分析" : "总览暂未返回正文"}
          description="内容返回后会在这里逐步显示。"
        />
      }
    >
      <div class="space-y-5">
        <For each={props.turns}>
          {(turn, index) => (
            <>
              <Show when={index() > 0}>
                <div class="flex justify-end">
                  <div class="max-w-[78%] whitespace-pre-wrap rounded-[8px] bg-[#e9ecf3] px-4 py-3 text-[14px] leading-6 text-[#323949]">
                    {turn.query}
                  </div>
                </div>
              </Show>
              <Show when={turn.markdown}>
                {(markdown) => (
                  <MarkdownPanel
                    text={markdown()}
                    cacheKey={`${props.rootSessionId}:overview:${turn.id}`}
                    streaming={props.status === "running" && index() === props.turns.length - 1}
                  />
                )}
              </Show>
            </>
          )}
        </For>
      </div>
    </Show>
  )
}

function MarkdownPanel(props: { text: string; cacheKey: string; streaming: boolean }) {
  return (
    <div class="rounded-[8px] border border-[#e3e6ed] bg-white px-5 py-5 shadow-[0_2px_10px_rgba(36,42,60,0.04)] sm:px-7">
      <Markdown
        text={props.text}
        cacheKey={props.cacheKey}
        streaming={props.streaming}
        class="select-text text-[14px] leading-7 text-[#2f3543]"
      />
    </div>
  )
}

function AgentStrip() {
  const context = useShoppersWorkbench()
  const items = createMemo(() => [
    {
      id: "overview",
      name: "总览",
      profession: "全部",
      status: context.workbench().overviewStatus,
      avatar: shoppersTeamAvatar(),
    },
    ...context.workbench().agents.map((agent) => ({ ...agent, avatar: shoppersAvatar(agent.id) })),
  ])

  return (
    <div class="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center px-4">
      <nav
        aria-label="好买手推荐团队"
        class="deeptrading-scrollbar pointer-events-auto flex max-w-full gap-1.5 overflow-x-auto rounded-[8px] border border-[#dfe3eb] bg-white/95 p-2 shadow-[0_10px_30px_rgba(29,38,61,0.14)] backdrop-blur"
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
