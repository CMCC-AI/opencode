---
name: research-workflow
description: AI for Science 科研专家团的运行机制规范：workspace 布局、任务 DAG 规划、G1-G4 人工闸门、REFINE/PIVOT/STOP 失败路由与最终研究包结构。主理人与全体成员调度前必读。
---

# Research Workflow（科研运行机制）

本 Skill 定义 AI for Science 科研专家团的标准运行纪律。主理人在创建团队、调度成员、触发闸门、处理失败和归档交付时遵循本规范。

## 1. Workspace 布局

每次研究运行在 `research-workspace/<run-id>/` 下管理全部产物（run-id 格式 `YYYYMMDD-HHMMSS-主题缩写`，如 `20260831-154000-litrev-llm4sci`）：

```
research-workspace/<run-id>/
├── 00-input.json                    # 用户需求原话与材料清单
├── 01-research-project.json         # 研究项目对象（目标、范围、当前阶段）
├── 02-intent-state.json             # 意图识别结果
├── 03-asset-registry.json           # 资产注册表
├── 04-research-charter.yaml         # 研究章程
├── 05-takeover-plan.yaml            # 任务 DAG（无环）
├── 06-capability-profile.json       # 能力画像
├── 07-human-decisions.json          # 人工决策记录（G1-G4）
├── artifact-registry.json           # 非临时产物登记
├── literature/                      # 检索策略、候选集、证据卡、综合
│   ├── search-plan.yaml
│   ├── candidates.json
│   ├── evidence/<paper-id>.json
│   └── synthesis.json
├── methodology/                     # 方法论与实验方案
│   ├── methodology.json
│   └── experiment-plan.yaml
├── code/                            # 代码实现与交接
├── experiments/<run-id>/            # 每次实验运行的记录与原始产物
│   ├── run-record.yaml
│   └── diagnosis.yaml
├── findings/                        # 结果分析
│   └── analysis.yaml
├── writing/                         # 大纲、草稿、编辑
│   ├── outline.yaml
│   ├── draft-<n>.md
│   ├── handover.yaml
│   └── edit-report.yaml
├── reviews/                         # 独立审查与审计
│   ├── review-<n>.yaml
│   └── citation-audit.yaml
└── deliverables/                    # 最终交付
    ├── report.md                    # 中文最终报告
    └── research-package-manifest.json
```

> 恢复既有运行时：用户提供 workspace 或 run-id 后直接续用，不得新建。

## 2. 研究循环

任务按 `Gather（汇集）→ Act（行动）→ Verify（验证）→ Adjust（调整）` 循环推进：
- **Gather**：汇集需求、材料、已有产物
- **Act**：调度对应专家组的专家执行任务
- **Verify**：对产物和证据进行验证（可解析性、契约、事实边界）
- **Adjust**：决定继续、补充、回退、转向或停止

## 3. 任务 DAG 规则

- `05-takeover-plan.yaml` 是当前计划版本的无环主 DAG，至少包含：目标、范围、资产、选中专家、任务节点、依赖、并行组、跳过模块、预算、停止条件、人工闸门、有限失败路由
- **不得用循环边表达无限重试**；重试上限在计划中显式声明
- 计划版本化：PIVOT 后旧计划保留，新计划版本号 +1
- 按计划选择专家而非顺序穷举；文献综述跳过方法/实验专家组，已有结果写作先审计证据

## 4. G1-G4 人工闸门

| 闸门 | 名称 | 触发时机 | 控制内容 |
|------|------|---------|---------|
| G1 | 研究范围 | 开始大规模检索/实验前 | 研究对象、综述范围、复现目标、交付物 |
| G2 | 资源与权限 | 使用外部资源前 | 数据许可、未知仓库、安装依赖、网络访问、GPU/费用、危险命令、敏感数据、现实实验条件 |
| G3 | 实验方案 | 实验任务开始前 | 假设、可反驳条件、数据与划分、基线、指标、重复、统计、成功标准、停止条件、预算 |
| G4 | 结论发布 | 发布前 | 关键结论、证据等级、失败、局限、未核验引用、实验真实性、公开范围 |

