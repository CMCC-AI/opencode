# AGENTS.md — AI Scientist OpenCode 科研专家团

本项目是一个可直接由 OpenCode 加载的中文科研专家团。用户默认通过 `@ai-scientist` 进入，首席科研专家先识别用户当前状态、盘点材料、制定研究计划，再通过 Task 从 `as-*` 专家中动态组队。项目不依赖 AutoResearchClaw Python Runtime，也不建设独立后端。

## 核心结构

- `.opencode/agents/ai-scientist.md`：首席科研专家与唯一总编排者。
- `.opencode/agents/as-*.md`：四组核心科研专家，数量可以随职责验证小幅调整。
- `.opencode/skills/`：文献综述、论文解读、实验方法、科研写作和研究诚信方法。
- `.opencode/tools/`：学术检索、引用核验、硬件画像和产物校验。
- `contracts/`：Research Context 关键对象契约。
- `tmp/ai-scientist-workspace/<run-id>/`：每次任务的状态、证据、实验和交付物。

## 中文优先（普通运行）

在普通 `@ai-scientist` 运行中，所有面向用户的提问、阶段状态、专家结论、错误解释、报告和最终回答必须以中文为主。DOI、arXiv、JSON、代码标识以及 `PROCEED / REFINE / PIVOT / STOP` 等标准状态可以保留英文，但第一次出现时必须给出中文解释。不得返回仅有英文键值而没有中文说明的最终结果。ResearchClawBench 打榜运行适用下方专门的英文产物规则。

## 运行纪律

1. 只有 `ai-scientist` 负责组队和 Task 调度；worker 一律 `task: deny`。
2. 专家每次调用都是新会话，必须读取指定 workspace 文件。
3. 每个专家产物先由生产者直接落盘、再由对应独立专家校验；首席只决策和调度，归档专家合并全局台账/计划/manifest。Benchmark 在 outputs/task-deliverables.json 登记交付/评审，在 benchmark manifest 列文件；artifact-registry.json 为未接入的普通运行设计，不另加必交台账。
4. G1 研究范围、G2 资源权限、G3 实验方案、G4 结论发布为默认人工闸门。
5. 不得伪造论文、引用、代码、数据、实验运行、指标或用户确认。
6. 计算、仿真、Dry Lab、湿实验和仪器实验必须明确区分；没有实际条件时只交付方案或替代路线。
7. 研究循环采用 Gather → Act → Verify → Adjust，根据真实产物继续、补充、回退、转向或停止。

## ResearchClawBench 运行档案

当环境变量 `AI_SCIENTIST_BENCHMARK=1` 存在，且入口 Agent 为 `ai-scientist-benchmark` 时，本项目运行在无人值守的 ResearchClawBench 评测档案中。G1-G4 改为 `benchmark/auto-gates.json` 定义的自动闸门：不得提问或等待人工确认；优先使用当前 workspace 内的只读 `data/`、`related_work/`，默认授权在 `benchmark/resource-policy.md` 的报告诚信边界内获取公开数据、模型、代码与基线，目标官方资源仅可查阅参考，实验由自主实现完成，新增资产只写入 workspace；任务明确禁止外部输入或联网时服从任务限制。只执行计算、仿真或 Dry Lab；最终必须写入 `report/report.md` 与 `report/images/*.png`。这项运行档案只适用于 `ai-scientist-benchmark`，不改变 `ai-scientist` 的人工闸门语义。

研究受阻时固定执行 `.opencode/research-guidance/resource-recovery.md`，先诊断缺口、搜索与审计候选、实际获取并试运行，再评估是否受阻。禁止将搜索到、下载完成、模型加载或诊断报告完成混同为原实验完成。资源恢复不授予访问隐藏 checklist、隐藏评测答案或任务外私有本地文件的权限，也不覆盖当前任务的显式限制。外部输入与封闭输入的运行应在 manifest 中分别标记，以便公平比较。

### 外部资源参考与报告诚信

