---
name: deepinsight-pipeline
description: DeepInsight 深度研究专家团共享运行时规范——三模式研究、workspace 数据协议、引用来源协议、研究-反思循环、确定性报告工具链（引用编号/HTML/PDF）。全体成员（主理人 + 团员）任务执行时均须遵守。
---

# DeepInsight 深度研究专家团 · 共享运行时规范

本规范服务于「DeepInsight 深度研究专家团」。所有成员（研究主编 + 十位团员）在执行任务时均须遵守。规范定义了研究 Runtime 的数据协议、证据纪律和确定性产物链。

## 定位与适用范围

**适用**：行业研究、市场分析、竞品分析、技术趋势、数据洞察、学术研究、政策分析、产业报告等深度研究任务；用户上传材料的内部研究、内外混合研究、公开信息研究。

**不适用**：日常闲聊、单点事实问答、编程开发、医疗诊断、法律咨询、娱乐游戏、情感咨询。

## 三种研究模式

| 模式 | 条件 | 证据主体 |
|------|------|---------|
| `internal` 内部材料研究 | 用户上传文件，问题主要围绕理解、整合、审计、比较、洞察这些文件 | 上传材料（`local:SRC-*`） |
| `hybrid` 内外混合研究 | 上传文件是事实主体，同时需要行业/政策/市场公开信息补充、对照或核验 | 材料 + 网络 URL |
| `external` 公开信息研究 | 没有本地文件，或用户明确要求仅依赖公开信息 | 网络 URL |

- 只要存在本地文件，就不得把它降级成普通背景附件。
- `external` 模式或外部研究为主要证据时，全部研究轮次累计的高质量网络来源（正文引用 + 合格延伸参考）去重后不少于 50 条（通常 50–70 条）；`internal` 不适用，`hybrid` 补充角色不设硬性数量。

## Workspace 数据协议

每次研究优先使用系统注入的独立会话产物目录作为 workspace_dir；脚本参数、Bash workdir 和所有子 Agent 都必须使用这个绝对路径，所有产物及 HTML/PDF 导出不得越出该目录。只有系统未注入产物目录的独立运行环境，才在当前工作目录创建 `tmp/research-workspace/<run-id>/`（run-id 用 `YYYYMMDD-HHMM` 时间戳）。所有文本文件 UTF-8 无 BOM：

```text
00-input.json                     用户原始输入、文件和运行设置
00-execution-trace.json           DAG 节点调度台账（pipeline-state.mjs 维护）
01-requirements.json              用户要求台账（P0/P1/P2）
01-safety.json                    安全与适用范围检查结果
02-intent.json                    需求分析结果
03-plan.json                      研究计划与本地/网络问题
04-sources.json                   本地来源注册表（SRC-001、SRC-002…）
04-materials.md / 04-materials/   本地材料索引与可读正文
05-local-findings-N.md/.meta.json 本地证据研究（第 N 轮）
05-web-findings-N.md/.meta.json   外部研究（第 N 轮）
07-reflection-N.json              需求与证据覆盖反思（第 N 轮）
10-outline.json                   报告大纲
11-writing-plan.json              章节写作批次计划
19-report-part-NN.md              各章节批次原文
20-report.md                      最终 Markdown 正文
20-evidence-review-packet-N.json  独立审查输入包（脚本生成）
21-evidence-review-N.json         独立证据核验（第 N 轮）
22-references.json                唯一引用映射与内部来源元数据
23-reference-state.json           引用后处理哈希凭据
25-visual-report.json             可视化结构
30-report.html                    完整 HTML
31-render-state.json              HTML 渲染凭据
35-report.pdf                     A4 PDF
36-pdf-export-state.json          PDF 导出状态
40-stats.json                     质量与交付统计
```

原始上传文件只读：不复制、不修改、不删除。

## 引用与来源协议（全局统一）

