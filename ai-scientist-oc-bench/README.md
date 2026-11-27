> 当前实际入口为 `ai-scientist-benchmark`。首席只做目标、授权、调度与发布决策；子专家直接保存执行产物，归档专家负责全局状态合并与验证。当前副本未提供普通 `ai-scientist.md`，下文普通运行示例为设计说明。职责与交接见 [首席减载说明](docs/chief-delegation.md)。

# AI Scientist

> 此副本增加了 ResearchClawBench 适配层。原有 `@ai-scientist` 人工协作模式保持不变；无交互评测请使用 `scripts/ai-scientist-oc-bench`，它会启动独立的 `ai-scientist-benchmark` 主 Agent。

AI Scientist 是一个直接运行在 OpenCode 中的中文科研专家团。它以一位首席科研专家为入口，根据用户的当前需求、已有材料、研究进度、资源和风险，从四组科研专家中动态组队，并把文献、方法、代码、数据、实验、结果、论文与审查连接成可追溯的 Research Package。

它不是固定执行 20 个步骤的流水线，也不是独立的 Web 平台。当前项目提供 20 位边界清楚的核心专家；首席科研专家会先接管用户此刻的状态，再选择其中真正需要的一部分形成任务 DAG。以后可以在不改变主流程的情况下增加、合并或替换专家。

## 使用方式

1. 在本目录打开 OpenCode。
2. 在 OpenCode 对话框输入 `@ai-scientist <你的科研需求>`。`ai-scientist` 是供主会话召集的 subagent，不应通过 `opencode run --agent ai-scientist` 当作 primary agent 启动。
3. 同时提供可读取的论文、代码仓库、数据说明、日志、草稿或审稿意见。
4. 在 G1～G4 人工闸门确认研究范围、资源权限、实验方案和最终发布。
5. 在 `tmp/ai-scientist-workspace/<run-id>/` 查看当前进度与全部产物。

所有面向用户的解释与交付默认使用中文。若任务需要湿实验、仪器、受限数据或本机不具备的 GPU，系统会说明缺少的真实条件并提供外部执行、缩比、仿真、Dry Lab 或停止路线，不会伪造实验结果。

例如，用户只要求 Literature Review 时，首席专家会召集检索策略、论文发现、证据深读、研究综合、证据写作、独立审稿与引用审计等角色，跳过代码与实验执行；用户带着论文代码和失败日志来做复现时，则从资产审计进入方法、实现、运行、诊断和结果分析。如果任务需要湿实验而用户没有实验室条件，系统只交付 Methodology、实验协议、条件清单和数据回传模板，并明确停在等待外部真实执行的状态。

## 专家团队

首席科研专家位于 `.opencode/agents/ai-scientist.md`。20 位核心专家分为四组：

- 项目接管与规划：意图识别、资产审计、研究规划、可行性评估；
- 文献、方法与证据：检索策略、论文发现、论文证据分析、研究综合、Methodology、实验设计；
- 代码、实验与分析：代码数据工程、实验执行、实验诊断、结果分析；
- 写作、审查与交付：大纲、证据写作、图表引用编辑、独立审稿、质量引用审计、研究包归档。

每位专家都是一份独立 Markdown 定义，包含唯一职责、输出契约和完成前自检。普通专家禁止继续调用其他专家，只有首席科研专家持有 `as-*` 调度白名单，避免专家之间无边界扩散。

## 研究运行机制

每轮执行遵循 `Gather → Act → Verify → Adjust`：先汇集需求与材料，再按计划行动，对产物和证据进行验证，最后决定继续、优化、转向或停止。`05-takeover-plan.yaml` 只表达当前计划版本的无环主 DAG；日志、恢复和失败学习是全程有效、按事件触发的横切机制，而不是每个研究都必须通过的线性阶段。

`08-context-invocation-log.json` 记录每次实际调用的最小必要上下文、专家、Skill、选择理由与验证回填。`09-execution-state.json` 管理任务 DAG 节点的状态、依赖、心跳、产物校验与中断恢复。`10-failure-memory.json` 保存带适用边界的失败经验：任务失败、假设否定、引用撤销或审查否决后先保留真实证据并进入待审查；仅经独立审查后才激活为后续任务前的防重约束，新证据可以撤销或使其过期。