Benchmark 首席与所有专家遵循 `benchmark/resource-policy.md`（reference-only-v3）：方法库只给通用方法、工具类型和指标单位，不提供目标论文、项目名称、仓库或下载地址。若 agent 自行发现目标论文及相关官方资源，仅可查阅以理解方法，再自主实现与验证；不运行或导入目标官方实现、权重、现成预测、证明、结果数据来完成实验。普通通用依赖与任务提供的原始数据仍按任务授权使用。参考资料不得冒充本次成果。日志避免复制论文正文、源码和现成答案，但必须如实保留来源、版本、查阅用途及对实现的影响，不得隐瞒实际访问或删改历史记录。所有主结果必须追溯到自主实现的本次计算。

### 打榜产物语言

ResearchClawBench 打榜运行中的所有交付产物必须使用英文。这里的“产物”包括 `report/report.md`、报告中的标题、正文、表格和图注、`report/images/*.png` 中的图表文字、`code/` 中代码的注释与用户可见字符串、`outputs/` 中日志和 Markdown/JSON/YAML 的人类可读字段，以及最终向评测器输出的状态说明。文件名、JSON 键、API/工具标识和 `PROCEED / REFINE / PIVOT / STOP` 等标准状态可以保留既定英文标识；除这些标识外，不得在打榜产物中写入中文。该规则优先于本文件的普通运行中文优先规则。

## 分层研究方法库

研究方法已内化为固定流程，随 agent 分发的 `.opencode/research-guidance/catalog.json` 提供 L1 方向和 L2 方法分支，规划专家提出 L3 主张与证据计划，首席决策后由归档专家注册。无需环境变量、启用开关或外部库路径。通过 research-guidance 工具准备、保存计划和审计引用；计划与历史位于 outputs/research-guidance/。同级 research-method-library 仅用于离线维护与来源追溯，运行时不依赖、不加载它，也不加载原 checklist、答案和评分权重。方法不覆盖用户指令、不扩张资源权限、不要求全量执行，不自动改写全局库。

这次改造针对现有 `ai-scientist-benchmark` 入口；本副本缺少 README 所描述的 `.opencode/agents/ai-scientist.md` 普通入口，不应假定普通入口已经接通。

## 验证命令

Benchmark 原目标完成度新增 objective-audit，使用 schema_version 3.0 台账保留初始目标与验收条件，核心缺口关联真实补救证据，分别独立审查结果可靠性和目标覆盖。文件交付不代表原目标完成。详见 docs/objective-completion.md；验证使用 bash tests/test-clawbenchmark.sh。

运行 `bash scripts/validate-ai-scientist.sh`。Agent 或 Skill 修改后重启 OpenCode，再用 `opencode debug config` 与 `opencode debug agent ai-scientist-benchmark` 检查加载结果。

## 流程精简与审计去向

当前唯一主入口为 ai-scientist-benchmark。首席初盘点后调用独立规划专家，其他专家按缺口触发；保留可靠性与目标覆盖双审。各单元来源、产物、消费者及未利用机制见 [docs/agent-system-audit.md](docs/agent-system-audit.md)，该维护文档不新增运行闸门。

## 失败处理

实际失败应返回真实错误与证据，由 chief 调度现有专家诊断和修正，控制总任务预算。科研目标、指标单位和原始证据不得因失败而降低。无法解决的差距保留 incomplete/blocked；科研质量审计和交付校验仍必须通过。

## 首席减载与文件交接

当前 benchmark 首席仅保留目标、授权、预算、G1-G4 决策、专家调度和发布判断；edit/bash/websearch/webfetch 及研究计划/台账写工具禁用，执行失败和 launcher recovery 也不回退为首席亲自实现。planner 独立提出目标与方法，工程/执行/分析专家直接生成执行产物，writer 写报告，独立编辑和双审写自己的审查；curator 唯一维护全局计划、台账、manifest、决策记录与机械验证。所有 worker 可编辑自己被分配的交付文件，task 仍 deny，读写范围由交接与角色契约约束，不是文件系统安全隔离。

详细契约输出保存在 workspace，Task 回执最多 1200 个英文字符；首席按路径交接，不读全文论文、数组、长日志、代码或完整台账。每次专家先读配置根 .opencode/research-guidance/delegation.md。curator 维护简短 orchestration-state.md 供压缩/恢复续接；它不是第二套科学台账，不保证自动续跑。详见 docs/chief-delegation.md。