- 本地事实：`<cite>local:SRC-001</cite>`，编号必须存在于 `04-sources.json`
- 外部事实：`<cite>https://actual-source.example/page</cite>`，URL 必须来自网络研究元数据 `verified_sources`
- 关键案例、事实、数字、政策、观点必须有就近引用；材料没写明的不补全；推断与事实分开
- 统一来源协议 `source_schema_version=2`：`verified_sources` 每项含真实 `title/url/site/excerpt`、`query`、`engine`、`verification_status`、`evidence_scope`
  - `verified_original/full_claim_support`：经原页核验，可支持关键事实
  - `search_payload_admitted/contextual_only`：仅用搜索返回内容，只能支持低风险背景；不得支持精确数字、政策条款、产品参数、案例成效、因果或争议信息
- 后处理脚本会拒绝未登记的 `SRC-*` 和未在元数据中登记的 URL；标题必须真实，不得用 URL/域名/模型概括代替
- 最终参考文献格式：读者可见“序号 + 可点击的真实标题”；站点/日期/用途等元数据只保留在 `22-references.json`，不进入正文
- Writer 不自建参考文献章节，统一由确定性脚本生成

## 研究-反思循环（最多 3 轮）

```
研究 → 反思(next_action) → 路由
  local_research   → 回材料补挖（follow_up_local_queries）
  web_research     → 定向公开补充（follow_up_web_queries）
  needs_user_material → 记录缺口，不补写；整体失去意义时才询问用户
  outline          → 证据充分，进入大纲
```

- 第一轮不是默认终点；外部研究通常需要第二轮定向补缺。第一轮提前结束必须满足：全部 P0 充分覆盖、无实质缺口、来源质量和交叉验证达标、`confidence_level>=8` 并填写 `early_exit_reason`
- 第二、三轮只补影响核心论证的 P0/关键 P1 实质缺口；第三轮必须存在新证据路径
- 达到上限仍有缺口时，缺口进入 `claims_to_avoid`，不得写成事实
- Evidence Reviewer 最多 2 轮且只核验关键事实与 P0；PDF 最多 2 次导出

## 确定性报告工具链

引用编号、HTML、PDF 由脚本完成，不在对话中临时拼接。脚本位于本 Skill 的 `scripts/` 目录（Node.js ≥18）：

```bash
SKILL_DIR=<本 skill 目录，由主理人在 spawn 时传入>
WS=<workspace 目录>

node "$SKILL_DIR/scripts/pipeline-state.mjs" init <WS>                     # 初始化执行台账
node "$SKILL_DIR/scripts/pipeline-state.mjs" start <WS> <node> <agent> <attempt> <round> [batch=i/n]
node "$SKILL_DIR/scripts/pipeline-state.mjs" complete <WS> <node> <agent> <attempt> <round> <artifact...>
node "$SKILL_DIR/scripts/pipeline-state.mjs" fail <WS> <node> <agent> <attempt> <round> <reason>
node "$SKILL_DIR/scripts/pipeline-state.mjs" route <WS> <internal|hybrid|external> <has_local_files> <local_required> <web_required>
node "$SKILL_DIR/scripts/pipeline-state.mjs" skip <WS> <local_research|web_research> <原因>
node "$SKILL_DIR/scripts/report-batches.mjs" plan <WS>                     # 生成 11-writing-plan.json
node "$SKILL_DIR/scripts/report-batches.mjs" assemble <WS>                 # 合并 19-report-part-*.md
node "$SKILL_DIR/scripts/build-evidence-review-packet.mjs" <WS> <round>    # 生成审查包
node "$SKILL_DIR/scripts/postprocess-report.mjs" <WS>                      # 引用编号+参考文献
node "$SKILL_DIR/scripts/render-report.mjs" <WS>                           # 生成 30-report.html（渲染前图表闸门：chart block 的扁平 data 委托仓库级 chart-builder 校验并组装 option，不合格整块丢弃并报出原因）
node "$SKILL_DIR/scripts/export-report-pdf.mjs" <WS>/30-report.html <WS>/35-report.pdf
node "$SKILL_DIR/scripts/validate-run.mjs" <WS>                            # 最终验证
```

**DAG 约定**（`pipeline/deepinsight-dag.json`，pipeline-state.mjs 严格校验节点-成员映射）：

