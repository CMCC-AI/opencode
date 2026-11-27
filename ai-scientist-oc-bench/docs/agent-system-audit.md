# Agent 系统流程精简与审计流向

检查日期：2026-11-05。实际项目：/home/songz/ai-scientist-oc-bench（SSH buaa-ica）。检查依据是实际配置、工具、launcher 和测试代码；未据此推断线上调用频率或研究得分。保留 1 个主 agent、20 个 worker 名称与权限。此次减少固定调度、重复职责和重复终局恢复，没有新增科研产物、闸门或 schema。

## 已实施的精简

| 原问题 | 修改 | 保留的约束 |
|---|---|---|
| 四专家固定接管 | 首席识别/初盘点后调用 planner，路由/资产/可行性按缺口触发 | planner 独立核对原始目标 |
| 八个 worker 复制完整 v3 审查职责 | 改为按角色提供观察、独立评审或图表检查 | schema 3.0 与原任务边界不变 |
| planner 禁止联网但要求先广泛搜索 | 读取资产观察，提出有负责人的定向发现任务 | 搜索由有权限的专家实际执行 |
| planner 仍输出 schema 2.0 | 统一到实际工具要求的 3.0 | 旧台账仍须显式迁移 |
| 漏项审计与 goal_coverage 重复召集 | quality-auditor 同次返回逐项 verification、引用身份与 goal_coverage | reliability 仍由另一专家独立负责 |
| writer/编辑/首席重复检查报告前部 | writer 提草稿建议；图表编辑检查最终 PNG 和报告；首席落盘交接 | 保留 frontmatter-review 给 reliability 消费 |
| 固定大纲与正文分派 | 默认 writer 同次交大纲和正文，复杂重构才单独 outline | 图表仍独立检查 |
| 每次受阻强制资源与可靠性预审 | 实际恢复优先，争议才可行性审查，科学判断并入最终 reliability | 补救证据与未完成目标仍保留 |
| 同一快照 save/主结果/写作前重复机械审计 | 复用 save 返回，主结果/写作前重合可合并 | 发布前仍针对最终产物审计；变更后重新审 |
| 工程和执行重复试跑 | 版本/配置一致且证据充分时复用，已分派小规模正式计算可同次完成 | smoke test 与正式实验仍区分 |
| 主 agent 与 launcher 各安排最终恢复 | 额外最终恢复会话统一由 launcher 执行一次 | 正常科研循环仍实际补救，退出状态由 launcher 决定 |
| 通用测试指向缺失普通入口 | scaffold/validator 改查实际 benchmark 主入口 | 不虚构普通入口已实现 |

## 各 agent 来源、产物和消费者

2026-11-27 更新：所有 worker 将详细成果写入分配文件，仅向 chief 返回简短回执；chief 只负责决策和下次调度，curator 合并规范状态并验证。下表中历史 chief 落盘职责现由 curator 承接；完整现行边界见 docs/chief-delegation.md。以下不是强制全量链路。

