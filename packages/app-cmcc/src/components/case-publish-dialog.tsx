import { Icon } from "@opencode-ai/ui/icon"
import { Portal } from "solid-js/web"
import { For, Show, onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import type { DockApiSession } from "@/context/dockapi"
import { useDockApi } from "@/context/dockapi"
import { CMCC_CASE_CATEGORIES, cmccCaseCategoryByAgentType } from "@/utils/cmcc-cases"
import { showToast } from "@/utils/toast"
import { createDialogMotion } from "./cmcc-motion"
import "./cmcc-action-dialog.css"

export function CasePublishDialog(props: { session?: DockApiSession; onClose: () => void; onPublished: () => void }) {
  const dockapi = useDockApi()
  return (
    <Show when={props.session} keyed>
      {(session) => (
        <CasePublishForm
          caseName={session.title}
          caseTag={cmccCaseCategoryByAgentType(session.agentType)?.label ?? CMCC_CASE_CATEGORIES[0].label}
          onPublish={(input) => dockapi.cases.publish({ ...input, businessSessionId: session.id })}
          onClose={props.onClose}
          onPublished={props.onPublished}
        />
      )}
    </Show>
  )
}

export function CasePublishForm(props: {
  caseName: string
  caseTag: string
  fixedCategory?: boolean
  onPublish: (input: { caseName: string; caseTag: string }) => Promise<unknown>
  onClose: () => void
  onPublished?: () => void
}) {
  const motion = createDialogMotion(props.onClose)
  const [form, setForm] = createStore({
    caseName: props.caseName,
    caseTag: props.caseTag,
    submitting: false,
  })
  let alive = true
  onCleanup(() => {
    alive = false
  })

  const close = () => {
    if (form.submitting) return
    motion.close()
  }

  const submit = async () => {
    if (form.submitting || motion.closing()) return
    if (!form.caseName.trim()) {
      showToast({ variant: "default", title: "请输入案例名称" })
      return
    }
    if (!form.caseTag) {
      showToast({ variant: "default", title: "请选择案例分类" })
      return
    }
    setForm("submitting", true)
    await props
      .onPublish({
        caseName: form.caseName.trim(),
        caseTag: form.caseTag,
      })
      .then(() => {
        if (!alive) return
        showToast({ variant: "success", title: "已添加至案例库" })
        props.onPublished?.()
        closeAfterSubmit()
      })
      .catch((error) => {
        if (!alive) return
        showToast({
          variant: "error",
          title: "案例发布失败",
          description: error instanceof Error ? error.message : String(error),
        })
      })
      .finally(() => {
        if (alive) setForm("submitting", false)
      })
  }

  const closeAfterSubmit = () => {
    motion.close()
  }

  return (
    <Portal>
      <div
        class="cmcc-action-overlay fixed inset-0 z-[620] flex items-center justify-center p-3"
        style={motion.overlay()}
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) close()
        }}
      >
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="case-publish-title"
          data-cmcc-case-publish
          inert={motion.closing()}
          style={motion.content()}
          class="cmcc-action-dialog isolate w-full"
        >
          <header>
            <h2 id="case-publish-title">添加至案例库</h2>
            <button
              type="button"
              aria-label="关闭"
              class="cmcc-action-close"
              disabled={form.submitting}
              onClick={close}
            >
              <Icon name="close" class="size-4" />
            </button>
          </header>
          <div class="px-5 py-5">
            <label class="mb-2 block text-[13px] font-medium text-[#46516b]" for="case-name-input">
              案例名称
            </label>
            <input
              id="case-name-input"
              maxlength={255}
              value={form.caseName}
              class="h-10 w-full rounded-[6px] border border-[#d9e1ef] px-3 text-[13px] text-[#2d374f] outline-none focus:border-[#7c9df0]"
              placeholder="请输入案例名称"
              onInput={(event) => setForm("caseName", event.currentTarget.value)}
            />

            <label class="mb-2 mt-4 block text-[13px] font-medium text-[#46516b]" for="case-tag-select">
              案例分类
            </label>
            <select
              id="case-tag-select"
              value={form.caseTag}
              disabled={props.fixedCategory}
              class="h-10 w-full rounded-[6px] border border-[#d9e1ef] bg-white px-3 text-[13px] text-[#2d374f] outline-none focus:border-[#7c9df0]"
              onChange={(event) => setForm("caseTag", event.currentTarget.value)}
            >
              <For each={CMCC_CASE_CATEGORIES}>{(item) => <option value={item.label}>{item.label}</option>}</For>
            </select>
            <p class="cmcc-action-note">发布后，当前会话的分析过程和产物将对系统内所有登录用户可见。</p>
          </div>
          <footer>
            <button type="button" disabled={form.submitting} class="cmcc-action-cancel" onClick={close}>
              取消
            </button>
            <button type="button" disabled={form.submitting} class="cmcc-action-primary" onClick={() => void submit()}>
              {form.submitting ? "添加中..." : "确定新增"}
            </button>
          </footer>
        </section>
      </div>
    </Portal>
  )
}
