---
name: deepgeo-pipeline
description: DeepGeo 位置决策专家团共享运行时规范——Workspace 数据协议、固定 DAG 与执行台账、确定性分析引擎（Python recipe）、G1-G4 人工闸门、质量预检与清洁交付脚本链。全体成员（主理人 + 团员）任务执行时均须遵守。
---

# DeepGeo 位置决策专家团 · 共享运行时规范

本规范服务于「DeepGeo 位置决策专家团」。所有成员（首席位置决策专家 + 十一位团员）在执行任务时均须遵守。规范定义了位置决策 Runtime 的数据协议、执行纪律和确定性产物链。

## 定位与适用范围

**适用**：商业选址评估、候选点位比较、商圈客流与客群分析、景区分区与商铺布局优化、位置投资决策报告等位置决策任务。

**不适用**：日常闲聊、单点事实问答、编程开发、医疗诊断、法律咨询、与位置数据无关的通用研究。

**共享能力**：数据分析是共享能力，不专属于 `dg-decision-modeler`。数据、位置、客群、商业、模型、经营和审查专家均可调用本 Skill 定义的分析引擎，模型只负责提出分析问题、选择 recipe、解释结果和限定结论；数值必须由确定性代码真实计算。

## Workspace 数据协议

每次运行优先使用系统注入的独立会话产物目录作为 workspace_dir；脚本参数、Bash workdir 和所有子 Agent 都必须使用这个绝对路径，所有产物不得越出该目录。只有系统未注入产物目录的独立运行环境，才在当前工作目录创建 `tmp/deepgeo-workspace/<run-id>/`（run-id 用 `YYYYMMDD-HHMM` 时间戳）。所有文本文件 UTF-8 无 BOM：

```text
00-control/input.json               用户原始输入、附件和运行设置
00-control/execution-trace.json     DAG 节点调度台账（pipeline-state.mjs 维护）
00-control/human-decisions.json     G1-G4 人工决策记录
01-brief/decision-brief.json        决策任务卡与治理边界
01-brief/run-plan.json              本次运行子图（scenario、enabled_nodes、required_gates）
02-data/data-contract.json          数据契约（目录、字段、口径、血缘摘要）
02-data/data-mode.json              数据模式（simulated / real / hybrid）
02-data/quality-report.json         数据质量分析
03-analysis/location/analysis-result.json   位置分析（领域分析层）
03-analysis/audience/analysis-result.json   客群分析
03-analysis/commercial/analysis-result.json 商业生态分析
03-analysis/market/analysis-result.json     公开行业研究（按需）
04-models/model-run.json            跨领域决策模型
05-decisions/business-options.json  经营方案
05-decisions/option-matrix.json     候选矩阵
05-decisions/claim-ledger.json      主张台账
05-decisions/story-outline.json     故事大纲（成文唯一依据）
06-visuals/chart-manifest.json      正式图表清单
06-visuals/publication/             正式图表 SVG
07-report/report.md                 决策型报告 Markdown
07-report/preflight-quality.json    确定性质量预检
07-report/report.html               完整 HTML
07-report/report.pdf                A4 PDF
08-review/independent-review.json   独立审查
08-review/release-decision.json     发布决策
.scratch/                           临时计算（原始 recipe 输出、探索图；成功发布后删除）
```

- 原始用户案例文件只读：不复制、不修改、不删除。
- 交付目录在 Workspace 之外（例如 Workspace 的同级 `output/<run-id>/`），只含 `report.md`、`report.html`、`report.pdf`、`assets/` 与隐藏 `.deepgeo/audit.json`。
- 结构化产物遵循 `contracts/` 下的 JSON Schema（analysis-result、metric-record、claim-ledger、run-plan、story-outline、release-decision、artifact-envelope）。

## DAG 与执行台账

DAG 是允许节点、角色、依赖、条件和预算的唯一机器清单：`pipeline/deepgeo-dag.json`。运行子图只能从该清单实例化，并由 `01-brief/run-plan.json` 固化。台账命令位于本 Skill 的 `scripts/` 目录（Node.js ≥18）：

