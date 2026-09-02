# CMCC Agent 专属会话页面接入方法论

> 适用工程：`OpenCode/packages/app-cmcc`  
> 适用场景：某个 Agent 需要从 OpenCode 原生时间线升级为“多 Agent 团队 + 文件 + 报告 + 回放”的专属页面。  
> 方法来源：DeepTrading、DeepInspect 两次真实改造经验。

## 1. 方法目标

这份方法论解决的不是“如何再复制一个页面”，而是以下几个重复出现的问题：

- 怎样确认 Agent 实际返回了什么，而不是根据 Prompt 猜结构。
- 怎样处理同一子 Agent 的重试、修订和多轮核验。
- 怎样把文件准确归属到当前会话，而不是扫描最新目录。
- 怎样判断文字报告、可视化报告的权威产物。
- 怎样复用 DeepTrading 已有能力，同时不影响普通会话和其他 Agent。
- 怎样用真实历史会话完成可重复验收。

完成本方法后，后续 Agent 接入应从“重新研究整个 OpenCode 页面”缩减为：

1. 收集两个真实样例。
2. 填写数据契约表。
3. 复用工作台基础层。
4. 实现 Agent 专属配置和报告适配。
5. 按固定测试矩阵验收。

## 2. 核心原则

### 2.1 先取证，再开发

至少准备两类已完成会话：

- 简单或样例任务：用于确认标准流程和标准产物。
- 真实复杂任务：用于暴露重试、多轮修订、大文件和异常结构。

不能只依据 `expert.json`、Agent Markdown 或一篇成功报告设计页面。Agent 声明的是预期行为，会话、Message、Part 和落盘文件才是实际行为。

### 2.2 不猜权威数据

- 页面类型必须通过完整 `agentType`、根 `Session.agent` 或首条用户消息 Agent 精确识别。
- 子会话必须通过 `parentID` 和根会话完成态 `task.metadata.sessionId` 关联。
- 文件必须来自当前根/子会话完成态 `write` 记录。
- 报告必须使用明确文件角色或经过验证的 schema。
- 多个目录、多份候选报告无法唯一确定时，展示歧义，不选“最新的一份”。

### 2.3 通用能力复用，业务语义单独配置

可直接复用：

- 根/子会话加载及 SSE 更新。
- Assistant 文本提取和追问归并。
- 会话状态、耗时和 token 统计。
- `task` 子会话权威映射。
- `write` 文件归属和工作区边界检查。
- 文件读取、预览、下载。
- 左右分栏、移动端切换和回放时间轴框架。

必须按 Agent 确认：

- 团长、成员、可选成员和显示顺序。
- DAG 层级和边。
- 进度分母及失败/可选节点规则。
- 业务统计卡。
- 文字报告文件名。
- 可视化报告文件名和 schema。
- “做同款”的 `agentType` 与根 Agent。

### 2.4 默认不改接口

专属页面优先消费现有 OpenCode Session、Message、Part、文件 API 和 DockAPI 历史绑定。只有现有数据确实无法表达需求时，才讨论新增后端接口或字段。

## 3. 接入前的数据取证

### 3.1 确认根会话

记录每个样例的：

- 根 Session ID。
- DockAPI `agentType`。
- `Session.agent`。
- 首条 UserMessage 的 `agent`。
- `metadata.cmccArtifactDirectory`。
- 根会话创建、更新时间和 token。

专属页面只作用于根会话，`session.parentID` 存在时必须继续使用原生子会话页面。

### 3.2 清点全部子会话

调用当前根会话的 children 接口，按 `session.agent` 分组，记录：

| 检查项          | 目的                                      |
| --------------- | ----------------------------------------- |
| 配置成员数      | 确定页面固定节点数                        |
| 实际 Agent 种类 | 确定必选与可选节点                        |
| 每类子会话数量  | 识别重试和多轮修订                        |
| 二级 children   | 判断“详情信息”展示二级 Agent 还是执行记录 |
| 创建与完成时间  | DAG 状态、耗时和回放排序                  |

同一 Agent 有多个子会话时，不能直接按 children 顺序或创建时间选正文。应从根会话完成态 `task` Part 中读取：

```text
state.input.subagent_type
state.metadata.sessionId
state.time.end
```

