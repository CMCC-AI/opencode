import { For, Show, createEffect, onCleanup, onMount } from "solid-js"
import { createStore } from "solid-js/store"
import { useDockApi } from "@/context/dockapi"
import { managementApi, type CaseCategory, type ManagedCase } from "./api"
import { AdminError, AdminModal, Pagination, ToolButton, formatAdminTime } from "./shared"
import "./admin.css"

export function CaseManagementPanel(props: { embedded?: boolean; onBack?: () => void }) {
  const dockapi = useDockApi()
  const api = managementApi(dockapi)
  const [state, setState] = createStore({
    keyword: "",
    source: "",
    category: "",
    status: "",
    page: 1,
    revision: 0,
    items: [] as ManagedCase[],
    categories: [] as CaseCategory[],
    total: 0,
    loading: true,
    error: "",
    edit: undefined as ManagedCase | undefined,
    confirm: undefined as { item: ManagedCase; action: "delete" | "status" } | undefined,
    pending: false,
    actionError: "",
  })
  let generation = 0
  onCleanup(() => {
    generation += 1
  })
  createEffect(() => {
    if (state.confirm?.action === "delete" && dockapi.user?.caseDeleteAllowed !== true && !state.pending)
      setState("confirm", undefined)
  })
  onMount(() => {
    void api
      .categories()
      .then((items) => setState("categories", items))
      .catch((error) => setState("error", String(error)))
  })
  createEffect(() => {
    const input = {
      keyword: state.keyword,
      source: state.source,
      category: state.category,
      publishStatus: state.status,
      page: state.page,
      size: 24,
    }
    dockapi.user?.id
    state.revision
    const current = ++generation
    setState({ loading: true, error: "", items: [] })
    void api
      .cases(input)
      .then((value) => {
        if (current !== generation) return
        const page = Math.max(1, Math.ceil(value.total / 24))
        if (input.page > page) {
          setState("page", page)
          return
        }
        setState({ items: value.items, total: value.total })
      })
      .catch((error) => {
        if (current === generation) setState("error", error instanceof Error ? error.message : "案例加载失败")
      })
      .finally(() => {
        if (current === generation) setState("loading", false)
      })
  })
  const reload = () => setState("revision", (value) => value + 1)
  const confirm = async () => {
    const request = state.confirm
    if (!request || state.pending) return
    setState({ pending: true, actionError: "" })
    try {
      if (request.action === "delete") await api.remove(request.item)
      else await api.status(request.item, request.item.publishStatus === "published" ? "unpublished" : "published")
      setState("confirm", undefined)
      reload()
    } catch (error) {
      setState("actionError", error instanceof Error ? error.message : "操作失败")
    } finally {
      setState("pending", false)
    }
  }
  return (
    <section class="admin-ui admin-content" data-page="admin-cases">
      <header class="admin-page-title">
        <div class="admin-actions">
          <Show when={props.embedded}>
            <ToolButton label="返回案例集" icon="arrow-left" onClick={() => props.onBack?.()} />
          </Show>
          <h1>案例管理</h1>
        </div>
        <ToolButton label="刷新案例" icon="reset" disabled={state.loading} onClick={reload} />
      </header>
      <form class="admin-toolbar" onSubmit={(event) => event.preventDefault()}>
        <input
          type="search"
          aria-label="搜索维护案例"
          placeholder="名称、说明或分类"
          value={state.keyword}
          onInput={(event) => setState({ keyword: event.currentTarget.value, page: 1 })}
        />
        <select
          aria-label="案例来源筛选"
          value={state.source}
          onChange={(event) => setState({ source: event.currentTarget.value, page: 1 })}
        >
          <option value="">全部来源</option>
          <option value="opencode">OpenCode</option>
          <option value="langgraph">LangGraph</option>
        </select>
        <select
          aria-label="维护案例分类"
          value={state.category}
          onChange={(event) => setState({ category: event.currentTarget.value, page: 1 })}
        >
          <option value="">全部分类</option>
          <For each={state.categories}>{(category) => <option value={category.code}>{category.label}</option>}</For>
        </select>
        <select
          aria-label="上下架状态筛选"
          value={state.status}
          onChange={(event) => setState({ status: event.currentTarget.value, page: 1 })}
        >
          <option value="">全部状态</option>
          <option value="published">已上架</option>
          <option value="unpublished">已下架</option>
        </select>
      </form>
      <AdminError error={state.error} retry={reload} />
      <div class="admin-table-wrap" aria-busy={state.loading}>
        <table>
          <thead>
            <tr>
              <th>案例</th>
              <th>来源</th>
              <th>分类</th>
              <th>状态</th>
              <th>发布时间</th>
              <th class="admin-action-col">操作</th>
            </tr>
          </thead>
          <tbody>
            <For each={state.items}>
              {(item) => (
                <tr>
                  <td class="admin-case-cell">
                    <strong>{item.caseName}</strong>
                    <Show when={item.caseDescription}>
                      <small>{item.caseDescription}</small>
                    </Show>
                  </td>
                  <td>{item.source === "langgraph" ? "LangGraph" : "OpenCode"}</td>
                  <td>{item.caseTag}</td>
                  <td>
                    <span class="admin-status" classList={{ muted: item.publishStatus !== "published" }}>
                      {item.publishStatus === "published" ? "已上架" : "已下架"}
                    </span>
                  </td>
                  <td>{formatAdminTime(item.publishedAt)}</td>
                  <td>
                    <div class="admin-actions">
                      <ToolButton
                        label={`编辑${item.caseName}`}
                        icon="edit-small-2"
                        onClick={() => setState("edit", item)}
                      />
                      <ToolButton
                        label={`${item.publishStatus === "published" ? "下架" : "上架"}${item.caseName}`}
                        icon={item.publishStatus === "published" ? "circle-ban-sign" : "arrow-up"}
                        onClick={() => setState({ confirm: { item, action: "status" }, actionError: "" })}
                      />
                      <Show when={dockapi.user?.caseDeleteAllowed === true}>
                        <ToolButton
                          danger
                          label={`永久删除${item.caseName}`}
                          icon="trash"
                          onClick={() => setState({ confirm: { item, action: "delete" }, actionError: "" })}
                        />
                      </Show>
                    </div>
                  </td>
                </tr>
              )}
            </For>
            <Show when={!state.items.length}>
              <tr>
                <td colspan={6} class="admin-empty">
                  {state.loading ? "正在加载案例..." : state.error ? "--" : "暂无符合条件的案例"}
                </td>
              </tr>
            </Show>
          </tbody>
        </table>
      </div>
      <Pagination
        page={state.page}
        size={24}
        total={state.total}
        pending={state.loading}
        onChange={(page) => setState("page", page)}
      />
      <Show when={state.edit} keyed>
        {(item) => (
          <CaseEditor
            item={item}
            categories={state.categories}
            onClose={() => setState("edit", undefined)}
            onSaved={() => {
              setState("edit", undefined)
              reload()
            }}
          />
        )}
      </Show>
      <Show when={state.confirm} keyed>
        {(value) => (
          <AdminModal
            title={
              value.action === "delete"
                ? "永久删除案例"
                : value.item.publishStatus === "published"
                  ? "下架案例"
                  : "上架案例"
            }
            pending={state.pending}
            onClose={() => setState("confirm", undefined)}
          >
            <div class="admin-form-body">
              <p>
                确定
                {value.action === "delete" ? "永久删除" : value.item.publishStatus === "published" ? "下架" : "上架"}“
                {value.item.caseName}”吗？
              </p>
              <Show when={value.action === "delete"}>
                <p class="admin-warning">案例快照、封面和案例文件将被永久删除，无法恢复。原研究任务不受影响。</p>
              </Show>
              <AdminError error={state.actionError} />
            </div>
            <footer>
              <button type="button" disabled={state.pending} onClick={() => setState("confirm", undefined)}>
                取消
              </button>
              <button
                type="button"
                class={value.action === "delete" ? "danger" : "primary"}
                disabled={state.pending}
                onClick={() => void confirm()}
              >
                {state.pending ? "处理中..." : "确认"}
              </button>
            </footer>
          </AdminModal>
        )}
      </Show>
    </section>
  )
}