```bash
SKILL_DIR=<本 skill 目录，由主理人在 spawn 时传入>
WS=<workspace 目录>

node "$SKILL_DIR/scripts/pipeline-state.mjs" init <WS>
node "$SKILL_DIR/scripts/pipeline-state.mjs" gate <WS> <G1|G2|G3|G4> <passed|rejected|not_required> <依据说明>
node "$SKILL_DIR/scripts/pipeline-state.mjs" route <WS> [01-brief/run-plan.json]
node "$SKILL_DIR/scripts/pipeline-state.mjs" start <WS> <node> <agent> <attempt> <round>
node "$SKILL_DIR/scripts/pipeline-state.mjs" complete <WS> <node> <agent> <attempt> <round> <artifact...>
node "$SKILL_DIR/scripts/pipeline-state.mjs" fail <WS> <node> <agent> <attempt> <round> <原因>
node "$SKILL_DIR/scripts/pipeline-state.mjs" skip <WS> <node> <原因>
node "$SKILL_DIR/scripts/pipeline-state.mjs" validate <WS>
```

**DAG 约定**（pipeline-state.mjs 严格校验节点-成员映射）：

| DAG node | 成员 Agent ID | 条件 | 主要产物 |
|---|---|---|---|
| `task_governance` | `dg-task-governor` | 必经 | `01-brief/decision-brief.json` |
| `data_readiness` | `dg-data-steward` | G1 后必经 | `02-data/data-contract.json` 等 |
| `location_analysis` | `dg-location-analyst` | run-plan 启用时可并行 | `03-analysis/location/analysis-result.json` |
| `audience_analysis` | `dg-audience-analyst` | run-plan 启用时可并行 | `03-analysis/audience/analysis-result.json` |
| `commercial_analysis` | `dg-commercial-ecology` | run-plan 启用时可并行 | `03-analysis/commercial/analysis-result.json` |
| `market_research` | `dg-market-researcher` | run-plan 启用且 network_authorized | `03-analysis/market/analysis-result.json` |
| `decision_model` | `dg-decision-modeler` | 领域节点完成后必经 | `04-models/model-run.json` |
| `business_strategy` | `dg-business-strategist` | decision_model 后必经 | `05-decisions/business-options.json` |
| `decision_synthesis` | `dg-decision-synthesizer` | 必经 | `option-matrix.json`、`claim-ledger.json`、`story-outline.json` |
| `report_editing` | `dg-report-editor` | 必经 | `07-report/report.md`、preflight、chart-manifest |
| `independent_review` | `dg-independent-reviewer` | 每次报告尝试后必经 | `08-review/independent-review.json`、`release-decision.json` |

调用纪律：
- 先 `start` 登记 → 调用成员 → 产物落盘并解析 → `complete` 登记，顺序不可颠倒
- 台账中的 agent 参数使用 DAG 契约短名（`dg-task-governor`），与 task 调度用的命名空间 ID（`deepgeo/dg-task-governor`）是两套写法，不要混用
- 执行预算：Task 启动上限 14、每轮尝试上限 2、审查后新增 Task 上限 2、并行领域专家上限 4
- 领域分析层四节点在依赖满足时可并行；`skip` 只允许条件领域节点且必须记录原因
- 脚本失败时保留 workspace 和明确错误，不用模型猜测补齐产物

## 确定性分析引擎

所有核心数值由 Python 引擎真实计算（`analytics/deepgeo/`，纯标准库），不在对话中估算。分析入口（Bash 的 workdir 使用 `$SKILL_DIR`）：

```bash
python3 -m analytics.deepgeo.cli run --recipe <recipe> --input <file> [--input <file>...] \
  --params '<JSON>' --producer <agent短名> --output <workspace>/03-analysis/<domain>/....
python3 -m analytics.deepgeo.cli chart --labels '<JSON数组>' --values '<JSON数组>' --title <标题> --output <svg路径>
```

