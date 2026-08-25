# DockAPI 与 APP 分支：用户、会话和产物隔离分析报告

**分析日期：** 2026-08-20
**分析范围：**

- OpenCode APP 分支：`app`，提交 `a1f9a31dc8`（`perf(cmcc): 优化会话创建与运行时隔离`）
- DockAPI APP 合并分支：`origin/DockAPI-app-merge`，提交 `c919b172f7`
- DockAPI 独立后端：`/Users/levent/cmccProjects/ai-agents/dockapi-service`，`DockAPI` 分支，提交 `29b8754`

## 1. 结论摘要

两条分支采取了不同层级的隔离策略：

| 维度 | APP 分支 | DockAPI-app-merge 分支 |
| --- | --- | --- |
| 用户身份 | 本地 APP 运行上下文 | DockAPI 登录、JWT 和业务用户 |
| 用户之间的目录隔离 | 不属于该分支的主要职责 | 有；每个用户一个工作目录 |
| OpenCode 会话隔离 | 有；由 OpenCode session ID、消息和 SQLite 负责 | 有；由 `user_id + opencode_session_id` 业务绑定和 OpenCode session ID 共同负责 |
| 同一用户不同会话的产物隔离 | 有；每个新对话分配独立 `runs/<timestamp>-<uuid>` 目录 | 没有；同一用户的会话共用一个目录 |
| OpenCode `session.directory` | 通常是稳定 runtime 或选定 worktree，不等于产物目录 | 同一用户的所有会话都使用同一用户目录 |
| 产出面板的文件范围 | 优先按 session metadata 中的产物目录收敛 | 会话 Tool/补丁可区分，但工作目录扫描可能混入其他会话文件 |

**最终建议：** DockAPI 应与 APP 分支对齐“每会话独立产物目录”的产品行为，但不要立刻把 OpenCode 的主 `directory` 改成每会话一个目录。推荐采用两层模型：

```text
用户稳定运行目录：/workspace/u-{userId}/
└── runs/
    ├── {opaque-session-artifact-id-A}/
    └── {opaque-session-artifact-id-B}/
```

其中，用户稳定运行目录继续用于 OpenCode 的实例/路由上下文；`runs/<id>` 是该会话专用的产物目录。这样能解决同一用户会话之间的文件混杂，又不会把 OpenCode 的运行范围、事件订阅和实例初始化全部切成会话级。

## 2. 分支基线与比较方式

两条分支共同基线为 `90ce03f2eabf`。不能直接把当前 `app` 与 `DockAPI-app-merge` 的完整差异当作“用户功能差异”：

- `DockAPI-app-merge` 相对共同基线为 12 个文件、634 行新增、404 行删除；核心用户功能来自 `f60376987c`（“增加登录、历史记录、调用SSE方法”）。
- 当前 `app` 相对共同基线已有 222 个文件、10,249 行新增、3,096 行删除，包含专家能力、性能优化、运行时隔离、文件 API 等大量与 DockAPI 无关的演进。

因此，本报告以共同基线为参照，单独识别 DockAPI 用户功能和 APP 的会话产物隔离能力，而不是建议直接合并整条分支。

### 2.1 以当前 APP 头部为目标基线的补充对比

共同基线用于回答“DockAPI 当初增加了什么”；但实际集成必须回答另一个问题：**相对于当前 APP，DockAPI-app-merge 缺少了什么，又应保留什么？**

本次也按这个角度进行了复核。当前 `app` 比 `DockAPI-app-merge` 晚约一周，直接比较两端会涉及 230 个文件、数千行代码和大量专家资源、部署脚本、核心服务与文件 API 的后续演进。因此，直接 `merge` 或 `cherry-pick` 整个 DockAPI 分支都不合适。

从共同基线到两个分支的变更路径交集只有 4 个文件：

```text
packages/app-cmcc/src/app.tsx
packages/app-cmcc/src/components/prompt-input/submit.ts
packages/app-cmcc/src/pages/cmcc-experts.tsx
packages/app-cmcc/src/pages/layout-new.tsx
```

这 4 个文件恰好同时承载了 DockAPI 的登录/会话接入和 APP 后续的运行时、草稿与会话产物逻辑，因此需要**语义合并**，不能按文件版本覆盖。

下表是以当前 APP 为底座时的真实差异和集成原则：

