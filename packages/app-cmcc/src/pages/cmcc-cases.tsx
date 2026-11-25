import { Icon } from "@opencode-ai/ui/icon"
import { For, Show, Suspense, lazy, createEffect, on, onCleanup, onMount } from "solid-js"
import { createStore } from "solid-js/store"
import { useNavigate } from "@solidjs/router"
import type { DockApiCaseGroup, DockApiCatalogCaseSummary } from "@/context/dockapi"
import { useDockApi } from "@/context/dockapi"
import { CaseDeleteDialog } from "@/components/case-delete-dialog"
import { CmccPageBrandBar } from "@/components/cmcc-page-brand-bar"
import {
  CMCC_CASES_UPDATED_EVENT,
  CMCC_CASE_CATEGORIES,
  cmccCaseCategoryByCode,
  cmccCaseKey,
  cmccCaseManagementAllowed,
} from "@/utils/cmcc-cases"
import researchIcon from "@/assets/cases/catalog-research.webp"
import governmentIcon from "@/assets/cases/catalog-government.webp"
import inspectionIcon from "@/assets/cases/catalog-inspection.webp"
import financeIcon from "@/assets/cases/catalog-finance.webp"
import recommendationIcon from "@/assets/cases/catalog-recommendation.webp"
import scienceIcon from "@/assets/cases/catalog-science.webp"
import { loadCaseData } from "./cases/load-case"
import { prepareResearchCase } from "./general-deepinsight/handoff"
import type { ResearchDetail } from "./general-deepinsight/model"
import "./cases/card-loading.css"
import "./cases/catalog.css"

type SortOrder = "latest" | "oldest"
const CaseManagementPanel = lazy(() => import("./admin/cases").then((module) => ({ default: module.CaseManagementPanel })))
type CaseOpening = { caseCode: string; phase: "loading" | "error"; error?: string }

const categoryArtwork: Record<string, string> = {
  "deep-research": researchIcon,
  government: governmentIcon,
  inspection: inspectionIcon,
  finance: financeIcon,
  recommendation: recommendationIcon,
  science: scienceIcon,
}
const categoryOrder = ["deep-research", "government", "inspection", "finance", "recommendation", "science", "location"]
const orderOf = (value: string) => {
  const index = categoryOrder.indexOf(value)
  return index === -1 ? categoryOrder.length : index
}
const caseCategories = [...CMCC_CASE_CATEGORIES].sort((a, b) => orderOf(a.code) - orderOf(b.code))

