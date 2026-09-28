import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { createMemo, createResource, Show, type Component } from "solid-js"
import { useServerSDK } from "@/context/server-sdk"
import { useDockApi } from "@/context/dockapi"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"
import "./settings-v2.css"

const tokens = new Intl.NumberFormat("zh-CN")

export const SettingsQuotaV2: Component = () => {
  const serverSdk = useServerSDK()
  const dockapi = useDockApi()
  const [quota, { refetch }] = createResource(() =>
    serverSdk()
      .client.tokenQuota.get({ directory: dockapi.workspace?.directoryPath })
      .then((response) => response.data),
  )
  const dailyPercent = createMemo(() => percent(quota()?.dailyUsed, quota()?.dailyLimit))
  const monthlyPercent = createMemo(() => percent(quota()?.monthlyUsed, quota()?.monthlyLimit))

  return (
    <>
      <div class="settings-v2-tab-header">
        <h2 class="settings-v2-tab-title">Token 限额</h2>
      </div>
      <div class="settings-v2-tab-body settings-v2-providers">
        <Show when={quota.loading}>
          <div class="settings-v2-models-status">正在读取个人限额…</div>
        </Show>
        <Show when={quota.error}>
          <div class="settings-v2-section">
            <p class="text-14-regular text-text-weak">限额信息暂时不可用，请确认登录状态后重试。</p>
            <ButtonV2 size="normal" variant="neutral" onClick={() => void refetch()}>
              重新加载
            </ButtonV2>
          </div>
        </Show>
        <Show when={quota()}>
          {(value) => (
            <>
              <div class="settings-v2-section">
                <h3 class="settings-v2-section-title">当前用量</h3>
                <SettingsListV2>
                  <QuotaRow
                    title="今日额度"
                    used={value().dailyUsed}
                    limit={value().dailyLimit}
                    remaining={value().dailyRemaining}
                    percent={dailyPercent()}
                    resetAt={value().dailyResetAt}
                  />
                  <QuotaRow
                    title="本月额度"
                    used={value().monthlyUsed}
                    limit={value().monthlyLimit}
                    remaining={value().monthlyRemaining}
                    percent={monthlyPercent()}
                    resetAt={value().monthlyResetAt}
                  />
                </SettingsListV2>
              </div>
              <div class="settings-v2-section">
                <h3 class="settings-v2-section-title">限额配置</h3>
                <SettingsListV2>
                  <SettingsRowV2 title="单次请求上限" description="包含输入 Token 与最大输出预算">
                    <span class="text-13-medium text-text-base">{formatLimit(value().requestLimit)}</span>
                  </SettingsRowV2>
                  <SettingsRowV2 title="超额处理" description="额度耗尽后不会继续使用系统 API Key">
                    <span class="text-13-medium text-text-base">
                      {value().overage === "reject" ? "拒绝请求" : "允许并记录审计"}
                    </span>
                  </SettingsRowV2>
                  <SettingsRowV2 title="计量周期" description="日/月用量按 UTC 自然周期累计">
                    <span class="text-13-medium text-text-base">UTC 自然日 / 自然月</span>
                  </SettingsRowV2>
                </SettingsListV2>
                <p class="text-12-regular text-text-weak">
                  限额由管理员统一配置。模型调用开始前会预占额度，完成后按供应商返回的实际 Token 用量结算。
                </p>
              </div>
            </>
          )}
        </Show>
      </div>
    </>
  )
}

const QuotaRow: Component<{
  title: string
  used: number
  limit: number | null
  remaining: number | null
  percent: number
  resetAt: number
}> = (props) => (
  <div class="flex flex-col gap-2 px-4 py-3">
    <div class="flex items-center justify-between gap-4">
      <div class="flex flex-col gap-0.5">
        <span class="text-14-medium text-text-strong">{props.title}</span>
        <span class="text-12-regular text-text-weak">{resetLabel(props.resetAt)}重置</span>
      </div>
      <div class="text-right">
        <div class="text-13-medium text-text-base">
          已用 {tokens.format(props.used)} / {formatLimit(props.limit)}
        </div>
        <div class="text-12-regular text-text-weak">剩余 {formatLimit(props.remaining)}</div>
      </div>
    </div>
    <div class="h-2 overflow-hidden rounded-full bg-surface-base">
      <div
        class="h-full rounded-full bg-icon-interactive-base transition-[width]"
        style={{ width: `${props.percent}%` }}
      />
    </div>
  </div>
)

function percent(used?: number, limit?: number | null) {
  if (!limit || used === undefined) return 0
  return Math.min(100, Math.max(0, Math.round((used / limit) * 100)))
}

function formatLimit(value: number | null) {
  return value === null ? "不限" : `${tokens.format(value)} Token`
}

function resetLabel(value: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}