同一 Agent 取 `time.end` 最大的完成态 task；时间相同再按 Part ID 稳定排序。现有实现可复用 `extractTaskChildPreferences()`。

### 3.3 清点工具和文件

遍历根会话及全部相关子会话，统计：

- `task` 调用及结果。
- `write` 的 `state.input.filePath`、`state.metadata.filepath`。
- `edit` 对已有产物的后续修改。
- 业务统计所依赖的工具输出。
- 工作区外临时脚本或中间文件。

生成“文件契约对照表”：

| 文件      | 两个样例是否都有 | 产生 Agent | 是否会重写 | 页面角色   | schema 是否一致 |
| --------- | ---------------- | ---------- | ---------- | ---------- | --------------- |
| 输入文件  |                  |            |            | 支撑文件   |                 |
| 汇总文件  |                  |            |            | 统计来源   |                 |
| Markdown  |                  |            |            | 文字报告   |                 |
| JSON/HTML |                  |            |            | 可视化报告 |                 |

### 3.4 对比 JSON schema

不要只比较文件名。至少比较：

- 根节点类型。
- 顶层字段。
- 数组项字段。
- block 类型。
- 可选字段和重试版本。
- JSON 是否真的可解析。

如果同一个文件出现两种已经验证的结构，可以实现两个显式适配器；不能写一个宽松解析器把未知字段凑成页面。

### 3.5 对比目录隔离

将真实 `write` 路径与根 Session 的 `cmccArtifactDirectory` 比较：

- 正常：产物位于独立会话目录及其子目录。
- 历史异常：产物仍在当前用户工作区，但不在独立会话目录。
- 非法：产物位于当前用户工作区之外。

历史异常可按真实 write 记录兼容展示并提示；非法路径不能进入文件列表。未来运行必须同步修订 Agent Prompt，确保所有成员继承独立产物目录。

## 4. 页面数据契约

开发前必须形成以下决策，不能留给组件运行时猜测。

### 4.1 页面选择

每个专属 Agent 提供独立 `page-selection.ts`：

```text
根 Session.agent 精确匹配
或 DockAPI agentType 精确匹配
或首条用户消息 Agent 精确匹配
并且 session.parentID 为空
```

会话尚未加载完整时可以用 DockAPI 绑定兜底；追问导致后续 UserMessage Agent 变化时，首条用户消息仍保持页面类型稳定。

### 4.2 团队和 DAG

团队配置至少包含：

- Lead Agent。
- 固定成员。
- 可选成员。
- 头像、姓名、职业。
- DAG levels 和 edges。
- 进度所需的核心节点。

如果业务允许循环重试，DAG 只表达主流程，不画循环线。重试在“详情信息”中按真实执行记录展示。

可选节点未启动时：

- 节点保持等待态。
- 不进入进度分母。
- 与该节点相连的边保持灰色。
- 专家团数量仍按配置成员数显示。

### 4.3 正文和追问

- “总览”读取根会话 Assistant 的可见 Text Part。
- 一级专家读取权威子会话 Assistant Text Part。
- 排除 Reasoning、Tool、Step 等过程 Part。
- 根会话每条追问及对应 Assistant 回复按时间组成 `overviewTurns`。
- 用户切换节点后，其他节点更新不能强制改变当前选择。

### 4.4 统计口径

每张统计卡都必须注明数据来源。

通用统计：

- 思考时间：根会话首条用户消息到所有纳入会话的最后完成时间。
- token：明确选择“全部重试成本”或“权威会话成本”，累加 `input + output + reasoning`，排除 cache。
- 专家团：配置成员数，不等于当前已创建会话数。

业务统计：

- 必须来自已验证的结构化字段。
- 文件无效或字段缺失时显示 `--`。
- 不从报告正文、标题或自然语言推断数字。

### 4.5 文件和报告

文件发现规则：

1. 只读取当前根会话及其相关子会话的完成态 `write`。
2. 两个路径字段同时存在但不一致时标记歧义。
3. 路径必须位于当前用户工作区。
4. 同一路径被同一 Agent 的重试会话重写时，可按配置保留最终 write。
5. 不同 Agent 写同一路径时继续标记冲突。
6. 多个报告目录不自动选择。

报告角色配置示例：