export function CmccCasesRoute() {
  const dockapi = useDockApi()
  const navigate = useNavigate()
  const [state, setState] = createStore({
    overview: [] as DockApiCaseGroup[],
    items: [] as DockApiCatalogCaseSummary[],
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
    maintenance: false,
    deleteCase: undefined as DockApiCatalogCaseSummary | undefined,
    opening: undefined as CaseOpening | undefined,
  })
  let openingGeneration = 0
  let openingRequest: AbortController | undefined
  const cancelOpening = () => {
    openingGeneration += 1
    openingRequest?.abort()
    openingRequest = undefined
    setState("opening", undefined)
  }
  const openingFor = (caseCode: string) => state.opening?.caseCode === caseCode ? state.opening : undefined
  const openCase = async (item: DockApiCatalogCaseSummary) => {
    if (openingFor(cmccCaseKey(item))?.phase === "loading") return
    cancelOpening()
    const run = openingGeneration
    const scope = dockapi.cases.navigationScope
    const controller = new AbortController()
    openingRequest = controller
    setState("opening", { caseCode: cmccCaseKey(item), phase: "loading" })
    try {
      if (item.source === "langgraph") {
        const detail = await dockapi.research.request<ResearchDetail>(`/api/dockapi/general-deepinsight/cases/${encodeURIComponent(item.caseCode)}`, { signal: controller.signal })
        if (run !== openingGeneration || controller.signal.aborted || scope !== dockapi.cases.navigationScope) return
        prepareResearchCase(dockapi.user!.id, item.caseCode, detail)
        navigate(`/general-deepinsight/cases/${encodeURIComponent(item.caseCode)}?from=catalog`)
        return
      }
      const [value, view] = await Promise.all([
        loadCaseData(dockapi.cases, item.caseCode, controller.signal),
        import("./cases/case-detail"),
      ])
      if (run !== openingGeneration || controller.signal.aborted) return
      await view.preloadCaseDetail(value)
      if (run !== openingGeneration || controller.signal.aborted) return
      const token = dockapi.cases.stageNavigation(value, scope)
      openingRequest = undefined
      try {
        navigate(`/cases/${item.caseCode}`, { state: { caseOpenToken: token } })
      } catch (error) {
        dockapi.cases.discardNavigation(token)
        throw error
      }
    } catch (error) {
      if (run !== openingGeneration || controller.signal.aborted) return
      controller.abort()
      openingRequest = undefined
      setState("opening", { caseCode: cmccCaseKey(item), phase: "error", error: error instanceof Error ? error.message : String(error) })
    }
  }
  let generation = 0
  let overviewGeneration = 0
  createEffect(on(() => dockapi.user?.id, cancelOpening))
  let sentinel: HTMLDivElement | undefined
  let observer: IntersectionObserver | undefined

  const filtered = () =>
    !!state.keyword || state.category !== "all" || state.sort !== "latest" || !!state.from || !!state.to

  const hasCategoryCases = (category: string) =>
    state.overview.some((group) => group.category === category && group.items.length > 0)

  const loadOverview = async () => {
    const overviewRun = ++overviewGeneration
    const run = filtered() ? undefined : ++generation
    const cached = dockapi.cases.cachedOverview()
    if (run !== undefined) setState({ loading: !cached, refreshing: !!cached, loadingMore: false, error: "" })
    if (cached) setState("overview", cached.groups)
    await dockapi.cases
      .overview()
      .then((result) => {
        if (overviewRun !== overviewGeneration) return
        setState("overview", result.groups)
        if (run === generation) setState({ loading: false, refreshing: false })
        if (state.category !== "all" && !hasCategoryCases(state.category)) setState("category", "all")
      })
      .catch((error) => {
        if (overviewRun !== overviewGeneration || run !== generation) return
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
    cancelOpening()
    const timer = window.setTimeout(() => setState("keyword", text), 300)
    onCleanup(() => window.clearTimeout(timer))
  })

  createEffect(
    on(
      () => [state.keyword, state.category, state.sort, state.from, state.to] as const,
      () => {
        cancelOpening()
        if (filtered()) void loadList(1)
        else void loadOverview()
      },
      { defer: false },
    ),
  )

  const reload = () => {
    cancelOpening()
    if (filtered()) void loadList(1)
    void loadOverview()
  }

  onMount(() => {
    window.addEventListener(CMCC_CASES_UPDATED_EVENT, reload)
    window.addEventListener("dockapi-auth-cleared", cancelOpening)
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
    cancelOpening()
    generation += 1
    overviewGeneration += 1
    window.removeEventListener(CMCC_CASES_UPDATED_EVENT, reload)
    window.removeEventListener("dockapi-auth-cleared", cancelOpening)
    observer?.disconnect()
  })

  const clearFilters = () => {
    setState({ sort: "latest", from: "", to: "", filterOpen: false })
  }

  const hasCases = () =>
    filtered() ? state.items.length > 0 : state.overview.some((group) => group.items.length > 0)
  const canManageCases = () => cmccCaseManagementAllowed(dockapi.user?.casePublishAllowed)
  const canDeleteCases = () => dockapi.user?.caseDeleteAllowed === true
  const requestDelete = (value: DockApiCatalogCaseSummary) => {
    cancelOpening()
    setState("deleteCase", value)
  }

  return (
    <Show when={state.maintenance && canManageCases()} fallback={
    <main class="relative size-full overflow-x-hidden overflow-y-auto bg-[var(--cmcc-home-background)]" data-page="cmcc-cases"
      onKeyDown={(event) => { if (event.key === "Escape" && state.opening) cancelOpening() }}>
      <CmccPageBrandBar />
      <div class="case-catalog">
        <header class="relative z-30">
          <h1 class="case-catalog-title">精选案例</h1>
          <p class="case-catalog-intro">
            沉淀真实研究成果，快速查看 Deep Research 与 AI+产业洞察的完整交付
          </p>
          <div class="case-catalog-toolbar">
            <Show when={canManageCases()}><button type="button" hidden class="h-9 shrink-0 rounded-[6px] border border-[#d1d9ef] bg-white px-3 text-[13px] text-[#48546b]" onClick={() => { cancelOpening(); setState("maintenance", true) }}>案例维护</button></Show>
            <label class="case-catalog-search">
              <input
                type="search"
                value={state.searchInput}
                class="min-w-0 flex-1 bg-transparent text-[14px] text-[#333b4e] outline-none placeholder:text-[#85878b]"
                placeholder="搜索案例行业或研究主题"
                onInput={(event) => setState("searchInput", event.currentTarget.value)}
              />
              <Icon name="magnifying-glass" class="size-5 shrink-0 text-[#33373d]" />
            </label>
            <button
              type="button"
              aria-label="筛选案例"
              aria-expanded={state.filterOpen}
              class="case-catalog-filter"
              data-active={state.filterOpen || state.sort !== "latest" || state.from || state.to ? "" : undefined}
              onClick={() => { cancelOpening(); setState("filterOpen", !state.filterOpen) }}
            >
              <svg class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
                <path d="M3 4h14l-5 7v8l-4-2v-6L3 4zM15 13h6m-6 4h6m-6 4h6" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
            <Show when={state.filterOpen}>
              <div class="case-catalog-filter-popover">
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
          <nav class="case-catalog-tabs" aria-label="案例分类">
            <CategoryButton label="全部" selected={state.category === "all"} onClick={() => setState("category", "all")} />
            <For each={caseCategories.filter((category) => hasCategoryCases(category.code))}>
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
            <section class="case-catalog-grid case-catalog-results">
              <For each={state.items}>
                {(item) => (
                  <CaseCard
                    item={item}
                    onClick={() => void openCase(item)}
                    opening={openingFor(cmccCaseKey(item))}
                    onCancel={cancelOpening}
                    onDelete={canDeleteCases() ? () => requestDelete(item) : undefined}
                  />
                )}
              </For>
            </section>
          }>
            <OverviewGroups
              groups={state.overview}
              open={(item) => void openCase(item)}
              opening={openingFor}
              cancelOpening={cancelOpening}
              viewMore={(category) => setState("category", category)}
              remove={canDeleteCases() ? requestDelete : undefined}
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
    }><Suspense fallback={<div class="p-8" role="status">正在加载案例维护...</div>}><div class="size-full overflow-auto bg-white"><CaseManagementPanel embedded onBack={() => setState("maintenance", false)} /></div></Suspense></Show>
  )
}

