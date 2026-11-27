# 分层研究方向引导

本改造聚焦固定方法库辅助新任务研究，不实现在线学习或自我更新。

## 三层设计

- **L1 研究方向**：8 个跨领域方向，回答研究中需要解决哪类证据问题。规划时逐项记录选择、延期或不适用及原因，而非全量执行。
- **L2 方法分支**：61 个可组合条目，含适用条件、目标、行动原则、证据、后续判断和边界。工具与模型仅作为有适用条件的候选示例；不硬编码具体数据量、验收数值、参考误差或目标结论。
- **L3 证据计划**：根据新任务的输入、输出、约束和真实材料实例化。具体到研究主张、负责专家、操作方案、支持/反驳条件、证据文件及报告位置。

例如“模型可靠性”方向下可选择数值稳定性、代理模型验证或独立场景验证。新的物理、经济、生物或算法任务可以使用相同方法逻辑，但应自行确定变量、指标、计算方式及条件。方法库不使用题号或关键词自动路由，也不假设所有任务都训练模型或做消融实验。目录以英文提供给 benchmark；普通协作的说明遵循中文规则。

| L1 通用研究方向 | L2 可选方法分支 |
|---|---|
| 问题可检验化 | 主张设计、假设审查 |
| 数据与测量理解 | 数据审计、分布与异质性分析 |
| 表征与模型构建 | 表征变换验证、模型结构验证、近似与代理模型验证 |
| 可信结果比较 | 公平基线比较、指标与阈值验证、资源与质量权衡 |
| 贡献与机制解释 | 消融与干预、竞争解释辨别、可解释性核验 |
| 不确定性与稳定性 | 不确定性传播、敏感性分析、数值收敛、扰动稳健性 |
| 泛化与适用边界 | 外部验证、反例与边界探索、参数反演与候选设计验证 |
| 可审计证据组织 | 科学可视化、证据追溯 |

这是初始版本的编辑组织方式，尚需在新 benchmark 上检验覆盖范围和适用性。没有合适分支时应报告库缺口，而不是强行套入某个方法。

## 从 checklist 到方法

原验收项 → 所需证据 → 通用研究逻辑 → 有边界的方法条目。

运行目录内置于 `.opencode/research-guidance/catalog.json`，是 agent 固定研究流程的一部分。离线维护材料仍在同级 `../research-method-library/`：`offline/source-map.json` 记录来源映射，`offline/provenance.json` 记录原条目哈希。运行不依赖这个同级目录。原始 checklist 留在源 benchmark，不复制到 agent。映射是方法解释，不证明源条目的科学判断成立，也不证明方法库已在新 benchmark 泛化成功。

离线重新检查当前来源集合并生成清单：

```powershell
node ../research-method-library/tools/build-provenance.mjs D:/Research/Grade_Trd/ResearchClawBench
```

运行时从 agent 自身位置解析内置目录，将方法目录和渲染后的 `catalog.md` 复制到 workspace；来源映射、哈希清单、原始 checklist、图像、答案和评分权重不复制。每次任务的方法快照用于可复现性，不会自动追加到共享目录。

## 接入方式

默认 launcher 会准备目录并在初次及修复提示中注入使用要求：

```bash
scripts/ai-scientist-oc-bench --prompt "<new benchmark task>" --workspace /path/to/workspace
```

部署整个 agent 目录即可，包括隐藏的 `.opencode/`。不需要同级方法库或额外参数。旧的路径配置和启用环境变量已移除，不参与运行。更新 Linux 服务器时，应同步整个 agent 目录，再使用原启动命令；无需修改 ResearchClawBench 注册命令。

不经过 launcher 时可先准备：

```powershell
node scripts/research-guidance.mjs prepare D:/path/to/workspace
```

主 agent 调用工具 `research-guidance`：