实验失败的诊断和有限回退集中在阶段 6：先按可复现性、环境、数据、实现、数值稳定性、评测、统计功效、方法与假设的顺序排查，再作出 `REFINE / PIVOT / STOP` 决定。`REFINE` 是有上限的非语义修复；`PIVOT` 创建新计划版本并按影响重新经过 G1 或 G3；G1-G4 始终只负责高风险与不可逆研究决策。

四个人工闸门负责关键的不可逆判断：G1 锁定研究范围，G2 确认资源、权限与现实条件，G3 在实验前锁定设计与成功标准，G4 在发布前确认结论、限制和公开范围。没有用户确认时，系统可以继续准备材料，但不会越过相应边界宣称已经实验或最终发布。

项目复用了 AutoResearchClaw 中有价值的科研流程思想：多源论文检索与降级、结构化阶段契约、硬件感知执行、有限次数的 REFINE/PIVOT、引用核验和 HITL；实现形式则保持为 DeepInsight OC 同类的 OpenCode 专家团，而没有嵌入另一套 Python 编排运行时。

## 内置能力

- `academic-search`：按 OpenAlex → Semantic Scholar → arXiv 搜索，单个来源失败时降级，按 DOI、arXiv ID 和标题去重；
- `citation-verify`：按 arXiv、CrossRef、Semantic Scholar 路径核验论文身份；
- `hardware-profile`：读取 CPU、内存与可见 GPU，生成中文执行能力画像；
- `artifact-validate`：检查研究阶段必需产物与 JSON 可解析性；
- `context-log`：以确定性 JSON 记录阶段上下文、Skill、专家调用和验证回填；
- `execution-state`：以确定性 JSON 管理任务节点状态、依赖校验、心跳和中断恢复；
- `failure-memory`：记录、独立审查、撤销和检索有适用边界的失败经验，防止重复落入已证实的失败模式；
- 5 个科研 Skill：文献综述、论文深读、实验 Methodology、科研写作、研究诚信；
- 9 个 JSON Schema：项目、接管计划、证据声明、实验方案、实验运行、最终研究包、上下文调用日志、执行状态和失败经验账本。

## 验证项目

```bash
npm install --prefix .opencode
node --test tests/test-libraries.mjs
bash tests/test-scaffold.sh
bash scripts/validate-ai-scientist.sh
opencode debug config
opencode debug agent ai-scientist
```

## ResearchClawBench 适配

### 分层研究方法库（新增）

研究方向引导已内化为固定流程：**L1 通用方向 → L2 方法分支 → L3 任务证据计划**。8 个方向与 22 个方法随 agent 打包在 `.opencode/research-guidance/catalog.json`，直接部署整个 agent 即可，无需配置方法库路径或启用开关。计划、历史及引用审计保存在 `outputs/research-guidance/`。旧 checklist 来源留在独立的同级 research-method-library，仅供离线维护；运行不依赖它。详见 [设计与使用](docs/research-guidance.md)。

```powershell
node --test tests/test-research-guidance.mjs
```

当前副本实际缺少普通入口 `.opencode/agents/ai-scientist.md`；本次接入的是存在的 `ai-scientist-benchmark`。普通入口相关旧检查的失败应与本次功能测试区分。