```ts
const ARTIFACT_ROLES = {
  "20-report.md": { role: "text-report", label: "文字报告" },
  "25-visual-report.json": { role: "visual-report", label: "可视化报告" },
}
```

文件名只是当前 Agent 的显式契约，不是所有 Agent 的通用约定。

### 4.6 可视化报告

按真实格式选择渲染方式：

- 自包含 HTML：复用安全预览和 sandbox iframe。
- 已验证 JSON blocks：严格解析 schema，使用 Markdown、ECharts 和对应 block 组件。
- 图表集合：只转换已确认的图表类型，未知类型展示原始数据表。
- 未知 schema：显示不支持提示，仍允许在文件页预览和下载。

ECharts 必须按需加载，并在容器 resize 时调整；页签卸载时释放实例。

## 5. 推荐实施顺序

### 阶段 1：纯函数

先实现并测试：

- 页面精确选择。
- 重试会话选择和执行记录。
- 进度算法。
- 业务统计字段解析。
- 目录异常判断。
- 可视化 schema 解析和占位符替换。

纯函数通过后再写页面，可以显著减少边看页面边改取值逻辑的返工。

### 阶段 2：Workbench Context

Context 负责：

- 懒加载根/子会话完整消息。
- 复用现有同步 Store 和 SSE，不创建第二条 EventSource。
- 生成 `AgentWorkbench`。
- 管理选中 Agent、执行记录、业务统计和回放状态。
- 在切换会话、开始真实生成和卸载时清理回放定时器。

Context 不直接包含大段 UI。

### 阶段 3：页面组件

按以下顺序接入：

1. 左侧总览和专家正文。
2. 底部专家导航。
3. 右侧统计和 DAG。
4. 详情信息。
5. 文件页。
6. 文字报告。
7. 可视化报告。
8. 回放和做同款。
9. 窄屏切换。

独立保存每个 Agent 的分栏宽度，避免多个专属页面共用同一个持久化键。

### 阶段 4：接入 `session.tsx`

在会话页增加独立精确分支，并统一处理：

- 专属页面占满内容区。
- 不显示普通抽屉按钮和分隔条。
- 桌面输入框只在左栏。
- 移动端输入框只在“分析内容”。
- 普通会话继续使用 MessageTimeline 和 SessionSidePanel。
- 其他专属 Agent 分支不被改变。

### 阶段 5：修订 Agent 输出约束

当真实样例暴露以下问题时，应同步修订 Agent，而不是只在前端堆兼容：

- 写出独立会话目录。
- 子 Agent 没有继承 workspace。
- 最终报告文件名不稳定。
- 团长二次改写导致 schema 变化。
- Agent 声称生成文件但没有真实 write。

历史数据可以保留有限、可验证的兼容；未来输出必须收敛到单一契约。

## 6. 验证门槛

### 6.1 单元测试

至少覆盖：

- 根会话启用、子会话不启用专属页。
- DockAPI Agent 类型加载兜底。
- 追问后仍保持专属页。
- 固定成员和可选成员进度。
- 同 Agent 多次执行的权威选择。
- 全部重试 token 和 cache 排除。
- 业务统计正确值、缺失值、错误类型和非法 JSON。
- 同路径重写、多目录歧义、工作区外文件拒绝。
- 所有已验证的可视化 schema。
- 未知 schema 不猜测。

### 6.2 静态验证

从 `packages/app-cmcc` 执行：

```bash
bun test src/pages/session/agent-workbench src/pages/session/<agent-directory>
bun typecheck
bun run build
```

仓库根目录执行：

```bash
git diff --check
git status --short
```

### 6.3 浏览器验收

每个真实样例都验证：

- 首次进入即显示专属页，无需刷新。
- 固定专家、状态、统计和 DAG 正确。
- 重试记录可查看，权威正文正确。
- 文件数量及报告路径正确。
- Markdown 报告可读取。
- 可视化图表非空、尺寸正确、无控制台错误。
- 回放运行时隐藏“做同款”，停止后恢复。
- 桌面左右独立滚动和拖动正常。
- 窄屏内容/结果切换正常，输入框位置正确。
- 刷新和切换会话后状态不串。

回归验证：

- DeepTrading 或其他既有专属页面。
- 普通 OpenCode 时间线和抽屉。
- 历史列表、输入发送和案例库。

