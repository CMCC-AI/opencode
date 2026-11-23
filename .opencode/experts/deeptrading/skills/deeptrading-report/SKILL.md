---
name: deeptrading-report
description: A 股完整快研究报告（专家版，~10 分钟，HTML+PDF）。用户要完整报告、深度分析、图表、PDF、正式复盘时加载——"给XX出个分析报告""深度分析XX为什么跌""复盘XX最近一个季度""XX估值贵不贵，出个报告""诊断XX，要完整的""XX和YY对比研究"。覆盖归因/对比/事件影响/估值/前瞻/复盘/研判/周期反转/诊断/行业，产出现点式标题+自由大纲+图表+HTML+PDF。用户只要快速结论、一句话回答时不加载本技能（走 deeptrading-quick）；用户显式 @deeptrading/deeptrading-team-lead 时尊重选择走专家团。
metadata:
  version: 1.0.0
---

# deeptrading-report（A 股快研究报告·专家版）

你是主 agent，**不派发任何子代理**——自己调工具、自己分析、自己写报告、自己跑渲染脚本。工作目录在当前工作区根自建：`./tmp/<yyyymmdd-主题短名>/`。

## 第零步：入口防御（加载后立即做）

| 用户信号 | 处理 |
|---|---|
| 纯单点轻量问题（"能追吗""一句话说下"）且未要求报告 | 按快答五段式直答：**结论**（1-2 句+置信度）/ **要点** ≤3 条（带来源+时点）/ **反向信号** 1 句，并提示"如需完整报告（图表+PDF），请说'给XX出个分析报告'"；不强制走完整链 |
| 要操作方案 / 投资决策 / 多分析师并行采集 | 本技能不接，建议用户切回「专家」模式（@deeptrading/deeptrading-team-lead） |
| 用户显式 @deeptrading/deeptrading-team-lead | 尊重选择，建议用户切回「专家」模式 |
| 要报告 / 深度分析 / 图表 / PDF / 正式复盘 | 走下方完整链 |

## 环境检测（开工前先看自己有哪些工具）

| 能力 | 优先用 | 降级 |
|---|---|---|
| **搜索** | `web-search`（远程搜索 MCP，工具名 `web-search_*`） | `mobilework_search`（MobileWork 内置）→ `mw_search_batch_collect_search_round`（OpenCode MCP）→ 都没有用 `webfetch` |
| **结构化行情** | `akshare_get_stock_data` / `akshare_get_indicators` / `akshare_get_fundamentals` / 三表 / `akshare_get_fund_flow` / `akshare_get_sector_fund_flow` / `akshare_get_index_data`（指数）/ `akshare_get_northbound_fund_flow`（北向已停止披露，南向正常）（有 AkShare MCP 时） | 全降级搜索 |
| **渲染** | 本技能自带引擎：`node .opencode/experts/deeptrading/skills/deeptrading-report/render/render.mjs <workspace>` | 无 node 时交付纯 markdown |
| **写文件** | `write` 工具 | 无法写文件时全文在对话中输出 |

## B1. 问题类型判断与骨架选择

| 类型 | 识别词 | 报告骨架 | 必读方法论 |
|---|---|---|---|
| 归因 | 为什么跌/涨、原因 | 事实校准→驱动拆解→同业对照→预期差→情景 | `stock-deep-research.md` |
| 对比 | A 和 B 谁好 | 口径对齐→分维度→排序 | `peer-comparison.md` |
| 事件影响 | 公告/政策影响 | 事件→传导链→已定价→观察点 | `earnings-review.md` |
| 估值 | 贵不贵/值不值 | 框架→当前定价了什么→分位→触发 | `valuation-pricing.md` |
| 前瞻 | 还能涨吗/会怎样 | 基线→多情景→验证点 | `stock-deep-research.md` 第 4/5 条 |
| 复盘 | 复盘 X/我的操作 | 时间线→事件对照→归因→教训 | `abnormal-detection.md` |
| 研判 | 牛是熊/什么阶段 | 状态→多空→历史类比→切换信号 | `market-state.md` |
| 周期/反转 | 拐点到了吗/困境反转/景气位置 | 周期位置→供需拆解→情景→验证点 | `crisis-event.md` |
| 诊断 | 诊断XX/给XX做体检/XX怎么样（系统性评估） | 三面体检→消息核对→共振矩阵→风险 | `stock-diagnosis.md` |
| 行业 | XX行业怎么样/行业景气 | 行业格局→板块资金→龙头对比→风险 | `peer-comparison.md` |

**裸标的**（"中国移动"）→ 按诊断骨架走全维度快研究（近期表现/核心驱动/风险/关注点）。
**复盘涉及用户持仓但未提供数据** → 如实说明，降级为标的走势复盘。

用 `read` 工具读取本技能 `references/` 目录下对应的方法论文件。只读必读那篇；选读仅当必读内容明确指向缺口时加读。

## B2. 定向取数

预算：搜索 ≤8 条/轮、最多 2 轮；webfetch ≤6；AkShare（如可用）不限轮。

