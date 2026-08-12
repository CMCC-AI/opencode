import { createMemo, createSignal, For, Show, type Component } from "solid-js"
import { Portal } from "solid-js/web"
import { Icon } from "@opencode-ai/ui/icon"
import academicIcon from "../assets/professional-databases/academic.png"
import globalFinanceIcon from "../assets/professional-databases/global-finance.png"
import ifindIcon from "../assets/professional-databases/ifind.png"
import imfIcon from "../assets/professional-databases/imf.png"
import legalIcon from "../assets/professional-databases/legal.png"
import secIcon from "../assets/professional-databases/sec.png"
import tianyanchaIcon from "../assets/professional-databases/tianyancha.png"
import worldBankIcon from "../assets/professional-databases/world-bank.png"

export type CmccProfessionalDatabase = {
  id: string
  name: string
  description: string
  detail: string
  prompt: string
  icon: string
}

export const CMCC_PROFESSIONAL_DATABASES: CmccProfessionalDatabase[] = [
  {
    id: "ifind",
    name: "同花顺 iFinD 金融数据库",
    description: "中国及全球股票、期货、指数等金融数据",
    detail: "面向国内金融市场，覆盖股票行情、公司资料、财务报表与宏观指标。",
    prompt: "帮我去同花顺查一下茅台过去一年股价和2024年的资产负债表",
    icon: ifindIcon,
  },
  {
    id: "academic",
    name: "学术数据库",
    description: "期刊、论文、预印本、学位论文、专利等学术信息",
    detail: "检索论文、作者、机构、引用与主题趋势，适合科研调研和文献综述。",
    prompt: "帮我检索近三年关于大模型 Agent 工作流评估的高被引论文，并总结研究趋势",
    icon: academicIcon,
  },
  {
    id: "tianyancha",
    name: "天眼查企业数据库",
    description: "企业工商信息、股权、司法风险等数据",
    detail: "查询企业主体、股东高管、对外投资、经营风险与司法风险。",
    prompt: "帮我查询中国移动的工商信息、股权结构和最近司法风险",
    icon: tianyanchaIcon,
  },
  {
    id: "legal",
    name: "华宇元典法律数据库",
    description: "中国法律法规、案例数据",
    detail: "检索法规、裁判文书、典型案例与司法观点，适合法律研究场景。",
    prompt: "帮我检索近五年关于数据合规和个人信息保护的典型案例",
    icon: legalIcon,
  },
  {
    id: "world-bank",
    name: "世界银行经济数据库",
    description: "全球经济、社会与发展指标，包括 GDP、人口、通胀等",
    detail: "覆盖全球发展指标和宏观数据，适合国家与区域经济对比分析。",
    prompt: "帮我查询中国和美国近十年的 GDP、通胀率和人口数据，并生成对比表",
    icon: worldBankIcon,
  },
  {
    id: "global-finance",
    name: "全球金融数据库",
    description: "全球主要市场股票行情、财经资讯、历史数据",
    detail: "覆盖全球主要市场行情、公司财务、指数表现与财经资讯。",
    prompt: "帮我查询苹果公司过去一年的股价表现、主要财务指标和最新财经资讯",
    icon: globalFinanceIcon,
  },
  {
    id: "imf",
    name: "IMF 国际货币基金组织数据库",
    description: "全球宏观经济与金融数据，包括 GDP、通胀、利率等",
    detail: "适合跨国家宏观指标对比、经济周期分析与政策数据查询。",
    prompt: "帮我查询 2024 年主要经济体 GDP 增速、通胀和利率变化",
    icon: imfIcon,
  },
  {
    id: "sec",
    name: "SEC",
    description: "美国上市公司公告与监管文件",
    detail: "查询 10-K、10-Q、8-K 等披露文件，提取风险、业务与财务信息。",
    prompt: "帮我查询英伟达最近一年的 10-K 和 10-Q 报告摘要与关键风险",
    icon: secIcon,
  },
]

type CmccPromptActionMenuProps = {
  open: boolean
  position?: { left: number; top: number }
  menuRef: (el: HTMLDivElement) => void
  onAttach: () => void
  onExperts: () => void
  onSkills: () => void
  onKnowledge?: () => void
  onProfessionalDatabases: () => void
}

export const CmccPromptActionMenu: Component<CmccPromptActionMenuProps> = (props) => (
  <Show when={props.open && props.position}>
    <Portal>
      <div
        ref={props.menuRef}
        class="fixed z-[200] w-[218px] rounded-[10px] border border-v2-border-border-base bg-v2-background-bg-layer-01 p-1 shadow-[0_18px_48px_rgba(0,0,0,0.18)]"
        style={{
          left: `${props.position?.left ?? 0}px`,
          top: `${props.position?.top ?? 0}px`,
        }}
        onMouseDown={(event) => event.preventDefault()}
      >
        <PromptActionItem icon="link" label="添加文件和图片" onClick={props.onAttach} />
        <PromptActionItem icon="archive" label="专业数据库" active onClick={props.onProfessionalDatabases} />
        <PromptActionItem icon="mcp" label="专家" arrow onClick={props.onExperts} />
        <PromptActionItem icon="brain" label="技能" arrow onClick={props.onSkills} />
        <Show when={props.onKnowledge}>
          {(onKnowledge) => <PromptActionItem icon="brain" label="知识库" arrow onClick={onKnowledge()} />}
        </Show>
      </div>
    </Portal>
  </Show>
)

type PromptActionItemProps = {
  icon: "link" | "brain" | "mcp" | "archive" | "task"
  label: string
  active?: boolean
  arrow?: boolean
  onClick: () => void
}