### 6.4 性能基线

修改前后使用同一组定向测试和同一历史会话比较：

- 初次页面可交互时间。
- 子会话请求数量。
- DOM/Canvas 数量。
- 控制台错误。
- 大型图表库是否按需加载。

不要为了专属页面在登录或历史列表加载时批量获取所有子会话详情。

## 7. DeepInspect 实例

DeepInspect 的最终契约如下：

- 根 Agent：`deepinspect/deepinspect-team-lead`。
- 配置专家：11 位。
- 核心节点：10 位。
- 可选节点：`deepinspect/web-researcher`。
- 文字报告：`20-report.md`。
- 可视化报告：`25-visual-report.json`。
- 业务统计：`06-consolidated-issues.json.statistics.total_issues`。
- 详情信息：当前 Agent 的全部直接执行和重试记录。
- token：根会话加全部唯一子会话，包含重试，排除 cache。
- 可视化兼容：`layout_version/sections/blocks` 和 `charts/summary/design_notes` 两种已验证历史结构。
- 未来输出：统一写入独立产物目录，统一生成 `layout_version: 2` 的 `25-visual-report.json`。

实现参考：

- [`agent-workbench`](../packages/app-cmcc/src/pages/session/agent-workbench/)
- [`deeptrading`](../packages/app-cmcc/src/pages/session/deeptrading/)
- [`deepinspect`](../packages/app-cmcc/src/pages/session/deepinspect/)
- [`session.tsx`](../packages/app-cmcc/src/pages/session.tsx)

## 8. 新 Agent 接入清单

### 数据确认

- [ ] 至少有一篇简单样例和一篇真实复杂样例。
- [ ] 根 Agent、agentType、首条 UserMessage Agent 已确认。
- [ ] 配置成员、实际成员、可选成员已确认。
- [ ] 重试、修订、核验会话已分组。
- [ ] 二级子会话结构已确认。
- [ ] token 统计范围已确认。
- [ ] 业务统计字段已确认。
- [ ] 文件清单、产生者和重写规则已确认。
- [ ] 文字报告文件和格式已确认。
- [ ] 可视化报告文件和全部已知 schema 已确认。
- [ ] 独立产物目录继承已确认。

### 开发确认

- [ ] 新增精确页面选择测试。
- [ ] 复用工作台纯函数和现有 SSE Store。
- [ ] 定义成员、DAG、进度和头像配置。
- [ ] 定义重试选择与详情规则。
- [ ] 定义文件角色和冲突策略。
- [ ] 实现文字/可视化报告适配。
- [ ] 使用独立分栏持久化键。
- [ ] 接入回放和做同款。
- [ ] 更新 Agent workspace 与最终产物约束。

### 验收确认

- [ ] 定向测试通过。
- [ ] 类型检查通过。
- [ ] 生产构建通过。
- [ ] 两个真实历史会话通过浏览器验收。
- [ ] 桌面和窄屏通过。
- [ ] 可视化 Canvas 非空且无控制台错误。
- [ ] 既有专属 Agent 无回归。
- [ ] 普通会话抽屉无回归。
- [ ] `git diff --check` 通过。

## 9. 禁止做法

- 根据用户问题关键词判断 Agent 页面。
- 根据最新目录、修改时间选择报告。
- 根据文件扩展名猜最终报告角色。
- 将 Session、Message、Step 三套 token 混加。
- 把 cache token 计入用户看到的消耗。
- 遇到多个重试会话时默认选最后创建的 children。
- 为了显示图表而猜未知 JSON 字段。
- 新建第二条 SSE 或维护第二套长期消息缓存。
- 为接入新 Agent 改坏 DeepTrading 或普通 SessionSidePanel。
- 只跑类型检查，不用真实历史会话做浏览器验收。

## 10. 交付说明模板

每次 Agent 接入完成后，交付说明至少包含：

```text
Agent：
根 Agent：
配置成员数：
核心/可选节点：
文字报告：
可视化报告：
业务统计：
重试选择规则：
目录兼容规则：
真实验收会话：
单元测试：
类型检查：
生产构建：
浏览器验收：
未纳入范围：
```

这份信息应与代码中的配置和测试一致，不能只写页面效果。