| 当前 APP 后续能力 | DockAPI-app-merge 状态 | 集成时的处理 |
| --- | --- | --- |
| 新对话分配 `runs/<timestamp>-<uuid>` 产物目录 | 缺失，所有会话使用用户主目录 | 保留 APP 逻辑，并让 DockAPI 返回/持久化该会话的产物目录 |
| `cmccArtifactDirectory` metadata 与系统提示约束 | 缺失 | 保留 APP 逻辑；DockAPI 创建会话后须提供或确认该 metadata |
| 产出面板按 artifact root 过滤路径 | 旧实现会扫描共享用户目录 | 采用当前 APP 的 `session-side-panel.tsx`，不要回退到旧扫描方式 |
| 草稿 tab 携带 `artifactDirectory` | 当前 APP 已支持 | DockAPI 新会话入口必须把后端返回的 artifact 信息带入草稿和首个 prompt |
| 用户登录、JWT、业务会话列表/改名/软删除 | DockAPI-app-merge 已实现 | 以新增的 `dockapi.tsx`、认证门禁、业务 session API 为功能来源，重新接入当前 APP |
| 当前 APP 的运行时隔离、文件 API、测试和核心服务演进 | DockAPI-app-merge 未包含 | 以当前 APP 为准，不能被旧分支版本覆盖 |

因此，推荐的合并顺序是：**当前 `app` 作为唯一代码基线 → 单独移植 DockAPI 认证和业务会话能力 → 在该基础上接入当前 APP 的会话产物目录协议。** 这也是本报告最终建议所依据的比较维度。

## 3. 当前 APP 分支的实现

### 3.1 实际模型：稳定运行目录 + 会话产物目录

当前 APP 的新对话流程不是“每个 OpenCode session 都换一个 `directory`”。它把两个概念分开：

```text
OpenCode session.directory：稳定 runtime 或选定 worktree
会话产物目录：runtime/runs/<timestamp>-<uuid>
会话消息与状态：OpenCode session ID / SQLite
```

新建会话时，`cmccArtifactWorkspace()` 在 `packages/app-cmcc/src/utils/cmcc-workspace.ts` 生成唯一目录；例如：

```text
/runtime/runs/2026-08-20-10-30-00-4c1e9f8a-...
```

`packages/app-cmcc/src/pages/layout-new.tsx`、`packages/app-cmcc/src/app.tsx` 与专家团入口 `packages/app-cmcc/src/pages/cmcc-experts.tsx` 会在创建草稿时生成该目录，并通过 `cmccEnsureWorkspace()` 调用文件 API 建立目录。

首次提交时，`packages/app-cmcc/src/components/prompt-input/submit.ts` 会：

1. 确认该目录已经创建；
2. 创建 OpenCode session；
3. 将 `cmccArtifactDirectory` 写入 session metadata；
4. 为本次 prompt 注入系统约束，要求文件工具、shell 和子 Agent 使用该目录。

### 3.2 前端如何只显示当前会话产物

`packages/app-cmcc/src/pages/session/session-side-panel.tsx` 从当前 session metadata 读取 `cmccArtifactDirectory`，并验证该目录必须位于 runtime 的 `runs/` 下。随后它：

- 仅以当前会话的 artifact root 扫描工作目录；
- 只保留位于该 root 内的 Tool 写入、补丁和差异路径；
- 将产出面板、预览和下载关联到该会话专属目录。

这使得用户在会话 A 中只看到 A 的产物，而不是同一 runtime 下所有历史文件。

### 3.3 APP 方案的边界

这是很有效的**应用层产物隔离**，但它不是强制的服务器安全沙箱：当前约束主要来自 metadata、前端路径筛选和系统提示。如果工具、插件或服务端没有强制路径校验，理论上仍可能访问同一 runtime 下的其他路径。强安全隔离需要额外的服务端路径授权。

代码中仍保留了旧的 `conversation-HHMMSS` 辅助函数，但当前新建对话主流程使用的是 `runs/<timestamp>-<uuid>` 产物目录模型。

## 4. DockAPI-app-merge 分支的实现

### 4.1 用户登录与业务会话

核心提交 `f60376987c` 在 `packages/app-cmcc` 中新增或修改了以下关键能力：

- `context/dockapi.tsx`：维护登录状态、用户资料、用户工作目录和业务会话列表；
- `components/dockapi-auth-gate.tsx`：未登录时阻断 APP 主界面；
- `context/server-sync.tsx`：当当前目录等于 DockAPI 用户目录时，通过 DockAPI 查询业务会话，再按绑定的 OpenCode session ID 读取会话详情；
- `components/prompt-input/submit.ts`：新根会话先调用 DockAPI 创建业务会话，再将返回的 OpenCode session 用于后续 prompt；
- `pages/layout-new.tsx`：侧栏基于 DockAPI 业务会话呈现、重命名和删除。