| 问题类型 | 搜索优先方向 |
|---|---|
| 归因 | "X 为什么跌/涨 <日期范围>" + "X 最近公告/新闻" |
| 对比 | "X vs Y <核心指标>" + 各自最新财报 |
| 复盘 | "X <区间> 走势" + "X <区间> 重要事件/公告" |
| 研判 | "A股 行业涨跌幅 今日" + "A股 市场分析" |
| 估值 | "X PE PB 股息率 <日期>" + "X 行业 估值对比" |
| 周期/反转 | "X 行业 供需/库存/开工率" + "X 景气周期 判断" |
| 诊断 | "XX 主力净流入 资金流" + "XX 最新财报/业绩" |
| 行业 | "XX行业 景气/供需/格局" + "XX行业 龙头 对比" |

**日期约束直接写进查询文本**（如"2026年10月"）。

## B3. 写报告

**60-quick-report.md**（正文，写入 workspace）：

```markdown
# <观点式标题：≤30 字，必须含判断>

> **核心观点**：3-5 句结论先行，含 2-3 个关键数字。

## 一、<章节：由问题类型骨架决定，5-8 章自由大纲>

<正文……关键数字后标注来源+时点>
<!--CHART:图表id-->
*数据来源：xxx，截至 YYYY-MM-DD*

## ……

## 数据与来源

1. [页面标题](URL)（时点 YYYY-MM-DD）
2. akshare:xxx（时点）

---

> 免责声明：本报告不构成投资建议，仅供研究参考。本流程产出仅用于学术研究、工程实验与教学演示。
```

**61-quick-charts.json**（图表配置，写入 workspace）：

图表规范遵循 `deeptrading-viz` 技能（如已安装）或以下内联精简版：

```json
{
  "title": "<与 60 首行 H1 完全一致>",
  "subtitle": "5-20 字副题",
  "hero_stats": [{"label": "区间最大回撤", "value": "-18.3%"}],
  "charts": [
    {
      "id": "price-trend",
      "title": "近 12 月收盘价",
      "option": {
        "tooltip": {"trigger": "axis"},
        "xAxis": {"type": "category", "data": ["25-11", "25-12"]},
        "yAxis": [{"type": "value", "name": "元"}],
        "series": [{"name": "收盘价", "type": "line", "data": [104.9, 97.3]}]
      },
      "table": {"columns": ["月份", "收盘价"], "rows": [["25-11", 104.9]]}
    }
  ]
}
```

关键规则：
- 顶层恰 4 键：title / subtitle / hero_stats / charts
- chart 键集：id / title / option / table（table 可选，建议附带）
- 60 正文里对应位置放 `<!--CHART:id-->` 占位（独立一行）
- option 为 ECharts JSON 子集，**禁函数**（formatter 用字符串模板 `"{b}: {c}%"`）
- 图型：line / bar（双轴/正负柱）/ scatter / pie / candlestick（K 线复盘）
- **涨红跌绿**：涨/正贡献用 `#b3352c`，跌/负值用 `#1f7a4d`
- 每图 ≥3 个数据点；数据只来自正文标注过的数字
- K 线：data 为 `[open, close, low, high]` 四元数组；均线 null 补齐；成交量副轴
- 正文字数 3000-8000 汉字，未指定时默认目标 8000 字

## B4. 渲染交付

1. 确认 60/61 已写入 workspace
2. 使用**本技能自带渲染引擎**（无需其他技能）：
   ```
   node <本技能安装路径>/render/render.mjs <workspace路径>
   ```
   路径定位：本项目内为 `.opencode/experts/deeptrading/skills/deeptrading-report/render/render.mjs`（以 skill 工具返回的技能目录为准）。
3. 脚本自动校验 60/61 → 渲染 65-quick-report.html → 导出 66-quick-report.pdf → 写 70-quick-stats.json
4. 校验失败（短码 INVALID_QUICK_MD / INVALID_CHARTS_JSON 等）→ 按错误修正 60/61 → 重跑
5. 成功后交付：报告全文 + 文件路径

**无 node 时降级**：不渲染 HTML/PDF，直接在对话中输出 60 的 markdown 全文。

## 红线（一票否决）

- **禁止编造数据**：拿不到就写"当前数据源未覆盖"
- **关键数字必须带来源+时点**（YYYY-MM-DD 或 YYYYQn）
- **非一手来源标"需核实原文"**
- **盘中口径**：数据为盘中时注明"未完成交易日"
- **不给操作指令**（"建议买入/卖出"），方向性判断可以有
- **不虚构持仓信息**：用户问"我的持仓"但未提供持仓数据 → 如实说明并降级为标的走势复盘
- **61 title 与 60 H1 逐字一致**
- **免责声明固定文案**（逐字照抄上述模板）

## 输出前自检

1. 60 首行观点式标题，61 title 与之一致？
2. 核心观点块在 H1 后、第一个 ## 前？
3. 每个研究子问题有回答（或如实标缺口）？
4. 关键数字带来源+时点？非一手标"需核实"？
5. 冲突数字并列呈现？
6. 61 合法 JSON、4 键、占位对应、option 无函数？
7. 文末有数据与来源+免责声明？
8. 正文 3000-8000 汉字、图表 0-6 张？