规则：
- 每次用户确认将**用户原话、时间与决策 ID** 记录到 `07-human-decisions.json`
- 未通过不得越过边界：G1 未过不得大规模检索/实验；G2 未过不得执行受影响节点；G3 未过不得跑实验；G4 未过只能交付“待发布研究包”
- 允许并行推进不受影响的已就绪节点（如 G2 等待确认时可继续写代码）
- 用户修改方案后必须保留版本；不得事后无记录改变评测口径
- 非实验研究显式登记“不触发”依据后可跳过 G3

## 5. 失败路由（REFINE / PIVOT / STOP）

实验失败、结果违反预注册标准、假设被否定或出现异常证据时：

1. 先保存真实产物与日志，再调 `as-experiment-diagnostician` 诊断
2. 诊断按顺序排查：可复现性 → 环境 → 数据 → 实现 → 数值稳定性 → 评测 → 统计功效 → 方法假设
3. 失败路由只能是有界决策：
   - **REFINE（优化）**：仅修复不改变研究语义的实现、环境、记录问题；重试受计划次数与预算限制
   - **PIVOT（转向）**：方法、假设、评测、数据范围或关键结论变化；保留旧计划历史，创建新计划版本，按影响重新进入 G1 或 G3
   - **STOP（停止）**：关键条件不可得、预算耗尽、风险不可接受或用户终止
4. 不得静默重跑、挑选最好结果、事后修改成功标准

## 6. 产物登记与校验

- 每个成员回传的专业产出，主理人先校验：可解析（JSON/YAML 合法）、必需字段齐全、事实边界正确（如“待核验”不升级为“已核验”）
- 通过校验后落盘到 workspace 对应目录，登记到 `artifact-registry.json`（记录产物路径、来源成员、验证状态、时间）
- 未通过校验的输出不得被后续任务引用，退回重做

## 7. 完整性审计（归档前）

调用 `as-research-package-curator` 前，主理人必须完成最小审计清单：

1. 接管产物（00-07 文件）、章程和计划版本齐全且可解析
2. 计划中每个任务节点都有明确终态（完成/跳过/停止/取消+理由）
3. 每项 G1-G4 决策有记录或有“不触发”依据
4. 非临时产物均登记在 `artifact-registry.json`，证据状态一致
5. 独立审查与引用审计已执行，阻断问题已回退修复或如实披露
6. 失败、局限、待核验项在最终交付中显著披露

审计未通过：回退修复或 STOP，不得进入归档。

## 8. 研究诚信底线

- 禁止伪造论文、DOI、引用、代码、数据、命令、日志、指标、图表、实验成功或人工批准
- 网络不可用 → 标记“待核验”，不得判定真实或虚构
- 计算、仿真、Dry Lab、湿实验、仪器实验必须如实区分标注
- 论文数值 = 原文声明 ≠ 当前系统运行结果
- G4 未确认不得宣称“最终发布”

## 9. 语言规范

- 所有面向用户的输出以中文为主
- DOI、arXiv、JSON 字段、代码标识、PROCEED/REFINE/PIVOT/STOP 可保留英文，但**首次出现时必须给出中文解释**
- 不得返回仅有英文键值而没有中文说明的结果

## 10. 产物契约 Schema

各 workspace 产物的字段契约见 `references/contracts/`（9 个 JSON Schema，字段名中文化）：

| Schema | 对应产物 |
|--------|---------|
| `research-project.schema.json` | `01-research-project.json` |
| `takeover-plan.schema.json` | `05-takeover-plan.yaml` |
| `evidence-claim.schema.json` | 证据声明（Evidence Claim） |
| `experiment-plan.schema.json` | `methodology/experiment-plan.yaml` |
| `experiment-run.schema.json` | `experiments/<run-id>/run-record.yaml` |
| `research-package.schema.json` | `deliverables/research-package-manifest.json` |
| `context-invocation-log.schema.json` | 上下文调用日志（按需使用） |
| `execution-state.schema.json` | 任务状态追踪（按需使用） |
| `failure-memory.schema.json` | 失败经验账本（按需使用） |

最终报告模板见 `references/research-package.md`。成员产出 YAML/JSON 时以其对应 Schema 为字段规范；Schema 与本文冲突时以本文的闸门与诚信规则为准。