此项目可以作为 [ResearchClawBench](https://github.com/InternScience/ResearchClawBench) 的自定义 Agent 运行。评测器提供一个空白任务 workspace，其中已包含 `INSTRUCTIONS.md`、只读的 `data/` 和 `related_work/`，并预先创建 `code/`、`outputs/`、`report/` 与 `report/images/`。

### 运行行为

- `ai-scientist-benchmark` 是独立的 primary Agent，通过自动 G1-G4 闸门运行，不使用 `question`，不等待人工确认。
- 它只把真实代码放在 `code/`、中间结果放在 `outputs/`、PNG 图放在 `report/images/`、最终报告放在 `report/report.md`。
- 运行结束后 launcher 会检查报告、图表引用和可追溯代码/输出；任一条件不满足将返回非零退出码，不能当作有效成绩。
- 若 workspace 根目录存在 `Introduction.md`，launcher 还会逐项检查其中 Markdown 列表要求是否在英文报告中得到覆盖；失败原因写入 `outputs/validation-report.md`，随后最多回退并重跑一次相关研究流程。
- 回退后仍不满足要求时，launcher 保留英文验证报告并返回非零退出码；Agent 必须在 `report/report.md` 的 Limitations 中说明无法解决的原因和证据。
- 内部编排状态保存在 `outputs/ai-scientist-workspace/<run-id>/`，不会写入或改动 `data/`、`related_work/`。

### 研究受阻后的自主恢复

资源恢复已内化到 benchmark agent，无需启用参数。默认允许为原研究目标检索和获取无需新账号、付费或新增凭据的公开数据、模型、代码与基线；当前任务明确禁止联网或外部输入时服从限制。此默认授权改变了此前只使用预置科学输入的运行条件，不能自动视为与封闭输入榜单等价。

遇到核心实验缺资源时，agent 先诊断具体缺口，再按候选搜索、适配检查、实际获取、内容校验、真实输入试运行、正式实验的顺序推进。缺少模型时同时寻找代码、权重、配置与归一化，不只搜索数据。获取与计算预算根据实际硬件、空间、剩余时间和用户预算在运行中明确记录；不能无限下载，也不能以下载成功代替实验完成。

- `.opencode/research-guidance/resource-recovery.md`：跨领域行动指南。
- `templates/resource-recovery.md`：恢复记录结构。
- `outputs/resource-recovery/`：缺口、预算、尝试、资产和最终审查。
- `outputs/external-assets/`：新增公开数据、模型、代码与元数据；原 `data/`、`related_work/` 只读。

发现专家返回候选与获取方案，有执行权限的工程/实验专家才实际获取和运行。无法恢复时，原 P0 与核心主张保留 blocked/incomplete，报告明确范围；独立审查区分有限报告可发布与原目标完成。Manifest 必须记录是否使用外部输入及其来源版本。配置指令提供行动约束，具体下载和预算管理由 agent 执行，并非操作系统级网络或磁盘配额。

设计依据与公开资料核查见 `docs/resource-recovery-design.md`。部署时同步 `.opencode/`、`benchmark/`、`templates/` 和 `scripts/`，重启 OpenCode。此改造不自动重跑已有任务或下载大型模型。

### 安装与单任务冒烟测试

1. 安装 OpenCode CLI 并完成模型提供商认证；此仓库不包含模型密钥。
2. 准备一个 ResearchClawBench 生成的 workspace，或至少准备 `INSTRUCTIONS.md`、`code/`、`outputs/`、`report/` 与 `report/images/`。
3. 从本项目根目录执行：

```bash
scripts/ai-scientist-oc-bench \
  --prompt "$(cat /abs/path/to/workspace/INSTRUCTIONS.md)" \
  --workspace /abs/path/to/workspace
```

先用以下命令检查参数、路径和 launcher，而不调用模型：

```bash
scripts/ai-scientist-oc-bench \
  --prompt "smoke test" \
  --workspace /abs/path/to/workspace \
  --dry-run
```

### 注册到 ResearchClawBench

将 `examples/researchclawbench-agent.json` 中的 `/ABSOLUTE/PATH/TO/ai-scientist-clawbenchmark` 替换为本项目绝对路径，然后把该对象合并到 ResearchClawBench 本地副本的 `evaluation/agents.json`。配置使用：

```json
"cmd": "bash /ABSOLUTE/PATH/TO/ai-scientist-clawbenchmark/scripts/ai-scientist-oc-bench --prompt <PROMPT> --workspace <WORKSPACE>"
```

ResearchClawBench 会把 `<PROMPT>` 替换为其完整任务指令，并在 `<WORKSPACE>` 中启动命令。先在一个任务上运行、评分和检查 `_score.json`，再做多任务或全量运行。

### 适配层验证

```bash
bash scripts/validate-clawbenchmark.sh
bash tests/test-clawbenchmark.sh
```

在仅有 Windows PowerShell、没有可用 Bash 的开发机上，可先执行：

```powershell
powershell -ExecutionPolicy Bypass -File tests/test-clawbenchmark.ps1
```
