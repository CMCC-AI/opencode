# 首席职责疏解与上下文控制

本次针对首席会话因深读、执行、写作和台账修补而膨胀的问题，保持唯一编排者、原始科学目标、资源诚信边界、schema 3.0 和独立双审。不是扩大上下文窗口，也不保证消除所有上下文超限。

## 分工

| 责任 | 生产者 | 消费者 |
|---|---|---|
| 锁定原目标、授权/预算、G1-G4、路由和发布判断 | 首席 | curator 记录、对应执行专家 |
| 目录初盘点、规范文件持久化/合并、格式修复、manifest、机械验证 | curator | 首席短回执、独立双审、launcher |
| 独立范围核验、方法选择、goal_contract、台账/计划提案 | planner | 首席决策、curator 注册、执行专家 |
| 论文/方法/实验设计 | 相应文献与设计专家 | 工程、执行、分析、writer |
| 实现/获取/计算/绘图/故障修复 | engineer/operator/diagnostician | analyst、独立审查 |
| 数值、统计、敏感性、缺失上限和结论 | analyst | writer、独立双审 |
| 大纲/报告正文与修订 | writer | 编辑与双审 |
| 实际 PNG、底层结果、哈希、前部检查 | figure editor | curator、双审 |
| 可靠性及科学 outcome review | independent reviewer | curator 原样登记、首席修复路由 |
| 引用身份、逐项验收与目标覆盖 | quality auditor | curator 原样登记、首席修复路由 |

## 权限与交接

首席 edit/bash/websearch/webfetch/research-guidance/objective-audit 均 deny，保留 read 与 as-* Task 白名单。worker 全部 task: deny；允许 edit 是为直接保存自己的详细成果，不自动放开 bash/网络。归档专家新增 bash 执行现有机械校验。独立审查专家仅写自身审查文件，不能修改被审的科学产物。图表编辑不得修改图片后自己签独立通过。路径约束是角色指令，不是强文件权限隔离。

每次 Task 传入 workspace/config/run ID、item/claim、单个有界目标、所需证据路径、可写路径、验收、预算和资源限制。worker 先读 delegation.md 和原任务，完整旧输出契约落盘，最终仅给不超过 1200 个英文字符的简短回执。中文普通运行沿用语言规则；benchmark 产物全英文。不再把全文草稿、长 JSON 或论文回灌首席。必要细节仍在文件中，独立审查者必须实读证据。

全局 ledger/plan/manifest 只有 curator 写入，避免多专家覆盖；planner 和审查者保存独立提案/记录。curator 使用原有工具保留冻结基线、历史、reviewer 身份、失败状态和审查绑定的版本，不自行创造 verified。schema 修复不等于科学补救。原目标和七维数据/图表/独立双审条件不变。

curator 在阶段交接更新运行目录 orchestration-state.md，仅记当前依赖、预算、决策、证据/审查路径及下一动作。恢复先读原任务与该索引；缺失时由 curator 从当前 workspace 重建，不读其他项目范例。launcher 的唯一额外最终恢复仍保留，恢复阶段也必须分派实际执行，不让 chief 接管。

## 验证边界

静态回归测试检查首席权限、worker 的不调度约束、文件回执与各角色落盘责任、launcher 恢复提示；原科学/目标审计和输出验证测试继续运行。OpenCode debug 检查加载，不调用付费模型。没有真实端到端科研重跑时，不声称已降低实际 token 数或提高科研得分。

## 本次验证记录（2026-11-27）

- macOS 本地与 buaa-ica 隔离临时副本均运行 `bash scripts/validate-ai-scientist.sh`，完整通过；共 64 项 Node 测试，另含 scaffold 与 launcher/输出验证冒烟。
- 服务器 OpenCode 1.18.31 的新进程执行 `opencode debug config` 和 `opencode debug agent ai-scientist-benchmark` 均退出 0。解析结果包含 21 个 agent；20 个 worker 的 task 均为 deny。首席 edit/bash/websearch/webfetch/research-guidance/objective-audit 均加载为 deny，as-* 调度白名单加载成功；writer/planner/reviewer 可保存各自产物，curator edit/bash 为 allow。
- 服务器只在 `/tmp/chief-delegation-20261127/` 验证，没有覆盖现用安装或原科研 workspace，没有运行真实模型科研实验，也没有测量上下文节省比例。
- `SOURCE-SHA256SUMS.txt` 为导入副本原始来源的历史清单，保留用于来源追溯，不代表本次修改后文件的校验和；当前版本以 Git 提交为准。