function OverviewGroups(props: {
  groups: DockApiCaseGroup[]
  open: (item: DockApiCatalogCaseSummary) => void
  viewMore: (category: string) => void
  remove?: (item: DockApiCatalogCaseSummary) => void
  opening: (caseCode: string) => CaseOpening | undefined
  cancelOpening: () => void
}) {
  const groups = () => props.groups.filter((group) => group.items.length > 0)
    .sort((a, b) => orderOf(a.category) - orderOf(b.category))
  return (
    <div class="case-catalog-groups">
      <For each={groups()}>
        {(group) => (
          <section class="case-catalog-group" data-case-group={group.category}>
            <header class="case-catalog-group-heading">
              <h2>{cmccCaseCategoryByCode(group.category)?.label ?? group.label}</h2>
              <Show when={group.category === "deep-research"} fallback={
                <button type="button" onClick={() => props.viewMore(group.category)}>
                  查看更多 <Icon name="chevron-right" class="size-3" />
                </button>
              }>
                <p>{cmccCaseCategoryByCode(group.category)?.description}</p>
              </Show>
            </header>
            <div class="case-catalog-grid" data-case-cards>
              <For each={group.items}>
                {(item) => (
                  <CaseCard
                    item={item}
                    onClick={() => props.open(item)}
                    opening={props.opening(cmccCaseKey(item))}
                    onCancel={props.cancelOpening}
                    onDelete={props.remove ? () => props.remove?.(item) : undefined}
                  />
                )}
              </For>
            </div>
          </section>
        )}
      </For>
    </div>
  )
}

