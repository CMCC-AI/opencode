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
    name: "Shoppers Pro 购买决策专家团",
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
    name: "DeepInspect 巡查分析专家团",
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
  {
    kind: "team",
    id: "zhengqi-visit-intel",
    name: "DeepEngage谈参高拜专家团",
    description:
      "融合内部门户数据与公开情报，产出可溯源的政企拜访决策报告：为何拜访、谈什么、争取什么共识。",
    leadAgent: "zhengqi-visit-intel/zhengqi-visit-intel-team-lead",
    defaultPrompt: "帮我生成某客户的谈参高拜报告，内部门户导出数据在这里：[文件路径]",
    tags: ["政企客户洞察", "高价值拜访准备", "商情研究与报告"],
    examples: [
      "帮我生成某客户的谈参高拜报告，内部门户导出数据在这里：[文件路径]",
      "拜访前快速研判：这家客户最近发生了什么，值得跟进的合作机会有哪些？",
      "核验这份报告里的企业基本信息和领导层人物，给我可溯源的修订建议。",
    ],
    members: [
      { id: "zhengqi-visit-intel/zhengqi-visit-intel-team-lead", name: "谈高见", profession: "谈参报告总编", role: "lead" },
      { id: "zhengqi-visit-intel/sensitive-check-officer", name: "安无患", profession: "政企安全检测专员" },
      { id: "zhengqi-visit-intel/internal-intel-researcher", name: "闻若渊", profession: "内部客户情报研究员" },
      { id: "zhengqi-visit-intel/research-query-planner", name: "牟定策", profession: "政企研究规划师" },
      { id: "zhengqi-visit-intel/public-web-researcher", name: "罗广闻", profession: "权威公开信息研究员" },
      { id: "zhengqi-visit-intel/intelligence-synthesizer", name: "甄融汇", profession: "内外情报融合分析师" },
      { id: "zhengqi-visit-intel/research-reflection-analyst", name: "慎思明", profession: "研究质量反思专员" },
      { id: "zhengqi-visit-intel/outline-architect", name: "柯章法", profession: "谈参报告大纲设计师" },
      { id: "zhengqi-visit-intel/report-chief-writer", name: "毕文成", profession: "政企报告撰写专家" },
      { id: "zhengqi-visit-intel/evidence-verify-officer", name: "严可证", profession: "关键事实证据核验官" },
      { id: "zhengqi-visit-intel/report-visual-designer", name: "蓝启图", profession: "报告视觉设计师" },
    ],
  },
  {
    kind: "team",
    id: "deepcampaign",
    name: "DeepCampaign 营销方案专家团",
    description: "洞察人群，生成营销方案与报告",
    leadAgent: "deepcampaign/deepcampaign-team-lead",
    defaultPrompt: "帮我分析目标人群并生成营销方案",
    tags: ["人群洞察", "营销方案", "报告生成"],
    examples: [
      "帮我分析目标人群并生成营销方案",
      "为新产品制定一份完整的营销推广计划",
      "分析竞品营销策略并给出优化建议",
    ],
    members: [
      { id: "deepcampaign/deepcampaign-team-lead", name: "营销总监", profession: "营销方案总编", role: "lead" },
    ],
  },
  {
    kind: "team",
    id: "ai-scientist",
    name: "AI Scientist 科研分析专家团",
    description: "从论文理解到可信复现",
    leadAgent: "ai-scientist/ai-scientist-team-lead",
    defaultPrompt: "帮我解读这篇论文并给出复现方案",
    tags: ["论文解读", "实验复现", "科研分析"],
    examples: [
      "帮我解读这篇论文并给出复现方案",
      "分析这篇论文的核心贡献和方法论",
      "帮我梳理这个研究方向的发展脉络",
    ],
    members: [
      { id: "ai-scientist/ai-scientist-team-lead", name: "科研总监", profession: "科研分析总编", role: "lead" },
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

export const EXPERT_AVATARS = import.meta.glob("../../../../.opencode/experts/*/avatars/*.png", {
  eager: true,
  import: "default",
  query: "?url",
}) as Record<string, string>

// 96px 缩略图，由 packages/app-cmcc/scripts/generate-avatar-thumbs.ps1 生成；小尺寸场景优先使用
export const EXPERT_AVATAR_THUMBS = import.meta.glob("../../../../.opencode/experts/*/avatars/thumb/*.png", {
  eager: true,
  import: "default",
  query: "?url",
}) as Record<string, string>

function expertAvatarUrl(team: string, agent: string) {
  return (
    EXPERT_AVATAR_THUMBS[`../../../../.opencode/experts/${team}/avatars/thumb/${agent}.png`] ??
    EXPERT_AVATARS[`../../../../.opencode/experts/${team}/avatars/${agent}.png`]
  )
}

export function cmccMemberAvatarUrl(member: TeamMember) {
  const [team, agent] = member.id.split("/")
  if (!team || !agent) return
  return expertAvatarUrl(team, agent)
}

export function cmccTeamAvatarUrl(expert: TeamExpert) {
  return expertAvatarUrl(expert.id, "team") ?? expertAvatarUrl(expert.id, expert.leadAgent.split("/")[1] ?? "")
}

export function cmccExpertChineseName(expert: TeamExpert) {
  const index = expert.name.search(/[\u4e00-\u9fff]/)
  return index === -1 ? expert.name : expert.name.slice(index)
}
