import { Icon } from "@opencode-ai/ui/icon"
import { For, Show, createEffect, on, onCleanup, onMount } from "solid-js"
import { createStore } from "solid-js/store"
import { useNavigate } from "@solidjs/router"
import type { DockApiCaseGroup, DockApiCaseSummary } from "@/context/dockapi"
import { dockApiUrl, useDockApi } from "@/context/dockapi"
import { CaseDeleteDialog } from "@/components/case-delete-dialog"
import {
  CMCC_CASES_UPDATED_EVENT,
  CMCC_CASE_CATEGORIES,
  cmccCaseCategoryByCode,
  cmccCaseManagementAllowed,
} from "@/utils/cmcc-cases"
import { cmccHistoryProduct } from "@/utils/cmcc-history-product"
import caseCategoryAssetsUrl from "@/assets/cases/case-category-assets.svg?url"

type SortOrder = "latest" | "oldest"

const CASE_CATEGORY_ARTWORK: Record<string, { background: string; title?: string; viewBox: string }> = {
  "deep-research": { background: "deep-research", viewBox: "0 0 920 220" },
  government: { background: "government", title: "government", viewBox: "0 0 420 206" },
  inspection: { background: "inspection", title: "inspection", viewBox: "0 0 420 206" },
  finance: { background: "finance", title: "finance", viewBox: "0 0 420 206" },
  recommendation: { background: "recommendation", title: "recommendation", viewBox: "0 0 420 206" },
  science: { background: "science", title: "science", viewBox: "0 0 420 206" },
  marketing: { background: "marketing", title: "marketing", viewBox: "0 0 420 206" },
}

