import { createResource, Show } from "solid-js"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { useDockApi } from "@/context/dockapi"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"

const tokens = new Intl.NumberFormat("zh-CN")
const date = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
})

export function SettingsQuotaV2() {
  const dockapi = useDockApi()
  const [quota, { refetch }] = createResource(() => dockapi.quota.get())
  return (
    <>
      <div class="settings-v2-tab-body">
        <Show when={quota.loading}>
          <p class="text-14-regular text-text-weak">正在读取额度...</p>
        </Show>
        <Show when={quota.error}>
          <p role="alert" class="text-14-regular text-text-weak">
            {quota.error instanceof Error ? quota.error.message : "额度读取失败"}
          </p>
        </Show>
        <Show when={!quota.error && quota()}>
          {(value) => (
            <>
              <Show
                when={value().enabled}
                fallback={<p class="text-14-regular text-text-weak">Token 额度控制未启用</p>}
              >
                <SettingsListV2>
                  <SettingsRowV2 title="用户类型" description="">
                    <span>{value().vip ? "VIP" : "普通用户"}</span>
                  </SettingsRowV2>
                  <SettingsRowV2 title="本周额度" description="">
                    <span>
                      {value().vip
                        ? "不限额"
                        : value().weeklyLimit === null
                          ? "未配置"
                          : tokens.format(value().weeklyLimit!)}
                    </span>
                  </SettingsRowV2>
                  <SettingsRowV2 title="已消耗" description="">
                    <span>{tokens.format(value().used)} Token</span>
                  </SettingsRowV2>
                  <SettingsRowV2 title="执行中预占" description="">
                    <span>{tokens.format(value().reserved)} Token</span>
                  </SettingsRowV2>
                  <SettingsRowV2 title="本周剩余" description="">
                    <span>
                      {value().vip
                        ? "不限额"
                        : value().remaining === null
                          ? "未知"
                          : tokens.format(value().remaining!) + " Token"}
                    </span>
                  </SettingsRowV2>
                  <SettingsRowV2 title="下次重置" description="每周一 00:00（北京时间）">
                    <span>{date.format(value().resetAt)}</span>
                  </SettingsRowV2>
                </SettingsListV2>
                <p class="text-12-regular text-text-weak mt-4">
                  通用深度洞察按上游已上报用量统计，AI 润色未计入已核实消耗。
                </p>
                <Show when={value().hasUnknownUsage}>
                  <p class="text-12-regular text-text-weak mt-2">存在上游用量不完整或待核对的调用。</p>
                </Show>
              </Show>
            </>
          )}
        </Show>
        <ButtonV2
          class="mt-4"
          variant="neutral"
          disabled={quota.loading}
          onClick={() => void Promise.resolve(refetch()).catch(() => undefined)}
        >
          刷新额度
        </ButtonV2>
      </div>
    </>
  )
}