该实现把“哪些会话属于当前用户”交给 DockAPI，而不是直接展示 OpenCode 对该目录返回的所有 root session。这是用户会话可见性隔离的关键。

### 4.2 目录语义

DockAPI-app-merge 的前端把 `dockapi.workspace.directoryPath` 作为新会话的 `projectDirectory`。所有该用户的新根会话都使用这一目录；没有生成 `runs/<id>`、没有写入 `cmccArtifactDirectory` metadata，也没有为每个会话创建子目录。

因此它的目录模型是：

```text
/workspace/u-{userId}/
├── 会话 A 产生的文件
├── 会话 B 产生的文件
└── 会话 C 产生的文件
```

而不是 APP 分支的：

```text
/workspace/u-{userId}/
└── runs/
    ├── 会话 A 专属目录
    ├── 会话 B 专属目录
    └── 会话 C 专属目录
```

### 4.3 前端产出展示的实际效果

在 `f60376987c` 的 `pages/session/session-side-panel.tsx` 中，产出来源有两类：

1. 当前 session 的消息、Tool part、补丁和差异；这些记录按 `sessionID` 聚合，通常能正确归属到当前会话。
2. 工作目录扫描结果；它通过当前 `sdk().directory` 枚举符合条件的文件或 `artifact`、`output`、`report` 等目录。

因为同一用户的 `sdk().directory` 都是同一个用户目录，第二类结果可能包含其他会话产生的文件。尤其是通过 shell、Python、下载器或外部工具生成、但没有明确 `write/edit/apply_patch` Tool part 的文件，无法可靠归属到创建它的会话。

典型后果：

- 会话 A 的“产出”面板可能看到会话 B 的 Excel、PDF 或图片；
- “全部下载”可能将不同会话的文件一起打包；
- 两个会话写入相同相对路径时，后写会覆盖或改写先写的文件；
- 文件树是用户目录级的，不能通过路径天然区分文件属于哪个会话。

## 5. DockAPI 独立后端的实现

### 5.1 已有用户级隔离

`dockapi-service` 中的 `workspace/WorkspaceService.java` 为用户生成稳定工作目录，键为 `u-{userId}`，并调用 `Files.createDirectories(...)` 创建它。

`session/BusinessSessionService.java` 创建业务会话时：

1. 调用 `ensureUserWorkspace(userId)`；
2. 使用该用户目录调用 `OpenCodeClient.createSession(directory, title)`；
3. 将 `user_id`、`opencode_session_id`、`directory_path`、标题等保存至 `business_sessions`；
4. 读取、改标题和软删除时均通过 `user_id` 限制业务会话归属。

`client/OpenCodeClient.java` 的实际请求是：

```text
POST /session?directory=<userDirectory>
```

它没有创建会话子目录，也没有把 session ID 拼入文件路径。数据库 `resources/db/schema.sql` 同样只有用户工作目录和业务会话绑定，没有 `artifact_directory` 或 session 专属路径字段。

### 5.2 认证边界

DockAPI 的业务 API 由 JWT 保护；除健康检查、注册、登录、刷新等端点外，所有请求需要认证。业务会话 Controller 从 JWT principal 取得用户 ID。

与此同时，DockAPI 服务访问 OpenCode 使用配置中的 Basic Auth。DockAPI JWT 并不会自动成为 OpenCode 的用户身份。当前 APP 合并分支仍存在直接调用 OpenCode SDK 的路径，因此“DockAPI 业务列表过滤”并不等于“每一次 OpenCode 文件、事件和会话请求都经过用户授权”。这在多用户生产环境中需要补强。

另一个需要处理的点是目标分支的会话路由对找不到 DockAPI 绑定的 OpenCode session 有通用回退逻辑。DockAPI 模式下应改为拒绝或回到会话列表，不能把未绑定 session 当作普通 OpenCode 会话继续打开。

## 6. 综合评价

### 6.1 现有设计的优点

- **职责分层清楚。** DockAPI 负责认证、用户目录和业务会话绑定；OpenCode 继续负责 Agent、上下文、消息、工具、子会话、流事件和 SQLite。
- **对 OpenCode 核心侵入较小。** DockAPI 用户功能主要改动在 `packages/app-cmcc` 和独立 Java 服务中，没有为了用户功能大范围改动 OpenCode core/server。
- **用户间隔离可实现。** 正常 APP 流程中，JWT 决定用户，用户目录隔离文件根，`business_sessions.user_id` 限制历史会话列表。
- **稳定目录有运行时优势。** 同一用户复用稳定 runtime，可避免把 OpenCode 的目录实例、初始化和事件订阅完全拆成每会话一份。

### 6.2 现有设计的缺口

