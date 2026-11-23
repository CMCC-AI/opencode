---
name: deepgeo-brief
description: 位置决策研究报告（商业选址/点位评估/景区与场所布局优化）。用户要求"选址分析/评估这几个点位/位置决策/客流与商圈分析/商铺布局优化/景区运营诊断"且给出数据目录（CSV 聚合数据，可有 case.json/CASE.md）时加载本技能；单点快问、无数据目录时不加载。单 agent 全流程：数据契约与质量 → 确定性配方分析 → 评分与财务情景 → 故事化成文 → HTML/PDF 渲染交付。核心数值一律由内置 analytics 确定性计算，不在对话中估算。
metadata:
  version: 1.1.0
---

# deepgeo-brief（位置决策研究）

你（主agent）直接执行全流程，不派发任何子代理 Task。一次会话产出决策报告 Markdown + HTML + PDF。核心纪律：**数值必须由本技能内置 analytics 包（Python 确定性配方）真实计算，禁止在对话中估算核心数值**。

## 触发边界

| 用本技能 | 不用（直接对话回答） |
|---|---|
| "帮我选址/评估这几个点位/XX和YY点位怎么选" + 给了数据目录 | "什么是坪效"等概念单点问题 |
| "对这批客流/商圈/OD数据出位置决策报告" | 无数据目录、只要口头建议 |
| "景区分区商铺布局优化/供需错配分析" + 数据 | 明确只要一句话结论 |

## 环境检测（开工前确认）

| 能力 | 检查 | 缺失时行为 |
|---|---|---|
| Python ≥3.11 | `python --version` | 无法运行配方 → 只交付数据契约 + 定性分析框架，如实说明"核心数值未计算"，不出评分与图表 |
| 内置 analytics | `<本技能>/analytics/deepgeo/cli.py` 存在 | analytics 随技能目录分发，缺失时重装/重新同步本技能 |
| Chrome/Edge | PDF 导出用 | HTML 正常，PDF 降级说明 |

## 工作目录

`./deepgeo-runs/<yyyymmdd-主题>/`（如 `deepgeo-runs/20261120-XR影院八点位选址/`）：

```
10-data-contract.md     数据契约与质量结论
20-analysis/            各配方 JSON 结果（.scratch 之外的准入摘要）
20-analysis.md          领域发现摘要（指标准入清单）
30-model.md             评分/稳定性/财务/预测
40-report.md            报告正文
60-quick-report.md      渲染用正文（40 + 图表占位）
61-quick-charts.json    图表配置
00-input.json           渲染元信息
65-quick-report.html    交付 HTML
66-quick-report.pdf     交付 PDF
.scratch/               配方原始输出与临时转换（交付后可清）
```

## 配方调用标准命令

在 run 目录下，PowerShell：

```powershell
$env:PYTHONPATH = "<本技能目录绝对路径>"
python -m analytics.deepgeo.cli run --recipe <配方> --input <数据目录>\<表.csv> [--params '<json>'] --producer deepgeo-brief --output .scratch\<配方>-<对象>.json
```

结果 JSON 的 `metrics/tables/charts/warnings` 是后续一切数字的唯一来源。

## 全流程（顺序执行）

### 第1步 输入登记与场景识别
登记用户原话、决策问题、数据目录、篇幅/章节指定。读 references/scenarios.md 定场景类型（选址评估型 A / 场所运营型 B / 通用 C），登记该场景必须覆盖清单。

### 第2步 数据契约与质量（读 references/data-contract.md）
清点数据目录、读 case.json/CASE.md 元数据、逐表采样、跑 `quality.profile`，写 10-data-contract.md（含表目录、data_mode 三态贯穿声明、质量结论 proceed/degrade/request_data/stop、禁止结论）。结论为 stop 时终止并如实告知。

### 第3步 领域分析（读 references/recipes.md）
按场景默认组合跑配方（单领域首轮 ≤4 个），原始输出落 .scratch/，准入指标与发现（含证据等级）收敛进 20-analysis.md。活动/异常日必须用 `temporal.anomaly` 隔离，不混入常态判断。