function CaseEditor(props: {
  item: ManagedCase
  categories: CaseCategory[]
  onClose: () => void
  onSaved: () => void
}) {
  const dockapi = useDockApi()
  const api = managementApi(dockapi)
  const [state, setState] = createStore({
    name: props.item.caseName,
    description: props.item.caseDescription ?? "",
    category: props.item.category,
    file: undefined as File | undefined,
    pending: false,
    loading: true,
    error: "",
  })
  let active = true
  onCleanup(() => {
    active = false
  })
  onMount(() => {
    void api
      .case(props.item)
      .then((item) => {
        if (active) setState({ name: item.caseName, description: item.caseDescription ?? "", category: item.category })
      })
      .catch((error) => {
        if (active) setState("error", String(error))
      })
      .finally(() => {
        if (active) setState("loading", false)
      })
  })
  const save = async (event: SubmitEvent) => {
    event.preventDefault()
    if (state.pending || state.loading) return
    setState({ pending: true, error: "" })
    const form = new FormData()
    form.set("caseName", state.name.trim())
    form.set("caseDescription", state.description.trim())
    form.set("category", state.category)
    if (state.file) form.set("coverFile", state.file)
    try {
      await api.updateCase(props.item, form)
      if (active) props.onSaved()
    } catch (error) {
      if (active) setState("error", error instanceof Error ? error.message : "保存失败")
    } finally {
      if (active) setState("pending", false)
    }
  }
  return (
    <AdminModal title="编辑案例" pending={state.pending} onClose={props.onClose}>
      <form onSubmit={save}>
        <div class="admin-form-body">
          <AdminError error={state.error} />
          <fieldset disabled={state.pending || state.loading}>
            <label>
              案例名称
              <input
                required
                maxlength={255}
                value={state.name}
                onInput={(event) => setState("name", event.currentTarget.value)}
              />
            </label>
            <label>
              案例说明
              <textarea
                rows={3}
                maxlength={255}
                value={state.description}
                onInput={(event) => setState("description", event.currentTarget.value)}
              />
            </label>
            <label>
              分类
              <select
                value={state.category}
                disabled={props.item.source === "langgraph" || props.item.agentType === "mstock"}
                onChange={(event) => setState("category", event.currentTarget.value)}
              >
                <For each={props.categories}>{(item) => <option value={item.code}>{item.label}</option>}</For>
              </select>
            </label>
            <label>
              案例封面
              <ProtectedCover item={props.item} />
              <input
                type="file"
                accept={props.item.source === "langgraph" ? "image/png,image/jpeg" : "image/png,image/jpeg,image/webp"}
                onChange={(event) => setState("file", event.currentTarget.files?.[0])}
              />
            </label>
          </fieldset>
        </div>
        <footer>
          <button type="button" disabled={state.pending} onClick={props.onClose}>
            取消
          </button>
          <button class="primary" disabled={state.pending || state.loading}>
            {state.pending ? "保存中..." : "保存修改"}
          </button>
        </footer>
      </form>
    </AdminModal>
  )
}

function ProtectedCover(props: { item: ManagedCase }) {
  const dockapi = useDockApi()
  const [state, setState] = createStore({ url: "", error: "" })
  let active = true
  let url = ""
  onCleanup(() => {
    active = false
    if (url) URL.revokeObjectURL(url)
  })
  onMount(() => {
    void dockapi.research
      .fetch(props.item.coverUrl)
      .then(async (response) => {
        if (!response.ok) throw new Error("封面读取失败")
        const blob = await response.blob()
        if (!active) return
        url = URL.createObjectURL(blob)
        setState("url", url)
      })
      .catch((error) => {
        if (active) setState("error", String(error))
      })
  })
  return (
    <Show when={state.url} fallback={<span class="admin-secondary">{state.error || "正在读取封面..."}</span>}>
      <img class="admin-cover" src={state.url} alt={props.item.caseName} />
    </Show>
  )
}