export function CmccCasesRoute() {
  const dockapi = useDockApi()
  const navigate = useNavigate()
  const [state, setState] = createStore({
    overview: [] as DockApiCaseGroup[],
    items: [] as DockApiCaseSummary[],
    total: 0,
    page: 1,
    loading: true,
    loadingMore: false,
    refreshing: false,
    error: "",
    searchInput: "",
    keyword: "",
    category: "all",
    sort: "latest" as SortOrder,
    from: "",
    to: "",
    filterOpen: false,
    deleteCase: undefined as DockApiCaseSummary | undefined,
  })
  let generation = 0
  let sentinel: HTMLDivElement | undefined
  let observer: IntersectionObserver | undefined

  const filtered = () =>
    !!state.keyword || state.category !== "all" || state.sort !== "latest" || !!state.from || !!state.to

  const loadOverview = async () => {
    const run = ++generation
    const cached = dockapi.cases.cachedOverview()
    setState({ loading: !cached, refreshing: !!cached, loadingMore: false, error: "" })
    if (cached) setState("overview", cached.groups)
    await dockapi.cases
      .overview()
      .then((result) => {
        if (run !== generation) return
        setState({ overview: result.groups, loading: false, refreshing: false })
      })
      .catch((error) => {
        if (run !== generation) return
        setState({
          loading: false,
          refreshing: false,
          error: cached ? "" : error instanceof Error ? error.message : String(error),
        })
      })
  }

  const loadList = async (page = 1) => {
    const run = page === 1 ? ++generation : generation
    const input = {
      keyword: state.keyword || undefined,
      category: state.category === "all" ? undefined : state.category,
      sort: state.sort,
      from: state.from || undefined,
      to: state.to || undefined,
      page,
      size: 24,
    }
    const cached = page === 1 ? dockapi.cases.cachedList(input) : undefined
    if (page === 1) setState({
      loading: !cached,
      refreshing: !!cached,
      loadingMore: false,
      error: "",
      items: cached?.items ?? [],
      total: cached?.total ?? 0,
      page: 1,
    })
    else setState("loadingMore", true)
    await dockapi.cases
      .list(input)
      .then((result) => {
        if (run !== generation) return
        setState({
          items: page === 1 ? result.items : [...state.items, ...result.items],
          total: result.total,
          page: result.page,
          loading: false,
          loadingMore: false,
          refreshing: false,
        })
      })
      .catch((error) => {
        if (run !== generation) return
        setState({
          loading: false,
          loadingMore: false,
          refreshing: false,
          error: cached ? "" : error instanceof Error ? error.message : String(error),
        })
      })
  }

  createEffect(() => {
    const text = state.searchInput.trim()
    const timer = window.setTimeout(() => setState("keyword", text), 300)
    onCleanup(() => window.clearTimeout(timer))
  })

  createEffect(
    on(
      () => [state.keyword, state.category, state.sort, state.from, state.to] as const,
      () => {
        if (filtered()) void loadList(1)
        else void loadOverview()
      },
      { defer: false },
    ),
  )

  const reload = () => {
    if (filtered()) void loadList(1)
    else void loadOverview()
  }

  onMount(() => {
    window.addEventListener(CMCC_CASES_UPDATED_EVENT, reload)
    observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      if (!filtered() || state.loading || state.refreshing || state.loadingMore || state.items.length >= state.total) return
      void loadList(state.page + 1)
    }, { rootMargin: "240px" })
    if (sentinel) observer.observe(sentinel)
  })

  createEffect(on(
    () => [state.loading, state.refreshing],
    () => {
      if (state.loading || state.refreshing || !sentinel || !observer) return
      observer.unobserve(sentinel)
      observer.observe(sentinel)
    },
  ))

  onCleanup(() => {
    generation += 1
    window.removeEventListener(CMCC_CASES_UPDATED_EVENT, reload)
    observer?.disconnect()
  })

  const clearFilters = () => {
    setState({ sort: "latest", from: "", to: "", filterOpen: false })
  }

  const hasCases = () =>
    filtered() ? state.items.length > 0 : state.overview.some((group) => group.items.length > 0)
  const canManageCases = () => cmccCaseManagementAllowed(dockapi.user?.casePublishAllowed)
  const requestDelete = (value: DockApiCaseSummary) => setState("deleteCase", value)

  return (
    <main class="relative size-full overflow-x-hidden overflow-y-auto bg-[#fbfcff]" data-page="cmcc-cases">
      <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(239,226,255,0.58),transparent_31%),radial-gradient(circle_at_82%_78%,rgba(220,239,255,0.62),transparent_34%)]" />
      <div class="relative mx-auto w-full max-w-[1320px] px-6 pb-12 pt-10 max-sm:px-4 max-sm:pt-6">
        <header class="relative z-30">
          <h1 class="text-[30px] font-semibold leading-10 text-[#6d42ef]">精选案例</h1>
          <p class="mt-1 text-[17px] leading-7 text-[#596176] max-sm:text-[14px]">
            沉淀真实研究成果，快速查看 Deep Research 与 AI+产业洞察的完整交付
          </p>
          <div class="relative mt-4 flex items-center gap-3">
            <label class="flex h-11 w-[400px] max-w-[calc(100%-56px)] items-center rounded-full border border-[#d1d9ef] bg-white px-4 text-[#9ba4b8] focus-within:border-[#8eabef]">
              <input
                type="search"
                value={state.searchInput}
                class="min-w-0 flex-1 bg-transparent text-[14px] text-[#34405a] outline-none placeholder:text-[#a8afbf]"
                placeholder="搜索案例行业或研究主题"
                onInput={(event) => setState("searchInput", event.currentTarget.value)}
              />
              <Icon name="magnifying-glass" class="size-5 shrink-0 text-[#2f74ee]" />
            </label>
            <button
              type="button"
              aria-label="筛选案例"
              aria-expanded={state.filterOpen}
              class="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#f0f2f8] text-[#536078] hover:bg-[#e8edf7] data-[active]:bg-[#e7efff] data-[active]:text-[#3574e8]"
              data-active={state.filterOpen || state.sort !== "latest" || state.from || state.to ? "" : undefined}
              onClick={() => setState("filterOpen", !state.filterOpen)}
            >
              <Icon name="sliders" class="size-5" />
            </button>
            <Show when={state.filterOpen}>
              <div class="absolute left-[412px] top-12 z-50 w-[280px] rounded-[8px] border border-[#dce3ef] bg-[#fff] p-4 shadow-[0_14px_36px_rgba(45,61,95,0.16)] max-sm:left-auto max-sm:right-0">
                <label class="block text-[12px] font-medium text-[#59657e]">排序方式</label>
                <div class="mt-2 grid grid-cols-2 gap-2">
                  <FilterChoice selected={state.sort === "latest"} label="最新发布" onClick={() => setState("sort", "latest")} />
                  <FilterChoice selected={state.sort === "oldest"} label="最早发布" onClick={() => setState("sort", "oldest")} />
                </div>
                <label class="mt-4 block text-[12px] font-medium text-[#59657e]">发布日期</label>
                <div class="mt-2 grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    value={state.from}
                    class="h-9 min-w-0 rounded-[6px] border border-[#dce3ef] px-2 text-[12px] text-[#48546d] outline-none focus:border-[#88a8ee]"
                    onChange={(event) => setState("from", event.currentTarget.value)}
                  />
                  <input
                    type="date"
                    value={state.to}
                    class="h-9 min-w-0 rounded-[6px] border border-[#dce3ef] px-2 text-[12px] text-[#48546d] outline-none focus:border-[#88a8ee]"
                    onChange={(event) => setState("to", event.currentTarget.value)}
                  />
                </div>
                <div class="mt-4 flex justify-end gap-2">
                  <button type="button" class="h-8 px-3 text-[12px] text-[#74809a]" onClick={clearFilters}>重置</button>
                  <button type="button" class="h-8 rounded-[6px] bg-[#edf3ff] px-3 text-[12px] font-medium text-[#3474e8]" onClick={() => setState("filterOpen", false)}>完成</button>
                </div>
              </div>
            </Show>
          </div>
          <nav class="mt-4 flex gap-2 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="案例分类">
            <CategoryButton label="全部" selected={state.category === "all"} onClick={() => setState("category", "all")} />
            <For each={CMCC_CASE_CATEGORIES}>
              {(category) => (
                <CategoryButton
                  label={category.label}
                  selected={state.category === category.code}
                  onClick={() => setState("category", category.code)}
                />
              )}
            </For>
          </nav>
        </header>

        <Show when={state.loading}>
          <CaseSkeletons />
        </Show>
        <Show when={!state.loading && state.error}>
          <div class="py-24 text-center">
            <p class="text-[14px] text-[#8a93a7]">案例加载失败：{state.error}</p>
            <button type="button" class="mt-4 h-9 rounded-[6px] bg-[#edf3ff] px-4 text-[13px] text-[#3573e6]" onClick={reload}>重新加载</button>
          </div>
        </Show>
        <Show when={!state.loading && !state.error && !hasCases()}>
          <div class="py-24 text-center text-[14px] text-[#929aae]">暂无符合条件的案例</div>
        </Show>
        <Show when={!state.loading && !state.error && hasCases()}>
          <Show when={!filtered()} fallback={
            <section class="mt-7 grid grid-cols-4 gap-x-4 gap-y-6 max-lg:grid-cols-3 max-md:grid-cols-2 max-sm:grid-cols-1">
              <For each={state.items}>
                {(item) => (
                  <CaseCard
                    item={item}
                    onClick={() => navigate(`/cases/${item.caseCode}`)}
                    onDelete={canManageCases() ? () => requestDelete(item) : undefined}
                  />
                )}
              </For>
            </section>
          }>
            <OverviewGroups
              groups={state.overview}
              open={(item) => navigate(`/cases/${item.caseCode}`)}
              viewMore={(category) => setState("category", category)}
              remove={canManageCases() ? requestDelete : undefined}
            />
          </Show>
          <div ref={(element) => { sentinel = element; observer?.observe(element) }} class="h-px" />
          <Show when={state.loadingMore}>
            <p class="py-6 text-center text-[12px] text-[#9aa3b5]">正在加载更多案例...</p>
          </Show>
        </Show>
      </div>
      <CaseDeleteDialog
        value={state.deleteCase}
        onClose={() => setState("deleteCase", undefined)}
        onDeleted={() => {
          setState("deleteCase", undefined)
          window.dispatchEvent(new Event(CMCC_CASES_UPDATED_EVENT))
        }}
      />
    </main>
  )
}