| Agent | 来源 → 产物 → 下游 | 调用条件 |
|---|---|---|
| ai-scientist-benchmark | 原任务/真实产物 → 计划、台账、G1-G4、manifest → workers/launcher | 唯一总编排 |
| as-intent-router | 混合材料 → 意图/阶段 → planner | 意图或状态不清 |
| as-asset-auditor | 本地/候选 → 来源/版本/许可/适配 → planner/engineer/台账 | 资产不确定 |
| as-feasibility-advisor | 硬件/恢复 → 预算/资源判断 → G2/G3 | 大预算/资源或降级争议 |
| as-research-planner | 原任务/source units/资产 → scope_review、目标/依赖建议 → 台账/调度 | 初始独立范围检查、范围变化 |
| as-literature-strategist | 问题/失败 → 策略 → researcher | 系统综述/覆盖或检索失效 |
| as-literature-researcher | 具体缺口/引文 → 查询证据、URL/版本/获取办法 → engineer | 需要发现资源/论文 |
| as-paper-evidence-analyst | 论文 → 方法/公式/证据卡 → designer/synthesizer | 深读需要 |
| as-research-synthesizer | 多篇证据 → 共识/冲突/Gap → planner/designer/writer | 多来源综合 |
| as-methodology-designer | 问题/Gap → 方法/竞争假设 → experiment-designer | 方法未定/适用性争议 |
| as-experiment-designer | 已定方法 → 实验/统计/图目的 → engineer/operator/analyst | 具体执行设计 |
| as-code-data-engineer | 方案/候选 → 代码、获取/兼容/smoke/已分派计算 → operator/analyst | 实现、获取、修复 |
| as-experiment-operator | 固定方案/版本 → 正式运行/配置/原始输出 → analyst | 正式或批量执行 |
| as-experiment-diagnostician | 未解释失败 → 根因/最小动作 → 责任专家 | 原执行者不能定位 |
| as-result-analyst | 原始输出/预定指标 → 统计/Finding/缺口 → writer/双审 | 科学计算与解释 |
| as-outline-architect | 证据/读者要求 → 大纲 → writer | 复杂论证/格式/重构 |
| as-evidence-writer | 台账/Finding → 大纲和正文 → figure-editor/双审 | 证据约束写作 |
| as-figure-citation-editor | 实际 PNG/底层输出/最终报告 → verification.figures/前部检查 → 台账/双审 | 要求的图独立检查，变更复审 |
| as-independent-reviewer | 原任务/实际产物/上游审查 → reliability/科学修复路由 → objective-audit/责任专家 | 最终可靠性独立审查 |
| as-quality-citation-auditor | 原任务/source units/台账/输入输出/图检查 → verification/goal_coverage/引用身份 → objective-audit/责任专家 | 最终覆盖审查，合并漏项核验 |
| as-research-package-curator | 已有文件/审计 → 通用 package manifest → 请求研究包的用户 | benchmark 默认负责持久化与机械验证，通用包仅按需 |

## 审计单元的来源与去向

已接通：机械校验存在消费者。软消费：指令要求交接，没有独立机械约束。未接入：工具/设计存在，但当前 benchmark 没有固定生产—审查—消费闭环。按需专家不能仅凭非必调判为闲置。

| 审计单元 | 来源/生产者 | 输出 | 去向/消费者 | 状态与限制 |
|---|---|---|---|---|
| 原任务快照/目标基线 | objective-audit prepare/save | task-snapshot、requirements-baseline、history | objective-audit 定义保留检查 | 已接通；不是安全防篡改保证 |
| 初始范围覆盖 | planner 读 task/source units | scope_review.units/证据 | research-contract → objective-audit | 已接通；映射/理由不证明语义完整 |
| 七维输入条件 | asset/engineer 实读输入，chief 维护 | data_requirements | research-contract → recovery/verified 检查 | 已接通；observed 真实性仍需独立核验 |
| 资源候选审计 | researcher/asset 查询、许可/适配 | 现有 recovery 记录和证据 | engineer 获取，chief G2/G3，最终双审 | 软消费；元数据通过不等于获取 |
| 分阶段恢复审计 | engineer/operator 实际操作 | item.recovery.attempts | objective-audit/双审 | 已接通；本地 computation 缺口按相应计算阶段审查 |
| resource-access 诊断 | 具体 URL/错误/限制 | 传输分类/路线/脱敏证据 | engineer/operator 后续获取 | 软消费；HTTP 状态不代表科学通过 |
| 方法/证据引用审计 | research-guidance plan/路径 | outputs/research-guidance/audit.json | 独立审稿与 launcher 最终 CLI 状态 | 已接通 launcher；单独 output validator 不执行它；references_checked 仅引用检查，unresolved 不全部硬阻断 |
| 独立图表审计 | figure-editor 看实际 PNG/底层输出 | verification.figures、hash、字段检查 | research-contract/双审 | 已接通；不能机械证明审稿者看过图片 |
| 逐项验收 | quality-auditor 实读数据/结果/报告 | verification.checks/conditions、result_origin | objective-audit 原目标判定 | 已接通；校验字段和路径，不计算科学真值 |
| reliability | independent-reviewer | final_reviews.reliability | objective-audit.report_reliability | 已接通；可信部分报告与完成度分离 |
| goal_coverage | quality-auditor 重读任务/实际产物 | final_reviews.goal_coverage | objective-audit.original_goal | 已接通；应挑战台账遗漏 |
| 引用身份/基础文件检查 | quality-auditor 调 citation-verify/artifact-validate | 引用状态/文件和 JSON 检查 | 同次审计和 goal_coverage | 软消费；最终程序不直接解析引用冲突，artifact-validate 不检查全部 schema |
| 交付核验 Markdown | 同次 quality-auditor | outputs/task-deliverables-review.md | chief 将结论写回 verification/goal_coverage | 软消费；Markdown 自身非机械必交，真正消费台账字段 |
| 报告前部检查 | figure-editor 读最终前 10,000 字符 | outputs/report-frontmatter-review.md | independent-reviewer | 软消费；无独立机械字数/内容门 |
| G1-G4 自动决策 | chief 应用 auto-gates/实际限制 | 07-auto-decisions.json | 调度/执行/manifest | 软消费；launcher 不直接解析决策文件，G4 依赖实际输出/目标校验 |
| 最终结构/内容检查 | 报告/PNG/输出/Introduction/台账 | outputs/validation-report.md | launcher 一次恢复→再校验→退出状态 | 已接通；Introduction 英文列表逐字匹配存在语义误判，本轮未改 |
| benchmark manifest | chief 汇总来源/产物/限制 | benchmark-manifest.json | 双审/人工追溯 | 软消费；改为先存当前版供审稿，修复后更新；无独立 schema 发布门 |
| artifact-registry | AGENTS 普通运行旧设计 | artifact-registry.json | benchmark 无固定读取方 | **未接入**；已标明不作为第二份必交台账 |
| context-log | 可选 start/complete 工具 | 08-context-invocation-log.json | 无固定调用和审查读取 | **未接入**；指令说记录上下文不证明调用了该工具 |
| execution-state | 可选 initialize/start/complete/recover | 09-execution-state.json/文件 hash/断点 | 无固定初始化/恢复调度 | **未接入**；不能宣称自动续跑有保障 |
| failure-memory | 可选 record/review/query | 10-failure-memory.json/激活撤销历史 | 无指定独立 reviewer/激活/重试前 query | **未接入**；中文可读字段与英文 benchmark 产物仍需适配，未强行启用 |
| 通用 contracts/Research Package | schemas/curator 模板 | 通用契约/deliverables 清单 | 无 benchmark 全量 schema validator | **未接入发布校验**；schema 存在不等于校验已执行 |

