---
name: zyzx-brief
description: 智慧巡察材料整编报告生成。用户要求"整编巡察材料/出巡察报告/巡察问题归并研判"且给出巡察材料（巡察报告、问题清单、业务底稿、整改台账等）时加载本技能；单点问答、A股研究（deeptrading）、政企谈参（zhengqi）、通用行业研究（deepinsight）不加载。完整走要求台账、材料深读与问题台账、按需共性归并、章节蓝图、分批长文写作、自核验与HTML/PDF渲染交付，默认最低12000字。
metadata:
  version: 1.0.0
---

# zyzx-brief（智慧巡察整编）

你（主agent）直接执行全流程，不派发任何子代理Task。一次会话产出完整巡察整编报告与HTML/PDF。用户完整原话、指定章节、篇幅、写法与禁止事项全程贯穿，不得中途丢失或弱化；不得把用户原始输入缩成一句泛化主题。默认禁网。

## 触发边界

| 用本技能 | 不用 |
|---|---|
| "整编这些巡察材料出报告"、"巡察问题归并研判" | 巡察材料相关的单点问答 |
| 给了巡察材料目录 + 章节/篇幅要求 | A股标的交易研究（deeptrading-brief） |
| 多份问题清单/底稿/整改台账要综合报告 | 政企客户谈参（zhengqi-brief） |
| | 通用行业深度研究（deepinsight-brief） |

## 工作目录

在当前工作区根创建：`./zyzx-runs/<yyyymmdd-主题短名>/`（如 `zyzx-runs/20261116-县分公司巡察/`）。全部中间产物与交付物落在此目录，不在对话中囤积全文：

```
10-requirements.md    要求台账（第1步写，全程对照）
90-sources/           材料抽取缓存（docx/xlsx 转出的文本，第2步）
20-issues-ledger.md   问题与事实台账 + 引用编号表（第3步）
30-consolidation.md   归并研判笔记（第4步，needs_consolidation=true 时才有）
40-outline.md         章节蓝图（第5步）
50-report.md          报告正文（分批追加写入）
60-quick-report.md    渲染用正文（50 加图表占位后复制）
61-quick-charts.json  图表配置
00-input.json         渲染元信息
65-quick-report.html  交付HTML
66-quick-report.pdf   交付PDF
```

## 全流程（顺序执行）

### 第1步 要求台账（读 references/requirements-ledger.md）
逐字登记用户完整原话、要求文件、章节与写法、篇幅（未指定时默认目标 12000 字/最低 12000 字，用户明确字数时最低=用户值）、必答项、禁止项、受众、分析角度，并判定 needs_consolidation（归并判定规则见 reference）。

### 第2步 材料清点与抽取
列材料目录全部文件。`.md/.txt/.csv/.json/.pdf` 直接读；`.docx/.xlsx` 用抽取脚本转文本：
```
node <本技能安装路径>/scripts/extract-sources.mjs <材料文件或目录> <run目录>/90-sources
```
抽取失败或扫描件读不出的文件如实登记"材料缺口"，不猜测内容。

### 第3步 材料深读（读 references/material-reading.md）
逐文件完整读，边读边把原子事项沉淀到 `20-issues-ledger.md`（紧凑表格形态，见 reference：**单位概况表**每份报告一行 + **问题台账表**一行一条原子事项，列＝ID｜标题｜主体/期间｜事实链（原值、单位、小数位、正负号、期间、口径内嵌）｜属性｜来源；巡察组、单位、乡镇、责任主体完整保留，不设"原值/引文"重复字段）。冲突并列保留，共性不在本步宣称。全部材料读完，在台账头部固定引用编号表后才进入下一步。

### 第4步 归并研判（needs_consolidation=true 时，读 references/consolidation.md）
对照问题台账识别共性组（跨单位≥2独立单位、单位内≥2独立条线）、去重（须理由）、覆盖对照，写 `30-consolidation.md`。只引用 ISSUE 编号不复制事实；共性组只登"范围/成员/一句内核归因/差异/边界/典型标注"，完整研判留到第6步正文展开、不双写；共性/个性/典型不相加。needs_consolidation=false 时跳过本步直接进第5步。

**可选公共制度补充（默认跳过）**：仅当用户明确授权公共制度查询时执行一次——按可用搜索工具（mobilework_search / websearch，任一可用即执行）查公开法规制度；查询词经净化，不含内部实体、单位、人员、金额；搜索返回即最终口径，摘要没有的数字条款不补全；公开来源不能证明内部问题，正文引用时写明来源链接，不伪装为本地 [N]。全部不可用或用户未授权时跳过，如实说明。

### 第5步 章节蓝图（读 references/outline-writing.md）
写 `40-outline.md`：用户章节逐字保留，各章登记写法/目标字数/证据归属（ISSUE 编号或 common/individual/measure/suggestion 选择器）/图表规划/写作单元（长章拆自然子节 3000–5000 字）。章节预算之和≥目标字数，不足按原比例上调。