function OverviewGroups(props: {
  groups: DockApiCaseGroup[]
  open: (item: DockApiCaseSummary) => void
  viewMore: (category: string) => void
  remove?: (item: DockApiCaseSummary) => void
}) {
  const general = () => props.groups.find((group) => group.category === "deep-research")
  const others = () => props.groups.filter((group) => group.category !== "deep-research" && group.items.length)
  return (
    <div
      class="mt-5"
      style={{
        "container-type": "inline-size",
        "--case-card-width": "calc((100cqw - 104px) / 4)",
      }}
    >
      <Show when={general()?.items.length}>
        <CaseSectionHeading category="deep-research" />
        <section data-case-group="deep-research" class="relative mt-3 inline-block max-w-full overflow-hidden rounded-[8px] max-md:w-full">
          <CaseCategoryBackground category="deep-research" />
          <div
            data-case-cards
            class="relative z-10 grid grid-flow-col gap-4 px-7 py-5 max-md:grid-flow-row max-md:grid-cols-2 max-sm:grid-cols-1"
            style={{ "grid-auto-columns": "var(--case-card-width)" }}
          >
            <For each={general()!.items}>
              {(item) => (
                <CaseCard
                  item={item}
                  onClick={() => props.open(item)}
                  onDelete={props.remove ? () => props.remove?.(item) : undefined}
                />
              )}
            </For>
          </div>
        </section>
      </Show>
      <Show when={others().length}>
        <div class="mt-6 flex min-w-0 items-baseline gap-3">
          <h2 class="shrink-0 text-[15px] font-semibold text-[#6038e4]">AI+产业洞察</h2>
          <p class="truncate text-[14px] text-[#596176]">垂类专家团专业化研究</p>
        </div>
      </Show>
      <div class="mt-3 grid grid-cols-2 gap-x-4 gap-y-4 max-md:grid-cols-1">
        <For each={others()}>
          {(group) => {
            const category = () => cmccCaseCategoryByCode(group.category)
            const wide = () => group.category === "science"
            return (
              <section class={wide() ? "col-span-2 max-md:col-span-1" : undefined}>
                <div
                  data-case-group={group.category}
                  class="relative inline-block max-w-full overflow-hidden rounded-[8px] max-sm:w-full"
                  classList={{ "max-md:w-full": wide() }}
                  style={{ background: category()?.tone ?? "#f4f6fb" }}
                >
                  <CaseCategoryBackground category={group.category} />
                  <div class="relative z-10 flex flex-col pb-4 pt-3" classList={{ "px-7": wide(), "px-4": !wide() }}>
                    <div class="flex h-6 items-center justify-between gap-4">
                      <CaseCategoryTitle category={group.category} label={category()?.label ?? group.category} />
                      <button
                        type="button"
                        class="flex shrink-0 items-center gap-0.5 text-[10px] text-[#667188] hover:text-[#3f66b0]"
                        onClick={() => props.viewMore(group.category)}
                      >
                        查看更多
                        <Icon name="chevron-right" class="size-3" />
                      </button>
                    </div>
                    <div
                      data-case-cards
                      class="mt-2 grid grid-flow-col max-sm:grid-flow-row max-sm:grid-cols-1"
                      classList={{ "gap-4 max-md:grid-flow-row max-md:grid-cols-2": wide(), "gap-3": !wide() }}
                      style={{ "grid-auto-columns": "var(--case-card-width)" }}
                    >
                      <For each={group.items}>
                        {(item) => (
                          <CaseCard
                            item={item}
                            onClick={() => props.open(item)}
                            onDelete={props.remove ? () => props.remove?.(item) : undefined}
                          />
                        )}
                      </For>
                    </div>
                  </div>
                </div>
              </section>
            )
          }}
        </For>
      </div>
    </div>
  )
}