### 第4步 评分与决策模型（读 references/decision-scoring.md）
`decision.score` + `decision.stability` + 财务情景（选址型）+ `forecast.baseline`（历史足够且影响决策时），写 30-model.md：七维度（含排除声明）、方向、权重档位（默认均衡推荐）、排名与稳定性、一票否决、盈亏平衡与亏损概率、预测范围与失效条件。NPV/IRR 标"未计算"。

### 第5步 大纲与成文（读 references/story-writing.md）
先写故事大纲（30-outline.md 可并入 40 头部），再分段写 40-report.md：开头 2—3 段给结论/理由/行动边界；技术翻译成人话；证据等级控制措辞；模拟数据三处标识；末章"这份结论该怎样使用"。默认 4000—8000 字。

### 第6步 一致性自核
按 story-writing.md §5 六项对照检查一遍 40-report.md，发现问题就地修复一次。

### 第7步 渲染三件套
1. 复制 40 为 60-quick-report.md：首行改为观点式 `# ` 标题（结论入题，如"# 星港中心与云澜广场进入优先洽谈，两点位因可达性硬伤出局"）；在解释性段落之后插入 `<!--CHART:xxx-id-->` 占位（4—6 处）；文末保留 `## 数据与来源` 章节。
2. 写 61-quick-charts.json：`title` 与 60 首行 H1 逐字一致；`hero_stats` ≤5（推荐点位/综合得分/盈亏平衡客流/预测区间等决策卡）；`charts` ≤6，option 直写但**全部数字只取 20-analysis/30-model 已登记值**，每图附 `table`（列 ≥2 同源）；配色用商务蓝体系。**图型多样性硬规则（详见 references/story-writing.md §3b）**：柱状图（含横向）≤ 一半、全报告 ≥3 种图型；时间趋势与预测区间用折线/区间带/蜡烛图，构成用环形/百分比堆叠，双变量用散点四象限，多维评分用雷达——禁止清一色柱状。
3. 写 00-input.json：
```json
{
  "mode": "deepgeo",
  "template": "deepgeo",
  "current_date": "<今天YYYY-MM-DD>",
  "research_question": "<决策问题一句话>",
  "brand_kicker": "DEEPGEO · 位置决策研究",
  "footer_text": "DeepGeo 位置决策快研",
  "source_heading": "## 数据与来源",
  "disclaimer_text": "本报告基于给定数据的确定性计算生成，结论受数据完整性与口径限制，不构成投资或选址承诺",
  "disclaimer_html": "免责声明：本报告由确定性数据分析流程生成，所有数值可溯源至配方计算结果。分析受数据周期、口径与质量结论限制；模拟数据仅用于方法演示，不代表真实经营效果。本报告仅供内部决策参考，不构成投资或选址承诺。"
}
```
60 正文必须包含 disclaimer_text 原文与 `## 数据与来源` 章节标题，否则渲染校验失败。

### 第8步 渲染与交付（本技能自带引擎，无需其他技能）
```
node <本技能安装路径>/render/render.mjs <run目录绝对路径>
```
路径定位：本项目内为 `.opencode/experts/deepgeo/skills/deepgeo-brief/render/render.mjs`（以 skill 工具返回的技能目录为准）。
成功输出 `OK charts=... pdf=OK`；按短码修正 60/61 后重跑（不改 40 正文）。PDF 失败不阻塞 HTML。最后交付：40/60、HTML、PDF 的绝对路径与一句话状态，并附数据模式（simulated/real/mixed）与未计算项声明。

## 红线（全程有效，摘要）

- 核心数值只出自配方 JSON 输出；对话估算、记忆补数、手算财务一律禁止
- 模拟不得写成真实效果；data_mode 贯穿契约、图表、报告三处
- 关联 ≠ 因果；`audience.association` 类发现只写"相关"，不写"导致"
- 权重不为期待排序反调；排名不稳必须如实写"互有胜负"
- 缺失不填零、异常不删除、排除维度必须声明
- NPV/IRR 未实现即写"未计算"，不手算补齐
- 只处理聚合数据；疑似个人轨迹级数据立即停止并说明