- `PYTHONPATH` 指向 `$SKILL_DIR`；解释器优先用 `python3`，Windows 等无 `python3` 命令的环境用 `python`；同一输入哈希、recipe、参数和代码版本命中缓存时应复用结果
- 允许的 recipe（15 个）：`quality.profile`、`temporal.pattern`、`temporal.anomaly`、`mobility.dwell`、`mobility.od`、`audience.mix`、`audience.association`、`commercial.diversity`、`commercial.supply_gap`、`decision.score`、`decision.stability`、`forecast.baseline`、`pilot.did`、`finance.scenario`、`finance.monte_carlo`
- 每个工作包默认不超过四个 recipe；逐配方原始输出进 `.scratch/<domain>/`
- 详细 recipe、证据等级和预算见 Skill `geo-analytics` 的 `references/`

`tools/geo-analysis.ts` 与 `tools/geo-artifact-validate.ts` 是 OpenCode 自定义工具封装（供独立项目布局把本目录放入 `.opencode/tools/` 自动发现时使用）；专家团布局中工具不自动注册，成员一律通过上述 CLI 调用，或在环境提供了这两个工具时按原语义使用。模拟器（`simulators/`）与场景配置（`configs/scenarios/`）用于生成固定种子的演示数据，模拟数据不得被描述为真实客户事实。

## 人工闸门（G1-G4）

| 闸门 | 名称 | 时机 | 阻断条件 |
|------|------|------|---------|
| G1 | 决策范围 | data_readiness 前 | 候选对象、决策目标或数据使用存在实质歧义 |
| G2 | 数据与权限 | 领域分析前 | 敏感数据、联网、跨数据集关联或关键缺失需要用户选择 |
| G3 | 权重与假设 | business_strategy 前 | 评分权重、财务默认值或一票否决项会实质改变结果 |
| G4 | 对外发布 | publication 前 | 正式发布 |

用户原请求已明确的事项登记为 `confirmed_in_request`，不重复询问；HITL 澄清使用 `question` 工具。

## 质量预检与清洁交付

```bash
node "$SKILL_DIR/scripts/quality-preflight.mjs" <WS>          # 报告确定性预检（一次集中收敛）
node "$SKILL_DIR/scripts/render-report.mjs" <WS>              # 生成 07-report/report.html
node "$SKILL_DIR/scripts/export-report-pdf.mjs" <WS>/07-report/report.html <WS>/07-report/report.pdf
node "$SKILL_DIR/scripts/validate-run.mjs" <WS>               # DAG 与发布校验
node "$SKILL_DIR/scripts/finalize-delivery.mjs" <WS> <交付目录> [--internal-preview] [--keep-workspace]
```

- 预检在 `report_editing` 的同一 Task 内一次性处理全部 P0，只复跑一次；通过后才能进入独立审查
- `export-report-pdf.mjs` 是薄入口，渲染逻辑统一委托仓库级 `report-pdf` Skill（CDP 渲染、中文字体注入与校验、渲染等待由共享脚本负责），不复制导出实现
- 正式发布要求 `release-decision.json` 中 `decision=pass` 且 P0 为零；`--internal-preview` 仅供内部预览，不得冒充正式审查通过
- `finalize-delivery.mjs` 把三个报告文件与正文实际采用的图表发布到交付目录，并把最小质量证明压入 `.deepgeo/audit.json`，成功发布后清理整个临时 Workspace

## 数据和结论边界

- 原始个人轨迹不得进入系统，只允许授权的聚合位置数据
- 模拟数据不得被描述为真实客户事实或真实效果
- 偏好、画像、到访和交易之间没有真实试点或适当因果设计时，只能表达关联、业务推断或待验证假设
- 综合评分必须展示原始指标、方向、标准化、权重、稳定性和一票否决项；任一默认维度因数据不足被排除时必须声明原因与影响
- 图表标题说明业务发现，并明确时间、单位、样本、来源和数据模式
- 工具失败、超时和网络失败不等于没有信息；保留已完成产物，记录降级影响，不把未运行写成已完成