## 消费与修复规则

同次评审返回 item/claim ID、问题、证据、严重度、负责专家和下一动作。责任专家实际修复后由 curator 更新现有台账，再复审受影响条目；负结果可通过，未执行或条件错配不可通过。图检查、verification、final_reviews 由对应独立专家返回，chief 仅保存。两条 final review 不合并代签。

此次没有强制启用闲置工具；如未来启用，需同时接通生产、独立审查、消费及语言适配。没有固定调度器的系统依赖模型遵循提示，提示词连线不能冒称线上运行证据。

## 验证与剩余限制

统一入口：bash scripts/validate-ai-scientist.sh（scaffold、学术库、目标/方法/图契约、launcher、资源访问）。使用 fixture 和 mock launcher，没有执行真实科研或付费模型任务。OpenCode debug 仅确认配置/提示/权限加载，不证明调用次数或得分改善。objective-audit、research-contract、research-guidance 判定实现保持原样。

剩余问题已标注：Introduction 逐字匹配；部分审查只有软消费；final review 只校验 reviewer 非 chief 和证据路径，未做强身份认证或绑定所有产物快照；普通 ai-scientist 入口仍缺失。本轮未通过删除科学校验来改变通过标准。

修改前备份及 SHA256 清单：/home/songz/.cache/agent-system-audit/20261105T081333Z/。

实际验证结果：2026-11-05，统一验证入口通过，45 项 Node 测试全部通过（6 项库测试、34 项目标/方法/契约测试、5 项资源访问测试），另含 scaffold 和 launcher/输出校验冒烟。21 个 agent 均通过 OpenCode debug 加载，20 个 worker 的 task 权限均为 deny。原有部分 CRLF 文件导致严格行末正则误报，已仅在 scaffold/通用验证脚本匹配时去除 CR，不改 agent 权限。未执行真实模型科研任务。


现行变更：首席执行权限收紧，所有 worker 改为文件交付，curator 承接全局计划/台账/manifest/验证，writer 直接写报告，独立审查原样导入；不是新增后台调度器或强隔离。旧文中 2026-11-05 的运行与 debug 结果只描述当时版本，不作为本次加载或真实科研效果证据。