function CaseCategoryBackground(props: { category: string }) {
  const artwork = () => CASE_CATEGORY_ARTWORK[props.category] ?? CASE_CATEGORY_ARTWORK["deep-research"]
  return (
    <svg
      aria-hidden="true"
      class="pointer-events-none absolute inset-0 size-full"
      viewBox={artwork().viewBox}
      preserveAspectRatio="none"
    >
      <use href={`${caseCategoryAssetsUrl}#background-${artwork().background}`} width="100%" height="100%" />
    </svg>
  )
}

function CaseCategoryTitle(props: { category: string; label: string }) {
  const title = () => CASE_CATEGORY_ARTWORK[props.category]?.title
  return (
    <h2 class="flex h-[18px] min-w-0 items-center">
      <span class="sr-only">{props.label}</span>
      <Show when={title()} fallback={<span class="text-[14px] font-semibold text-[#6038e4]">{props.label}</span>}>
        {(name) => (
          <svg aria-hidden="true" class="h-[18px] w-16 shrink-0" viewBox="0 0 64 18">
            <use href={`${caseCategoryAssetsUrl}#title-${name()}`} width="64" height="18" />
          </svg>
        )}
      </Show>
    </h2>
  )
}

function CaseSectionHeading(props: { category: string }) {
  const category = () => cmccCaseCategoryByCode(props.category)
  return (
    <div class="flex min-w-0 items-baseline gap-3">
      <h2 class="shrink-0 text-[15px] font-semibold text-[#6038e4]">{category()?.label}</h2>
      <p class="truncate text-[14px] text-[#596176]">{category()?.description}</p>
    </div>
  )
}