### 第6步 分批写作（读 references/report-writing.md）
按蓝图写作单元分批写 `50-report.md`，每批 ≤6000 字，**写完立即落盘再写下一批**，不回囤全篇。每批落盘后立即以 `[\u4e00-\u9fa5]` 正则统计全文累计汉字数（与渲染引擎 quick_report_chinese_chars 同口径，不含参考文献），低于台账最低字数时**当批补足**，禁止留到渲染后返工。公文段落体（共性问题【共性表现】【具体事实】【综合研判】，个性问题【涉及单位】【具体事实】【风险表现】，用户另有写法时服从）；[N] 就近引用；数据表带表题/原值/单位/期间/范围/来源；图表位置用"图表建议：…"独立成段标注。

### 第7步 自核验（读 references/review-checklist.md）
对照清单一次检查：数字与台账事实链原值一致、归并满足独立证据、定性不升级、[N] 双向对应、章节与用户要求逐字一致、无内部编号泄漏。就地修复一次，不循环审稿。

### 第8步 渲染三件套
1. 复制 `50-report.md` 为 `60-quick-report.md`，把"图表建议"位置替换为 `<!--CHART:xxx-id-->` 占位（一行独立成段），其余正文不动。
2. 写 `61-quick-charts.json`（**契约键白名单：仅 `id`/`title`/`option`/`table`，图表对象内禁写 `note` 等任何其他键，写完先对照白名单自查再渲染**）：`title` 与60首行H1逐字一致；`hero_stats` 默认留空数组（巡察纪律：数字卡不替代问题事实；仅当存在去重后真实统计且用户需要时最多3张）；`charts`≤6幅，option直写但**全部数字只取正文真实数据**，未入稿、未核实或口径不可比的数值禁止进图；每幅图附`table`（列≥2，与图数据同源）。图表类型服务分析（时序折线/构成堆叠柱/对比横向条形等），色板用公文克制色（深红/暖灰/藏蓝，无渐变无花哨）。无合适数据时 `charts` 留空数组，不编图。
3. 写 `00-input.json`（模板）：
```json
{
  "mode": "zyzx",
  "template": "zyzx",
  "current_date": "<今天YYYY-MM-DD>",
  "brand_kicker": "智慧巡察 · 材料整编",
  "footer_text": "巡察材料整编报告",
  "source_heading": "## 参考文献",
  "disclaimer_text": "本报告依据所提供巡察材料整编，仅供内部工作参考",
  "disclaimer_html": "说明：本报告基于用户提供的巡察材料整编形成，事实、原值与口径以材料原文为准；分析研判仅代表整理视角，仅供内部工作参考，未经许可不得对外提供。"
}
```
4. 文末参考文献节按台账引用编号表全列，**每条为独立有序列表项**（行首`N. `，单换行分隔）；50 末段加入与 `disclaimer_text` 逐字一致的声明句。

### 第9步 渲染与交付（本技能自带引擎，无需其他技能）
```
node <本技能安装路径>/render/render.mjs <run目录绝对路径>
```
路径定位：本项目内为 `.opencode/experts/deepinspect/skills/zyzx-brief/render/render.mjs`（以 skill 工具返回的技能目录为准）。
成功输出 `OK charts=... pdf=OK`；校验失败按短码修正60/61后重跑（不改50正文）。PDF失败不阻塞HTML交付，如实说明。最后向用户交付：50/60正文、HTML、PDF 的绝对路径与一句话状态（complete/partial 及原因、实际字数、材料缺口）。

## 红线（全程有效，摘要）

- 原值、单位、小数位、正负号、期间、主体、口径原样保留，不自动换算相加；不同单位/期间/口径金额不直接合计
- 共性需独立单位或独立业务条线证据；同主题或重复文件不构成共性；典型/共性/个性不相加；未归并事项不得写"普遍存在"
- 纪律和政治定性不得升级；建议、推断与已发生事实分开；材料未说明整改状态不解释为未整改
- 材料没写明的内容不得靠常识或联网补全；冲突并列保留不裁决
- 默认禁网；公开制度查询仅用户明确授权时一次为限，公开来源不能证明内部问题
- 正文不出现 SRC/ISSUE 等机器编号、流程状态、模型自我保证、待确认台账

## references 路由

| 阶段 | 读取 |
|---|---|
| 第1步 | references/requirements-ledger.md |
| 第2、3步 | references/material-reading.md |
| 第4步 | references/consolidation.md |
| 第5步 | references/outline-writing.md |
| 第6步 | references/report-writing.md |
| 第7步 | references/review-checklist.md |
| 第8、9步 | 本文件渲染节即可，不读reference |
