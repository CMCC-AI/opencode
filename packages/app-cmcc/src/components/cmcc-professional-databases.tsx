import { createMemo, createSignal, For, Show, type Component } from "solid-js"
import { CmccPromptPanel } from "./cmcc-prompt-panel"
import { Icon } from "@opencode-ai/ui/icon"
import academicIcon from "../assets/professional-databases/academic.png"
import bochaIcon from "../assets/professional-databases/bocha.svg"
import byteSearchIcon from "../assets/professional-databases/byte-search.svg"
import githubIcon from "../assets/professional-databases/github.svg"
import ifindIcon from "../assets/professional-databases/ifind.png"
import sogouIcon from "../assets/professional-databases/sogou.svg"
import tianyanchaIcon from "../assets/professional-databases/tianyancha.png"

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
    id: "github",
    name: "Github 开源项目库",
    description: "开源项目、代码仓库、Issue 与开发者社区数据",
    detail: "检索开源仓库、代码、Issue 和项目活跃度，适合技术选型与开源项目调研。",
    prompt: "帮我在 Github 查找近期活跃的大模型 Agent 框架，并对比项目热度和主要特性",
    icon: githubIcon,
  },
  {
    id: "bocha",
    name: "博查搜索",
    description: "聚合互联网网页、新闻与实时信息",
    detail: "搜索公开网页、新闻和实时信息，适合事实核验、资讯追踪与综合调研。",
    prompt: "帮我用博查搜索汇总今天人工智能领域的重要新闻，并标注信息来源",
    icon: bochaIcon,
  },
  {
    id: "sogou",
    name: "搜狗搜索",
    description: "中文网页、资讯与内容搜索",
    detail: "检索中文互联网网页与资讯内容，适合查找中文资料和热点信息。",
    prompt: "帮我用搜狗搜索整理近期关于低空经济的政策和行业动态",
    icon: sogouIcon,
  },
  {
    id: "byte-search",
    name: "字节搜索",
    description: "网页、新闻与多类型互联网内容搜索",
    detail: "搜索网页、新闻及多类型公开内容，适合快速获取实时信息与多来源资料。",
    prompt: "帮我用字节搜索汇总最近一周生成式 AI 产品的重要更新",
    icon: byteSearchIcon,
  },
]

type CmccPromptActionMenuProps = {
  onAttach: () => void
  onExperts: () => void
  onSkills: () => void
  onKnowledge?: () => void
  onProfessionalDatabases: () => void
}

export const CmccPromptActionMenu: Component<CmccPromptActionMenuProps> = (props) => (
  <div
    data-component="cmcc-prompt-action-menu"
    class="max-h-[min(420px,45dvh)] w-[218px] max-w-full overflow-y-auto rounded-[10px] border border-v2-border-border-base bg-v2-background-bg-layer-01 p-1 shadow-[0_12px_32px_rgba(0,0,0,0.14)]"
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
    <CmccPromptPanel title="专业数据库" onClose={props.onClose}>
      <div class="p-3">
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
    </CmccPromptPanel>
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