function PromptActionItem(props: PromptActionItemProps) {
  return (
    <button
      type="button"
      class="flex h-9 w-full items-center gap-2 rounded-[7px] px-3 text-left text-[13px] leading-5 text-v2-text-text-base hover:bg-v2-overlay-simple-overlay-hover"
      classList={{ "bg-v2-background-bg-layer-02": props.active }}
      onClick={props.onClick}
    >
      <Icon name={props.icon} class="size-4 shrink-0 text-v2-icon-icon-muted" />
      <span class="min-w-0 flex-1 truncate">{props.label}</span>
      <Show when={props.arrow}>
        <Icon name="chevron-right" size="small" class="size-3.5 shrink-0 text-v2-icon-icon-muted" />
      </Show>
    </button>
  )
}

type CmccProfessionalDatabasesDialogProps = {
  onClose: () => void
  onTry: (database: CmccProfessionalDatabase) => void
}

export const CmccProfessionalDatabasesDialog: Component<CmccProfessionalDatabasesDialogProps> = (props) => {
  const [activeID, setActiveID] = createSignal(CMCC_PROFESSIONAL_DATABASES[0].id)
  const active = createMemo(
    () => CMCC_PROFESSIONAL_DATABASES.find((database) => database.id === activeID()) ?? CMCC_PROFESSIONAL_DATABASES[0],
  )

  return (
    <div
      class="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4 py-5"
      onClick={props.onClose}
    >
      <section
        class="flex max-h-[min(720px,calc(100dvh-32px))] w-full max-w-[800px] flex-col overflow-hidden rounded-[14px] bg-v2-background-bg-layer-01 shadow-[0_24px_80px_rgba(0,0,0,0.28)]"
        onClick={(event) => event.stopPropagation()}
      >
        <header class="flex h-16 shrink-0 items-center justify-between gap-4 px-6">
          <h2 class="text-[16px] font-medium leading-6 text-v2-text-text-base">专业数据库</h2>
          <div class="flex min-w-0 items-center gap-4 text-[13px] leading-5 text-v2-text-text-muted">
            <span class="hidden sm:inline">需要更多数据库？</span>
            <button type="button" class="shrink-0 text-v2-text-text-accent hover:underline">
              点此反馈
            </button>
            <button
              type="button"
              class="flex size-8 shrink-0 items-center justify-center rounded-[7px] text-v2-icon-icon-muted hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-icon-icon-base"
              onClick={props.onClose}
              aria-label="关闭专业数据库"
            >
              <Icon name="close" class="size-4" />
            </button>
          </div>
        </header>

        <div class="min-h-0 flex-1 px-6 pb-6">
          <div class="flex min-h-0 overflow-hidden rounded-[12px] border border-v2-border-border-base bg-v2-background-bg-base max-md:flex-col">
            <div class="max-h-[220px] shrink-0 overflow-y-auto border-v2-border-border-base p-2 md:max-h-none md:w-[305px] md:border-r">
              <For each={CMCC_PROFESSIONAL_DATABASES}>
                {(database) => (
                  <button
                    type="button"
                    class="flex w-full items-start gap-3 rounded-[10px] px-3 py-3 text-left hover:bg-v2-overlay-simple-overlay-hover"
                    classList={{ "bg-v2-background-bg-layer-02": active().id === database.id }}
                    onClick={() => setActiveID(database.id)}
                  >
                    <DatabaseMark database={database} />
                    <div class="min-w-0 flex-1">
                      <div class="truncate text-[13px] font-medium leading-5 text-v2-text-text-base">{database.name}</div>
                      <div class="mt-1 line-clamp-2 text-[12px] leading-5 text-v2-text-text-muted">
                        {database.description}
                      </div>
                    </div>
                  </button>
                )}
              </For>
            </div>

            <div class="min-h-0 flex-1 overflow-y-auto">
              <div class="flex h-12 items-center justify-between border-b border-v2-border-border-base px-4">
                <span class="text-[15px] font-medium leading-5 text-v2-text-text-base">示例</span>
                <button
                  type="button"
                  class="h-8 rounded-[8px] bg-v2-background-bg-layer-02 px-3 text-[13px] font-medium leading-5 text-v2-text-text-base hover:bg-v2-overlay-simple-overlay-hover"
                  onClick={() => props.onTry(active())}
                >
                  去试试
                </button>
              </div>

              <div class="flex flex-col gap-4 px-8 py-5 max-sm:px-4">
                <div class="ml-auto max-w-[360px] rounded-[12px] bg-v2-background-bg-layer-02 px-4 py-3 text-[15px] leading-6 text-v2-text-text-base">
                  {active().prompt}
                </div>
                <p class="text-[15px] leading-7 text-v2-text-text-base">
                  我来帮你查询相关数据。让我先查看可用的数据库 API。
                </p>
                <div class="flex h-11 items-center gap-2 rounded-[8px] border border-v2-border-border-base px-3 text-[13px] leading-5 text-v2-text-text-muted">
                  <Icon name="archive" class="size-4 shrink-0 text-v2-icon-icon-muted" />
                  <span class="min-w-0 truncate">查找相关数据库</span>
                  <span class="shrink-0 text-v2-text-text-faint">|</span>
                  <span class="min-w-0 truncate">{active().name}</span>
                  <Icon name="chevron-right" size="small" class="ml-auto size-3.5 shrink-0 text-v2-icon-icon-muted" />
                </div>
                <p class="text-[15px] leading-7 text-v2-text-text-base">{active().detail}</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

function DatabaseMark(props: { database: CmccProfessionalDatabase }) {
  return (
    <img
      src={props.database.icon}
      alt=""
      class="size-10 shrink-0 rounded-[10px] object-cover shadow-sm"
      draggable={false}
    />
  )
}
