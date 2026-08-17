export type ExternalExpert = {
  kind: "external"
  id: string
  name: string
  description: string
  url: string
  tags: string[]
}

export type TeamMember = {
  id: string
  name: string
  profession: string
  role?: "lead" | "member"
}

export type TeamExpert = {
  kind: "team"
  id: string
  name: string
  description: string
  leadAgent: string
  defaultPrompt: string
  tags: string[]
  examples: string[]
  members: TeamMember[]
}

export type CmccExpert = ExternalExpert | TeamExpert

export const CMCC_EXPERTS: CmccExpert[] = [
  {
    kind: "external",
    id: "chat",
    name: "DeepInsight 深度洞察",
    description: "通用研究、写作、分析和办公任务助手。",
    url: "http://152.136.106.161:3001/chat",
    tags: ["通用问答", "内容生成", "办公"],
  },
  {
    kind: "external",
    id: "workspace",
    name: "DeepTrack 行业资讯追踪",
    description: "行业资讯、热点事件和专题动态追踪。",
    url: "http://81.70.174.140:8888/",
    tags: ["行业资讯", "追踪", "日报"],
  },
  {
    kind: "team",
    id: "investment-masters-team",
    name: "投资大师专家团",
    description:
      "13 位传奇投资哲学家和 6 位专业分析师并行给出信号，再由风险管理师和投资组合经理形成多视角投资决策。",
    leadAgent: "investment-masters-team/hedge-fund-lead",
    defaultPrompt: "帮我从多位投资大师的视角分析下腾讯的基本面和估值",
    tags: ["价值投资", "估值", "组合决策"],
    examples: [
      "帮我从多位投资大师的视角分析下腾讯的基本面和估值",
      "用巴菲特、芒格和彼得林奇的视角分析苹果是否值得长期持有",
      "帮我对比阿里和美团的商业质量、估值和风险",
    ],
    members: [
      { id: "investment-masters-team/hedge-fund-lead", name: "贺知衡", profession: "基金经理", role: "lead" },
      { id: "investment-masters-team/oracle-of-omaha", name: "奥马哈先知", profession: "价值投资大师" },
      { id: "investment-masters-team/charlie-munger", name: "查理·芒格", profession: "理性思维大师" },
      { id: "investment-masters-team/magellan-captain", name: "麦哲伦舵手", profession: "GARP成长投资大师" },
      { id: "investment-masters-team/the-big-short", name: "大空头", profession: "深度价值逆向投资大师" },
      { id: "investment-masters-team/black-swan-prophet", name: "黑天鹅之父", profession: "反脆弱分析大师" },
      { id: "investment-masters-team/mama-wood", name: "木头姐", profession: "颠覆性创新投资大师" },
      { id: "investment-masters-team/ben-graham", name: "本杰明·格雷厄姆", profession: "价值投资之父" },
      { id: "investment-masters-team/wall-street-activist", name: "华尔街斗牛士", profession: "激进主义投资大师" },
      { id: "investment-masters-team/macro-king", name: "宏观之王", profession: "宏观投资大师" },
      { id: "investment-masters-team/dhandho-master", name: "Dhandho掌门", profession: "Dhandho投资大师" },
      { id: "investment-masters-team/phil-fisher", name: "费雪", profession: "成长品质投资大师" },
      { id: "investment-masters-team/dean-of-valuation", name: "估值教父", profession: "估值专家" },
      { id: "investment-masters-team/rakesh-jhunjhunwala", name: "金君瓦拉", profession: "新兴市场成长投资大师" },
      { id: "investment-masters-team/fundamentals-analyst", name: "基本面分析师", profession: "基本面分析" },
      { id: "investment-masters-team/technicals-analyst", name: "技术面分析师", profession: "技术面分析" },
      { id: "investment-masters-team/valuation-analyst", name: "估值分析师", profession: "估值分析" },
      { id: "investment-masters-team/sentiment-analyst", name: "情绪分析师", profession: "市场情绪" },
      { id: "investment-masters-team/growth-analyst", name: "成长分析师", profession: "成长分析" },
      { id: "investment-masters-team/news-sentiment-analyst", name: "新闻情绪分析师", profession: "新闻情绪" },
      { id: "investment-masters-team/risk-manager", name: "风险管理师", profession: "风险约束" },
      { id: "investment-masters-team/portfolio-manager", name: "投资组合经理", profession: "最终决策" },
    ],
  },
  {
    kind: "team",
    id: "deeptrading",
    name: "DeepTrading 财经分析专家团",
    description:
      "多智能体财经分析团队：标的识别、四维并行分析（市场/舆情/新闻/基本面）、投资决策、交易方案与七章可视化报告，一站式投研交付。",
    leadAgent: "deeptrading/deeptrading-team-lead",
    defaultPrompt: "研究一下贵州茅台最近怎么样",
    tags: ["财经分析", "技术面分析", "基本面分析"],
    examples: [
      "研究一下贵州茅台最近怎么样",
      "分析 600519 在 2026-08-08 的交易决策",
      "帮我深度研究宁德时代（300750）",
    ],
    members: [
      { id: "deeptrading/deeptrading-team-lead", name: "何执舟", profession: "A股投研全流程编排专家", role: "lead" },
      { id: "deeptrading/dt-intake", name: "阿核", profession: "信息确认员" },
      { id: "deeptrading/dt-market-analyst", name: "阿波", profession: "市场分析专家" },
      { id: "deeptrading/dt-sentiment-analyst", name: "阿言", profession: "舆情分析专家" },
      { id: "deeptrading/dt-news-analyst", name: "阿讯", profession: "新闻分析专家" },
      { id: "deeptrading/dt-fundamentals-analyst", name: "阿基", profession: "基本面分析专家" },
      { id: "deeptrading/dt-research-manager", name: "阿理", profession: "投资决策经理" },
      { id: "deeptrading/dt-trader", name: "严止损", profession: "仓位/止盈止损/风控专家" },
      { id: "deeptrading/dt-report-writer", name: "阿汇", profession: "报告撰写专家" },
      { id: "deeptrading/dt-viz", name: "阿绘", profession: "可视化专家" },
    ],
  },
  {
    kind: "team",
    id: "shoppers-pro",
    name: "Shoppers Pro",
    description:
      "全品类AI购买决策专家团。务实需求洞察 + 各平台比价 + 真实口碑分析 + 推荐指数，给你可点击的购买决策报告。",
    leadAgent: "shoppers-pro/shoppers-pro-team-lead",
    defaultPrompt: "给父母买一台三千元左右的手机，操作简单、续航好，推荐一些并给购买入口",
    tags: ["商品推荐", "比价比渠道", "购买决策"],
    examples: [
      "给父母买一台三千元左右的手机，操作简单、续航好，推荐一些并给购买入口",
      "油皮通勤用的防晒，预算两百，有什么推荐",
      "一万元以内适合剪视频的笔记本，求推荐",
    ],
    members: [
      { id: "shoppers-pro/shoppers-pro-team-lead", name: "申浩客", profession: "首席选购顾问", role: "lead" },
      { id: "shoppers-pro/need-insight", name: "林雪晴", profession: "需求洞察师" },
      { id: "shoppers-pro/product-discoverer", name: "搜旷标", profession: "商品发现师" },
      { id: "shoppers-pro/reputation-scout", name: "严不慌", profession: "口碑分析员" },
      { id: "shoppers-pro/card-editor", name: "甄措花", profession: "推荐编辑师" },
    ],
  },
  {
    kind: "team",
    id: "deepinspect",
    name: "DeepInspect",
    description:
      "基于AI技术深度识别现场安全风险，自动归并问题线索，生成结构化巡查报告与整改方案的专家协作团队。",
    leadAgent: "deepinspect/deepinspect-team-lead",
    defaultPrompt: "帮我分析巡查材料，识别现场风险并生成巡查报告",
    tags: ["现场风险识别", "巡查报告生成", "整改方案制定"],
    examples: [
      "帮我分析巡查材料，识别现场风险并生成巡查报告",
      "我有几张现场照片，帮我识别安全隐患",
      "根据巡查发现的问题，生成整改方案",
    ],
    members: [
      { id: "deepinspect/deepinspect-team-lead", name: "督巡安", profession: "巡查编排总监", role: "lead" },
      { id: "deepinspect/intent-analyst", name: "明意图", profession: "意图分析专家" },
      { id: "deepinspect/query-planner", name: "谋方略", profession: "巡查规划专家" },
      { id: "deepinspect/risk-identifier", name: "辨见微", profession: "风险识别专家" },
      { id: "deepinspect/material-researcher", name: "求甚睿", profession: "材料研究专家" },
      { id: "deepinspect/web-researcher", name: "网博源", profession: "网络研究专家" },
      { id: "deepinspect/problem-consolidator", name: "归一清", profession: "问题归并分析师" },
      { id: "deepinspect/reflector", name: "审思谨", profession: "反思评估专家" },
      { id: "deepinspect/outline-architect", name: "构宏图", profession: "大纲架构专家" },
      { id: "deepinspect/report-writer", name: "述理明", profession: "报告撰写专家" },
      { id: "deepinspect/evidence-reviewer", name: "证无遗", profession: "证据核验专家" },
      { id: "deepinspect/viz-specialist", name: "绘图明", profession: "数据可视化专家" },
    ],
  },
]

export const CMCC_TEAM_EXPERTS = CMCC_EXPERTS.filter((expert): expert is TeamExpert => expert.kind === "team")

export function cmccExpertHref(expert: CmccExpert) {
  return `/expert/${expert.id}`
}

export function cmccExpertCenterHref() {
  return "/expert"
}

export function cmccTeamExpertByAgent(agent: string | undefined) {
  if (!agent) return
  return CMCC_TEAM_EXPERTS.find((expert) => expert.leadAgent === agent)
}