- **同一用户的会话产物混合。** 文件系统边界只到用户，不到会话。
- **前端产出列表并非可靠会话边界。** Tool 记录可按 session 归属，但目录扫描不能。
- **路径冲突风险。** 同一用户同时打开两个会话、生成同名文件时，存在覆盖和不可追溯问题。
- **强授权边界尚不闭环。** 仅依靠前端过滤、目录参数和共享 OpenCode 凭据，不能作为多用户越权防护的最终方案。
- **分支已发生较大时间差。** DockAPI-app-merge 基于 2026-08-13 的 APP 状态；当前 app 的产物隔离、性能和文件 API 演进不应通过一次大合并生搬硬套。

## 7. 最终推荐架构

### 7.1 默认落地方案：两层目录

```text
用户稳定运行目录（DockAPI 管理）
/workspace/u-{userId}/
├── runs/
│   ├── {artifact-id-A}/
│   └── {artifact-id-B}/
└── 用户级共享资源（如确有需要）
```

每个新业务会话拥有一个不可预测、不可由标题推导的 `artifact-id`。建议保存相对路径，例如：

```text
runs/0198f1a0-...-session-artifact
```

服务端根据用户根目录拼接绝对路径，并验证路径始终位于该用户的 `runs/` 下；不要接受前端提交的任意绝对路径或含 `..` 的路径。

### 7.2 目录命名可以替换，但隔离协议不能省略

不需要把 APP 的 `cmccArtifactWorkspace()` 中 `runs/<timestamp>-<uuid>` 的**命名形式**原样搬到 DockAPI。它是当前 APP 在“新建草稿时尚未取得 OpenCode session ID”的场景下，为避免并发碰撞而采用的实现方式。

DockAPI 有自己的业务会话边界，适合在后端先生成一个不可复用的 `businessSessionId` 或 `artifactId`，再采用确定性目录：

```text
/workspace/u-{userId}/runs/{artifactId}/
```

用户根目录已经包含用户身份，因此子目录通常只需保存会话 artifact ID，不必重复拼接 `userId`。ID 应由后端生成，不能使用标题、提示词或前端传来的任意路径；建议使用 UUID/ULID 一类的不可预测且永不复用的值。若使用 OpenCode session ID，需要注意它通常在 OpenCode 创建之后才得到；为了在首个 prompt 前就准备好产物目录，更稳妥的做法是先生成 DockAPI 的业务会话 ID 或独立 artifact ID。

但下面这些 APP 语义必须保留或以 DockAPI 方式等价实现：

| 需要保留的语义 | DockAPI 中的等价实现 | 为什么不能省略 |
| --- | --- | --- |
| 会话与产物目录的稳定映射 | 在 `business_sessions` 保存 `artifact_path`，并在响应中返回 | 刷新、换设备、重登后仍能找到同一会话的文件 |
| 目录创建和路径校验 | DockAPI 后端创建 `runs/{artifactId}`，只接受位于用户根目录内的规范化路径 | 目录不能只由前端临时猜测，也不能允许 `..` 越界 |
| OpenCode session metadata | 写入等价的 `cmccArtifactDirectory` 或 DockAPI 专用 metadata | APP、子 Agent 和历史会话需要知道当前 session 的产物根目录 |
| Agent 的文件工作目录约束 | 保留等价于 `cmccArtifactSystemPrompt()` 的约束，或改由服务端强制 | 若 OpenCode 主 `directory` 仍是用户根目录，Agent 默认可能把文件写入共享根目录 |
| 产出面板按根目录筛选 | `app-cmcc` 仅扫描并下载当前会话的 artifact root | 仅有文件夹不会让前端自动知道文件归属 |

换句话说，**可以不搬 APP 的时间戳命名代码，但不能只创建一个空的会话目录**。如果取消 metadata、Agent 路径约束和前端根目录筛选，文件仍会写入或展示在共享用户目录中，会话隔离就没有真正生效。

未来若由 DockAPI 网关或 OpenCode 服务端对每次文件读写、下载、归档和工具路径都执行 artifact root containment 校验，系统提示可以从“主要约束”降为“辅助约束”；在此之前，它仍是必要组成部分。

### 7.3 职责划分

| 组件 | 应负责的事情 |
| --- | --- |
| DockAPI | 创建用户目录、生成会话产物目录、保存业务绑定、返回 artifact 信息、校验用户归属 |
| OpenCode | 保存 session、消息、上下文、工具调用、子会话与 SQLite 数据 |
| app-cmcc | 在新建会话草稿中携带 artifact 信息；把它写入 OpenCode session metadata；只展示/下载当前 artifact root 的内容 |
| 服务端网关或 OpenCode 中间层 | 若需要强隔离，拒绝越出当前 artifact root 的文件读写、下载、归档和工具路径 |