1. `operation="catalog"`，可传 `direction_id` 获取一个方向；workspace 是任务根目录。
2. 阅读 `outputs/research-guidance/plan-example.json`，按当前研究制定计划，再以 `operation="plan"` 和 `plan_json` 字符串提交。
3. 只向子 agent 传相关方法、主张和材料；只读角色返回建议，首席负责保存。
4. 实验后再次提交计划，更新证据、解释和状态。每次保存自动留存旧版本，不能静默更换判定标准。
5. 独立审稿前调用 `operation="audit"`；缺失、空或越界的证据不得作为已支持结果。audit.json 保留引用审计；scientific_quality 另核对冻结指标、目标对齐和独立内容评审。

计划会绑定库版本与内容哈希；版本冲突要求新建 workspace，避免覆盖运行历史。保存过程检查方法 ID、方向关系、主张字段和证据路径。反驳结果同样可以是有效研究产物；inconclusive、blocked 和 planned 会显式列入 unresolved；能力目标未达到或明显偏离原目标时必须报告为未完成并由首席专家安排后续处理，不能在报告中写成已证实。

研究设计发生变化时，计划顶层必须提供 `revision_reason`。工具保留旧计划和保存时间，方便独立审稿检查事后改标准。L1/L2/L3 引导抽象层级与原 agent 的 L0-L3 证据可信度层级是独立概念。

## 维护与评估

研究引导始终运行，没有启用或关闭选项。离线修订通用方法后，将审核后的 catalog.json 发布到 agent 的 `.opencode/research-guidance/catalog.json`，同时更新版本；未审核经验不自动并入。比较研究版本时使用独立代码版本和新 workspace。

新 benchmark 评估应比较原基线和方法库版本的独立研究质量、成本及跨领域稳定性；不能用方法条目执行数量替代科学质量。当前交付有结构和接入测试，尚未执行模型驱动的新任务实验，不能宣称提高得分。

## 当前仓库的已知限制

该副本没有 `.opencode/agents/ai-scientist.md`，普通入口的旧 scaffold 检查会失败。本次修改接入实际存在的 benchmark 主入口与六个规划/方法/分析/写作/审查角色，不臆造普通入口。没有模型运行时仍可通过 Node 结构测试、launcher 假 CLI 集成测试和适配检查。

Metric families now cover predictive learning, generative validity/diversity, optimization cost/convergence, physical observables, structural/biological validation, spatiotemporal inference and algorithmic correctness. Select semantically by the current question, never by task ID. See scientific-quality.md for the frozen outcome contract and scientific validation.

## 实现工具选择（1.2.0）

新增 `implementation-tool-selection`，按科学操作、输入信息、约束和计算资源选择工具；覆盖表格预测、原子与晶体结构、图学习、生成模型、黑箱优化、数值求解、分子动力学与轨迹分析、贝叶斯推断、多维时空数据和符号计算。候选附官方文档，不固定软件版本，也不假定已经安装。

规划与实验设计专家在原有 procedure 中写清：研究操作 → 候选工具/模型及接口 → 所需输入 → 选择理由 → 环境与版本 → 代表性小试 → 检查的输出量 → 替代方案及局限。执行者先用实际授权输入试运行，不能只检查 import。缺失结构、目标函数或物理模型不能靠工具名补齐。无适用候选时允许按任务提出新工具。

本次只补充工具选择，不新增独立台账、评分阈值或额外自动修复闸门。新任务使用新方法快照；旧 workspace 保留原版本。

## 专门研究操作分支（1.3.0）

新增 30 个按科学操作组织的方法与工具分支，覆盖物理似然、波形、分子图、复合物、力场、空间环境分析、气象、电池、电网、成本模型、时序、多模态、LLM 推导、流量图、配方聚合物、集合选择、结构检索、纳米孔、磁性筛选、跟踪、凸优化、路径规划、几何证明、行为、连接组、神经片段、单细胞、量子采样与谱学响应。名称和候选工具不构成任务强制流程。

先用 operation="catalog", summary_only=true 阅读索引，再以 method_ids=[...] 获取相关条目；可与 direction_id 组合过滤。默认完整目录保持兼容。索引、检索均只使用部署的运行库，不读取离线来源或题号映射。每项包含输入要求、实施方法、候选工具、观测指标及单位、证据和替代边界；不提供验收数值。