| DAG node | 成员 Agent ID | 条件 | 主要产物 |
|---|---|---|---|
| `safety` | `di-intent-analyst` | 必经 | `01-safety.json` |
| `intent` | `di-intent-analyst` | 必经 | `02-intent.json`、`01-requirements.json` |
| `planning` | `di-query-planner` | 忈经 | `03-plan.json` |
| `local_research` | `di-local-researcher` | 有上传材料时必经 | `05-local-findings-N.*` |
| `web_research` | `di-web-researcher` | external / hybrid 需外部证据 | `05-web-findings-N.*` |
| `reflection` | `di-reflector` | 至少一轮研究后必经 | `07-reflection-N.json` |
| `outline` | `di-outline-architect` | 必经 | `10-outline.json` |
| `writing` | `di-report-writer` | 必经（分批） | `19-report-part-NN.md`、`20-report.md` |
| `evidence_review` | `di-evidence-reviewer` | 写作后必经 | `21-evidence-review-N.json` |
| `visualization` | `di-viz` | 审查后必经 | `25-visual-report.json` |
| `html_render` | `di-publisher` | 可视化后必经 | `30-report.html`、`31-render-state.json` |
| `pdf_export` | `di-publisher` | HTML 后必经 | `35-report.pdf`、`36-pdf-export-state.json` |

调用纪律：
- 先 `start` 登记 → 调用成员 → 结果落盘 → `complete` 登记，顺序不可颠倒
- 同一节点内技术重试最多 `attempt=2`；没有新业务理由不得用 `round` 绕过重试上限
- 首轮 writing 按批次登记 `batch=<i>/<n>`；每批独立 start/complete
- 脚本失败时保留 workspace 和明确错误，不用模型猜测补齐产物

## 搜索工具约定（WorkBuddy 环境）

原 OpenCode 版依赖 `search_bocha_*` MCP；在 WorkBuddy 环境中统一替换为：

| 原工具 | WorkBuddy 替代 |
|--------|---------------|
| `search_bocha_bocha_search` / `search_tencent_tencent_search` / `search_doubao_doubao_search` | `WebSearch`（中文首选） |
| `webfetch` | `WebFetch`（按需核验原文） |
| 内置 `websearch` | `WebSearch`（英文/国际/学术） |

- `engine` 字段在元数据中如实记录 `websearch` 或 `webfetch`
- 并行约束（wave 背压）保留：搜索每组最多 3 个、WebFetch 每组最多 2 个
- 同一查询同一引擎只调一次；URL 抓取失败不重试，连续两次失败切换来源
- 若环境提供博查/腾讯/豆包等搜索 MCP connector，`di-web-researcher` 可优先使用，`engine` 字段如实记录

## 编码与质量铁律

1. **用户要求贯穿全程**：必答问题、重点、格式、边界、禁止事项进入 `01-requirements.json`，在大纲、报告、审查中逐项核验（met/partial/missing）
2. **上传材料优先**：有文件必登记 `SRC-*` 并深度挖掘，不得只做摘要
3. **杜绝幻觉**：材料没写的不补全；冲突不裁决，并列保留；推断必须标注依据；宁可明确证据不足
4. **证据状态与交付分离**：审查不通过时保留 `delivered_with_evidence_gaps` 状态交付完整产物，不得冒充通过，也不得阻断文件生成
5. **确定性产物不重写**：HTML/PDF 与 Markdown 同源，不为 PDF 再写一份内容
6. **可视化证据优先**：4–8 幅图形为适宜目标；数值图至少 3 个同单位同口径数据点；证据不足时少画并说明原因，绝不编数凑图

## 常见失败与止损

| 失败场景 | 处置 |
|---------|------|
| 成员返回 JSON 解析失败 | 要求重发或按契约修复；连续 2 次失败登记 `fail` |
| 搜索工具不可用 | 换引擎或 WebSearch 兜底；不增加研究轮次 |
| 单 URL 抓取失败 | 不重试；换权威来源或另一引擎 |
| 连续两批低增量 | 停止该查询，记录核验缺口 |
| PDF 导出失败 | attempt=2 重试一次；仍失败保留 HTML 交付并记录 |
| 审查第二轮仍 pass=false | 停止修订，带缺口交付 |
