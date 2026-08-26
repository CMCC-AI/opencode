import { Portal } from "solid-js/web"
import { For, Show, createEffect, on, onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import type { DockApiSession } from "@/context/dockapi"
import { useDockApi } from "@/context/dockapi"
import { CMCC_CASE_CATEGORIES, cmccCaseCategoryByAgentType } from "@/utils/cmcc-cases"
import { showToast } from "@/utils/toast"

export function CasePublishDialog(props: {
  session?: DockApiSession
  onClose: () => void
  onPublished: () => void
}) {
  const dockapi = useDockApi()
  const [form, setForm] = createStore({
    caseName: "",
    caseTag: "",
    coverFile: undefined as File | undefined,
    coverPreview: "",
    submitting: false,
  })
  let input: HTMLInputElement | undefined

  const revokePreview = () => {
    if (form.coverPreview) URL.revokeObjectURL(form.coverPreview)
  }

  createEffect(
    on(
      () => props.session?.id,
      () => {
        const session = props.session
        revokePreview()
        if (!session) return
        const category = cmccCaseCategoryByAgentType(session.agentType)
        setForm({
          caseName: session.title,
          caseTag: category?.label ?? CMCC_CASE_CATEGORIES[0].label,
          coverFile: undefined,
          coverPreview: "",
          submitting: false,
        })
        if (input) input.value = ""
      },
    ),
  )

  onCleanup(revokePreview)

  const close = () => {
    if (form.submitting) return
    revokePreview()
    props.onClose()
  }

  const selectCover = (event: Event) => {
    const target = event.currentTarget as HTMLInputElement
    const file = target.files?.[0]
    if (!file) return
    const extension = file.name.split(".").at(-1)?.toLowerCase()
    if (!extension || !["jpg", "jpeg", "png", "webp"].includes(extension) || !file.type.startsWith("image/")) {
      showToast({ variant: "default", title: "封面仅支持 JPG、PNG、WebP" })
      target.value = ""
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast({ variant: "default", title: "封面图片不能超过 5MB" })
      target.value = ""
      return
    }
    revokePreview()
    setForm({ coverFile: file, coverPreview: URL.createObjectURL(file) })
  }

  const submit = async () => {
    const session = props.session
    if (!session || form.submitting) return
    if (!form.coverFile) {
      showToast({ variant: "default", title: "请上传案例封面" })
      return
    }
    if (!form.caseName.trim()) {
      showToast({ variant: "default", title: "请输入案例名称" })
      return
    }
    if (!form.caseTag) {
      showToast({ variant: "default", title: "请选择案例分类" })
      return
    }
    setForm("submitting", true)
    await dockapi.cases
      .publish({
        businessSessionId: session.id,
        caseName: form.caseName.trim(),
        caseTag: form.caseTag,
        coverFile: form.coverFile,
      })
      .then(() => {
        showToast({ variant: "success", title: "已添加至案例库" })
        props.onPublished()
        closeAfterSubmit()
      })
      .catch((error) => {
        showToast({
          variant: "error",
          title: "案例发布失败",
          description: error instanceof Error ? error.message : String(error),
        })
      })
      .finally(() => setForm("submitting", false))
  }

  const closeAfterSubmit = () => {
    revokePreview()
    props.onClose()
  }

  return (
    <Show when={props.session}>
      <Portal>
            <div
              class="fixed inset-0 z-[620] flex items-center justify-center bg-[rgba(34,39,68,0.28)] p-5 backdrop-blur-[4px]"
              onPointerDown={(event) => {
                if (event.target === event.currentTarget) close()
              }}
            >
              <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="case-publish-title"
                class="isolate w-full max-w-[420px] overflow-hidden rounded-[8px] border border-[#cbd8f0] bg-[#f7f9ff] opacity-100 shadow-[0_22px_60px_rgba(46,66,110,0.20)]"
              >
                <header class="flex h-14 items-center justify-between border-b border-[#dbe4f3] bg-[#eef3ff] px-[18px]">
                  <h2 id="case-publish-title" class="text-[15px] font-semibold text-[#27334f]">
                    添加至案例库
                  </h2>
                  <button
                    type="button"
                    aria-label="关闭"
                    class="flex size-7 items-center justify-center rounded-[6px] bg-[#f1f5ff] text-[18px] text-[#6475a1] hover:bg-[#e7eeff]"
                    onClick={close}
                  >
                    ×
                  </button>
                </header>
                <div class="px-[18px] pb-2 pt-4">
                  <label class="mb-2 block text-[13px] font-medium text-[#46516b]">案例图片</label>
                  <label class="flex aspect-[1.58] w-full cursor-pointer items-center justify-center overflow-hidden rounded-[8px] border border-dashed border-[#9fb7ec] bg-[#f8faff] text-[13px] text-[#7182a8] hover:border-[#6f96ec]">
                    <input
                      ref={(element) => {
                        input = element
                      }}
                      type="file"
                      class="sr-only"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={selectCover}
                    />
                    <Show when={form.coverPreview} fallback={<span>点击上传封面图片</span>}>
                      <img src={form.coverPreview} alt="案例封面预览" class="size-full object-cover" />
                    </Show>
                  </label>

                  <label class="mb-2 mt-4 block text-[13px] font-medium text-[#46516b]" for="case-name-input">
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
                    class="h-10 w-full rounded-[6px] border border-[#d9e1ef] bg-white px-3 text-[13px] text-[#2d374f] outline-none focus:border-[#7c9df0]"
                    onChange={(event) => setForm("caseTag", event.currentTarget.value)}
                  >
                    <For each={CMCC_CASE_CATEGORIES}>{(item) => <option value={item.label}>{item.label}</option>}</For>
                  </select>
                  <p class="mt-3 rounded-[6px] bg-[#f4f7ff] px-3 py-2 text-[12px] leading-5 text-[#7180a2]">
                    发布后，当前会话的分析过程和产物将对系统内所有登录用户可见。
                  </p>
                </div>
                <footer class="flex justify-end gap-2 border-t border-[#e3e9f4] bg-[#f2f5fc] px-[18px] py-4">
                  <button
                    type="button"
                    disabled={form.submitting}
                    class="h-9 rounded-[6px] border border-[#d9e1ef] bg-white px-4 text-[13px] text-[#5d6880] hover:bg-[#f7f9fd] disabled:opacity-50"
                    onClick={close}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    disabled={form.submitting}
                    class="h-9 rounded-[6px] bg-[#4f7ff0] px-5 text-[13px] font-medium text-white hover:bg-[#416fdd] disabled:cursor-wait disabled:opacity-60"
                    onClick={() => void submit()}
                  >
                    {form.submitting ? "添加中..." : "确定新增"}
                  </button>
                </footer>
              </section>
            </div>
      </Portal>
    </Show>
  )
}