function CaseCard(props: { item: DockApiCaseSummary; onClick: () => void; onDelete?: () => void }) {
  const [state, setState] = createStore({ coverFailed: false })
  createEffect(on(() => props.item.coverUrl, () => setState("coverFailed", false)))
  const product = () => cmccHistoryProduct(props.item.agentType)
  return (
    <div data-case-card={props.item.caseCode} class="group relative min-w-0 text-left">
      <button type="button" class="block w-full text-left" onClick={props.onClick}>
        <div class="overflow-hidden rounded-[8px] border border-[#e9edf5] bg-white shadow-[0_4px_12px_rgba(61,77,112,0.08)] transition-[transform,box-shadow] duration-150 group-hover:-translate-y-0.5 group-hover:shadow-[0_8px_18px_rgba(61,77,112,0.13)]">
          <div
            class="line-clamp-2 min-h-[48px] px-3.5 pb-2 pt-3 text-[14px] font-medium leading-5 text-[#333b4e]"
            classList={{ "pr-11": !!props.onDelete }}
          >
            {props.item.caseName}
          </div>
          <div class="relative aspect-[1.8] overflow-hidden bg-[#eef4ff]">
            <Show when={props.item.coverUrl && !state.coverFailed} fallback={<div class="flex size-full items-center justify-center text-[30px] font-semibold text-[#7a8fbd]">{props.item.caseName.slice(0, 1)}</div>}>
              <img
                src={dockApiUrl(props.item.coverUrl)}
                alt={props.item.caseName}
                class="size-full object-fill"
                loading="lazy"
                decoding="async"
                onError={() => setState("coverFailed", true)}
              />
            </Show>
            <span
              data-slot="case-category-label"
              class="absolute bottom-2 left-2 max-w-[min(104px,calc(100%-16px))] truncate rounded-full border border-[#e1e6ef] bg-[#f0f2f8] px-1.5 py-0.5 text-[11px] font-normal leading-[1.4] text-[#5d6679]"
              title={props.item.caseTag}
              style={{
                color: product()?.textColor,
                background: product()?.backgroundColor,
                "border-color": product()?.borderColor,
              }}
            >
              {props.item.caseTag}
            </span>
          </div>
        </div>
      </button>
      <Show when={props.onDelete}>
        <button
          type="button"
          title="删除案例"
          aria-label={`删除案例 ${props.item.caseName}`}
          class="absolute right-2 top-2 z-10 flex size-7 items-center justify-center rounded-[6px] border border-[#e5e9f1] bg-white/95 text-[#8a94a7] shadow-sm hover:border-red-200 hover:bg-red-50 hover:text-red-600"
          onClick={(event) => {
            event.stopPropagation()
            props.onDelete?.()
          }}
        >
          <Icon name="trash" class="size-3.5" />
        </button>
      </Show>
    </div>
  )
}

function CategoryButton(props: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      data-selected={props.selected ? "" : undefined}
      class="h-[38px] shrink-0 rounded-[16px] border border-[#eceff6] bg-white px-4 text-[14px] text-[#656d7e] shadow-[0_3px_9px_rgba(62,75,105,0.08)] data-[selected]:border-transparent data-[selected]:bg-[#e5edff] data-[selected]:font-medium data-[selected]:text-[#2f70ef]"
      onClick={props.onClick}
    >
      {props.label}
    </button>
  )
}

function FilterChoice(props: { selected: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      data-selected={props.selected ? "" : undefined}
      class="h-9 rounded-[6px] border border-[#e1e6f0] text-[12px] text-[#68738b] data-[selected]:border-[#9cb7ef] data-[selected]:bg-[#eef4ff] data-[selected]:text-[#3474e8]"
      onClick={props.onClick}
    >
      {props.label}
    </button>
  )
}

function CaseSkeletons() {
  return (
    <div class="mt-8 grid grid-cols-4 gap-4 max-md:grid-cols-2 max-sm:grid-cols-1">
      <For each={Array.from({ length: 8 })}>
        {() => <div class="h-[166px] animate-pulse rounded-[8px] bg-[#f1f4f9]" />}
      </For>
    </div>
  )
}