function CaseCard(props: { item: DockApiCatalogCaseSummary; onClick: () => void; onDelete?: () => void; opening?: CaseOpening; onCancel: () => void }) {
  const isLocation = () => props.item.category === "location" || props.item.category === "marketing"
  const artwork = () => categoryArtwork[props.item.category] ?? researchIcon
  return (
    <div data-case-source={props.item.source ?? "opencode"} data-case-card={props.item.caseCode} class="group relative min-w-0 text-left">
      <button type="button" class="case-catalog-card" classList={{ "case-catalog-card-deletable": !!props.onDelete }} onClick={props.onClick}
        aria-label={props.item.caseName} aria-busy={props.opening?.phase === "loading"}>
        <Show when={isLocation()} fallback={
          <img class="case-catalog-icon" src={artwork()} width="60" height="65" loading="lazy" decoding="async" alt="" />
        }>
          <span class="case-catalog-icon case-catalog-icon-location" aria-hidden="true">
            <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.2" class="size-8">
              <path d="M16 29s8-9 8-16a8 8 0 0 0-16 0c0 7 8 16 8 16Z" stroke-linejoin="round" />
              <circle cx="16" cy="13" r="3" />
            </svg>
          </span>
        </Show>
        <span class="case-catalog-card-title" title={props.item.caseName}>{props.item.caseName}</span>
      </button>
      <Show when={props.opening}>
        {(opening) => (
          <div class="case-card-loading" data-case-loading data-error={opening().phase === "error" ? "" : undefined}>
            <div class="flex h-6 min-w-0 items-center gap-1.5">
              <span class="min-w-0 flex-1 truncate text-[12px] leading-5" role={opening().phase === "error" ? "alert" : "status"}
                title={opening().error}>
                {opening().phase === "error" ? "加载失败，请重试" : "正在加载案例…"}
              </span>
              <Show when={opening().phase === "error"}>
                <button type="button" class="h-6 shrink-0 px-1 text-[12px] font-medium text-[#3474e8] hover:text-[#245abe]"
                  onClick={props.onClick}>重试</button>
              </Show>
              <button type="button" class="flex size-6 shrink-0 items-center justify-center rounded-[4px] text-[#7585a3] hover:bg-[#e5edfb] hover:text-[#365d9e]"
                aria-label={opening().phase === "error" ? "关闭加载提示" : "取消加载"}
                title={opening().phase === "error" ? "关闭加载提示" : "取消加载"} onClick={props.onCancel}>
                <Icon name="close" class="size-3.5" />
              </button>
            </div>
            <Show when={opening().phase === "loading"}>
              <div class="case-card-loading-track" role="progressbar" aria-label={`正在加载 ${props.item.caseName}`}>
                <span class="case-card-loading-bar" />
              </div>
            </Show>
          </div>
        )}
      </Show>
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
      class="case-catalog-tab"
      aria-pressed={props.selected}
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
    <div class="case-catalog-grid case-catalog-results">
      <For each={Array.from({ length: 8 })}>
        {() => <div class="case-catalog-card animate-pulse" />}
      </For>
    </div>
  )
}