### 7.4 为什么不建议立即“一会话一个 OpenCode directory”

将 `OpenCode session.directory` 直接设为每会话产物目录能获得更强的自然路径边界，但会把 OpenCode 的实例路由、上下文、事件订阅、配置发现和目录生命周期都切成会话级。对于当前“DockAPI 管用户、OpenCode 管 Agent/runtime”的职责划分，这会带来更高的合并和运维复杂度。

先保持用户级稳定 runtime，并让产物目录会话级隔离，可以复用当前 APP 已验证的模式，改动更集中，风险更低。

## 8. 推荐实施步骤

### 阶段一：实现与 APP 一致的产物隔离

1. 以当前 `app` 为开发基线；不要整分支合并或直接覆盖 `DockAPI-app-merge` 中已被 APP 后续演进修改的文件。
2. 在 `business_sessions` 增加 `artifact_path`（建议存用户目录下的相对路径）和必要索引；不要复用所有会话都相同的 `directory_path`。
3. 在 DockAPI 创建业务会话时生成 artifact ID，创建 `runs/<artifact-id>` 目录，并将其与业务会话绑定。
4. 将 `artifactPath` 或解析后的 `artifactDirectory` 加入业务会话创建、详情和列表响应。
5. APP 的 DockAPI 模式复用当前 `cmccArtifactDirectory` 约定：创建/读取 OpenCode session metadata，并将 artifact 路径传入系统提示。
6. DockAPI 模式下的产出面板只扫描当前 `artifactDirectory`；历史会话没有 artifact 信息时，不扫描整个用户目录，只显示能由 session Tool/patch 记录确定归属的文件。
7. 为同一会话的子 Agent、shell、文件工具和下载动作传递同一 artifact root。

### 阶段二：收紧服务端授权边界

1. DockAPI 模式下，未绑定当前用户的 OpenCode session 不允许打开、重命名、删除、订阅或读取消息。
2. 生产环境不要让浏览器凭共享 OpenCode Basic Auth 直接获得任意目录访问能力；应由 DockAPI 代理请求，或在 OpenCode 接入可验证的用户/会话授权信息。
3. 对文件 list/read/write/download/archive 及工具执行路径做服务端 containment 校验：真实规范化路径必须位于该业务会话的 artifact root 下。
4. 定义软删除、恢复、导出和物理清理策略。建议软删除时保留产物，达到保留期后再异步清理；不要在普通“删除会话”操作中立即删除用户文件。

## 9. 验收标准

以下场景全部通过，才可认为会话产物隔离完成：

- 同一用户的会话 A、B 分别生成 `report.docx`，最终位于两个不同目录，互不覆盖。
- 会话 A 的“产出”列表、预览和“全部下载”不包含会话 B 的文件。
- 用户刷新、换浏览器或重新登录后，仍能从业务会话记录恢复正确的 artifact 目录。
- 子 Agent、shell 命令和文件工具均使用当前会话的 artifact root。
- 用户 A 无法读取、订阅或操作用户 B 的业务会话与文件。
- DockAPI 模式下，未绑定的 OpenCode session ID 无法通过前端路由打开。
- 尝试使用 `../`、符号链接跳转或绝对路径越过 artifact root 的文件访问被服务端拒绝。
- 老会话在没有 artifact 信息时仍可查看聊天历史，但不会错误展示整个用户目录的文件。

## 10. 结论

DockAPI-app-merge 的用户认证、用户目录和业务会话绑定方向是正确的，并且对 OpenCode 核心的侵入较低；它已经解决了“不同用户看到哪些会话”的基础问题。

当前缺少的是“同一用户不同会话的产物边界”。最合适的下一步不是重做 OpenCode 的 session 目录模型，而是让 DockAPI 后端成为会话产物目录的权威所有者，并复用当前 APP 的 `runs/<uuid> + session metadata + 前端按根目录扫描` 模式。

这能以较小的架构代价获得清晰的文件归属、可靠的产出展示和更好的多设备一致性；若业务需要真正的安全沙箱，再在此基础上补充服务端路径授权，而不是仅依赖前端或提示词。

## 11. 分析边界

本报告基于分支代码、提交记录和 DockAPI 服务源码的静态分析完成；未启动完整的 DockAPI、OpenCode Server 和 APP 联调环境，也未执行跨用户越权或文件系统逃逸的动态安全测试。建议在实施阶段二前补充端到端集成测试和安全测试。
