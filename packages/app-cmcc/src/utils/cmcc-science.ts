export const SCIENCE_MODULES = [
  {
    id: "review",
    title: "论文综述",
    english: "Literature review",
    group: "发现",
    icon: "review",
    description: "从海量文献中，找到值得回答的问题。",
    input: "研究主题、时间范围、种子论文或材料路径",
    output: "文献证据矩阵 · 研究脉络 · 研究空白",
    experts: "检索策略 / 论文发现 / 证据分析 / 研究综合",
    instruction: "制定检索与筛选标准，核验论文身份，提取可追溯证据，综合研究脉络、争议与研究空白，交付系统文献综述。",
  },
  {
    id: "reproduce",
    title: "论文复现",
    english: "Paper reproduction",
    group: "验证",
    icon: "code",
    description: "让论文中的方法，经得起再次运行。",
    input: "论文链接、代码仓库、数据与算力条件",
    output: "复现代码 · 环境记录 · 指标对比报告",
    experts: "证据分析 / 代码工程 / 实验执行 / 结果分析",
    instruction:
      "提取论文原始声明，审计代码、数据和环境，确认复现口径后执行，区分原文数值与真实运行结果，交付可复现代码及差异分析。",
  },
  {
    id: "design",
    title: "实验设计",
    english: "Experiment design",
    group: "验证",
    icon: "sliders",
    description: "把一个好想法，变成可检验的假设。",
    input: "研究假设、已有方法、数据与资源约束",
    output: "实验方案 · 对照与消融 · 评估标准",
    experts: "可行性顾问 / 方法论设计 / 实验设计",
    instruction:
      "将想法形式化为可证伪假设，设计基线、变量、对照、消融、随机种子、统计方法和成功标准；交付实验方案，不自动执行实验。",
  },
  {
    id: "execute",
    title: "实验执行",
    english: "Experiment execution",
    group: "验证",
    icon: "console",
    description: "运行、诊断、分析，让每个结果有据可查。",
    input: "已确认方案、代码和数据路径、运行环境",
    output: "运行日志 · 结果图表 · 统计结论",
    experts: "代码工程 / 实验执行 / 实验诊断 / 结果分析",
    instruction:
      "先核验已有实验方案及资源授权，再运行可执行的计算或仿真实验，保存命令、环境、日志，诊断失败并分析真实结果；无执行条件时说明缺失条件，不伪造执行。",
  },
  {
    id: "write",
    title: "论文撰写",
    english: "Scientific writing",
    group: "表达",
    icon: "edit",
    description: "以证据组织论证，让研究被清楚理解。",
    input: "研究结果、证据文件、草稿与目标期刊",
    output: "论文草稿 · 图表说明 · 参考文献",
    experts: "论证大纲 / 证据写作 / 图表引用编辑",
    instruction:
      "先审计现有研究证据，再建立论证大纲、撰写正文并整理图表引用，保留不确定性，不编造实验或引用，交付前由独立审查专家核验。",
  },
  {
    id: "peer-review",
    title: "模拟审稿",
    english: "Peer review",
    group: "表达",
    icon: "checklist",
    description: "在投稿之前，听见另一种专业判断。",
    input: "论文草稿、补充材料、目标期刊或会议",
    output: "审稿意见 · 问题分级 · 修订清单",
    experts: "独立审稿 / 引用审计",
    instruction:
      "以独立审稿视角评估新颖性、方法、证据、可复现性与论证，核验引用并按严重程度输出问题和可操作的修订建议；这是模拟审稿，不代表真实期刊决定。",
  },
] as const

export function sciencePrompt(input: {
  ids: readonly string[]
  mode: "single" | "flow"
  topic: string
  materials: string
}) {
  const modules = input.ids.flatMap((id) => SCIENCE_MODULES.filter((item) => item.id === id))
  if (!modules.length || !input.topic.trim()) return undefined
  return [
    "【AI for Science 科研工作台】",
    `执行模式：${input.mode === "single" ? "独立环节，仅完成本次目标，不自动扩展到全流程" : "按以下顺序执行选定研究流程，复用上一步已验证的产物"}`,
    `研究需求：${input.topic.trim()}`,
    `已有材料：${input.materials.trim() || "尚未提供，请先确认所需材料"}`,
    ...modules.map((item, index) => `${index + 1}. ${item.title}：${item.instruction}`),
    "由科研主理人按需调度对应专家，先接管现有研究状态。缺失必要输入时先澄清，保留 G1-G4 人工闸门、证据追溯与独立审查。阶段间在当前对话中交接已核验产物，不自动跨越未确认闸门。",
  ].join("\n\n")
}
