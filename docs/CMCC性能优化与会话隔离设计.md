# CMCC 性能优化与会话隔离设计说明

更新时间：2026-08-20

## 1. 背景与目标

本次问题主要表现为：

- 远程部署后点击“新对话”有明显等待，专家团入口尤其明显；
- 新对话创建目录本身很轻，但创建目录之前会触发服务端实例冷启动和多次网络请求；
- 每个对话目录都被当成一个独立运行实例，导致配置、插件、Agent、MCP、LSP 和事件监听器重复初始化；
- 多次执行同一个专家团流程时，产物目录和会话目录语义混在一起，存在互相看到文件的风险；
- 会话数量增加后，稳定运行目录和全局项目下的会话列表查询需要排序和扫描更多数据；
- 部署脚本的健康检查、配置扫描和日志管理不够可靠；
- 前端模型首选项和模型弹窗使用了不同规则，可能出现当前模型可显示但弹窗不可选的情况。

本次优化的目标是：

1. 让新对话导航先完成，目录准备不阻塞首屏；
2. 让同一个服务使用一个稳定 runtime，避免每个会话重复冷启动；
3. 让每个会话拥有唯一 artifact 目录，保证同专家团并发执行时产物不串；
4. 保留旧会话兼容性，并在失败后可以重试；
5. 降低会话列表、部署健康检查和长期运行的额外开销。

## 2. 核心架构：稳定 runtime + 独立 artifact

### 2.1 目录分层

当前协议会把 `Session.directory` 持久化，并在后续请求中优先使用它进行路由。它不是一个可以随意替换成产物目录的普通参数，因此采用两层目录：

```text
稳定 runtime
└── runs/
    ├── 2026-08-20-10-20-30-<uuid-a>/   # 会话 A 的 artifact
    ├── 2026-08-20-10-20-31-<uuid-b>/   # 会话 B 的 artifact
    └── ...
```

数据关系如下：

| 数据 | 用途 | 生命周期 |
| --- | --- | --- |
| `runtime` | Instance、配置、插件、Agent、Provider、MCP 等共享运行上下文 | 服务/工作区级 |
| `Session.directory` | 后端协议和 Instance 路由目录 | 固定指向 runtime |
| `Session.metadata.cmccArtifactDirectory` | 当前会话的文件、报告和下载产物目录 | 会话级 |
| `DraftTab.artifactDirectory` | 首次提交前保存 artifact 目录 | 草稿级 |

部署环境优先使用服务端 `path.directory`，也就是部署脚本配置的 `WorkingDirectory`（默认 `/srv/opencode/workspaces`）；本地开发在没有该路径时回退到 `~/Documents/DeepInsight`。实现位于 `packages/app-cmcc/src/utils/cmcc-workspace.ts`。

### 2.2 为什么不能把 InstanceStore key 直接改成 runtime

`InstanceStore`、`InstanceState`、Plugin、Config、LSP、权限和文件边界都把 `ctx.directory` 当作完整运行上下文。`Session.create` 还会把该目录写入 session，后续 workspace routing 会优先使用持久化的 session directory。

因此不能只修改缓存 key，把一个 session 的 `ctx.directory` 偷换成另一个 runtime；这会造成首个会话上下文、文件边界和插件状态被其他会话复用。正确做法是：

- runtime 用于共享 Instance；
- artifact 用 metadata 和系统约束表达会话级文件范围；
- 后续如需强隔离，再为工具执行上下文增加真正的 working-directory/lease 机制。

## 3. 前端创建链路优化

### 3.1 创建草稿不再等待 mkdir

旧链路是：

```text
点击新对话
  → await file.createDirectory
  → await 网络往返和 Instance 冷启动
  → tabs.newDraft
  → 导航
```

现在改为：

```text
点击新对话
  → 计算 runtime 和唯一 artifact 路径
  → 立即 tabs.newDraft / 导航
  → 后台幂等 mkdir artifact
  → 首次提交前等待同一个 preparation Promise
  → session.create
```

普通入口、首页默认入口、顶部“新建”、侧栏“新建”和专家团入口都使用这条链路。涉及：

- `packages/app-cmcc/src/app.tsx`
- `packages/app-cmcc/src/pages/layout-new.tsx`
- `packages/app-cmcc/src/pages/cmcc-experts.tsx`
- `packages/app-cmcc/src/context/tabs.tsx`

### 3.2 幂等目录准备只做并发去重

`cmccEnsureWorkspace` 使用 `(server scope, directory)` 作为 key：

- 同一时刻多个调用共享一个 Promise，避免双击或多个入口重复 mkdir；
- 成功后删除 entry；
- 失败后也删除 entry，后续可以重试；
- 不把 artifact 目录写入 remembered conversation workspace。

这与 WorkBuddy 的“先创建轻量目录、内容按需写入”思路一致。永久缓存成功 Promise 会在服务重启、卷切换或目录被删除后造成不可恢复的假成功，因此已经移除。

### 3.3 提交 barrier、失败恢复和双击保护

首次提交时：

1. 从 DraftTab 或 session metadata 解析 artifact 目录；
2. 等待 `cmccEnsureWorkspace`；
3. 成功后再调用 `session.create`；
4. 创建失败时清除创建锁并保留输入，下一次可以重试；
5. 同一个草稿在 session 创建期间忽略重复提交。

首次创建的 metadata 写入：

```ts
{ cmccArtifactDirectory: "/srv/opencode/workspaces/runs/<timestamp>-<uuid>" }
```

follow-up 会从 session metadata 恢复同一个目录，避免只在首条消息中设置工作目录。

### 3.4 runtime 后台预热

新 App 首屏 ready 后，后台对稳定 runtime 发起一次 `app.agents({ directory: runtime })`：

- 预热不阻塞首屏绘制和导航；
- 同 scope/runtime 只允许一个 in-flight 请求；
- Promise 完成后释放去重 entry；
- 服务重新连接后允许再次预热。

这会把 Agent/Skill discovery 的首访成本提前到用户点击新对话之前。Provider、Path、Project 等全局 bootstrap 也会复用部署 WorkingDirectory 对应的实例。

## 4. 会话级文件隔离

### 4.1 metadata 校验

`cmccArtifactDirectory` 对 metadata 做以下校验：

- metadata 必须是对象；
- 字段必须是绝对路径；
- 统一 POSIX/Windows 分隔符；
- 禁止 `.`、`..` 和 NUL 字符；
- 指定 runtime 时，artifact 必须是 `runtime/runs/<child>` 的严格子目录；
- runtime 根本身、兄弟目录和跨 runtime 路径都会被拒绝。

### 4.2 系统约束

首次 prompt 和每次 follow-up 都附加 `cmccArtifactSystemPrompt`，要求：

- 文件工具使用 artifact 目录内的绝对路径；
- shell 的 workdir 指向 artifact 目录；
- 新建、修改、下载和生成文件限制在该目录；
- 子 agent 继承同一目录边界；
- 不读取或覆盖 `runs` 下其他会话目录。

这层是 Agent 行为约束，不是操作系统级安全边界。真正的强隔离仍需要后端将 artifact working directory 注入 read/write/edit/shell/glob/grep/LSP 等工具执行上下文。

### 4.3 产物面板隔离

旧扫描逻辑每次都会扫描空根目录 `""`，共享 runtime 后会看到兄弟会话文件，并且随着产物累积变慢。现在：

- session 有合法 artifact metadata 时，只扫描该 artifact root；
- diff、patch、write、edit、apply_patch 的路径都必须落在该 root；
- 绝对路径会先转为 runtime-relative，再做 root 校验；
- 不带 metadata 的旧 session 继续按 legacy cwd 兼容；
- 文件树默认从 artifact root 开始。

相关实现：

- `packages/app-cmcc/src/utils/cmcc-artifact-paths.ts`
- `packages/app-cmcc/src/pages/session/session-side-panel.tsx`

### 4.4 并发执行语义

多个相同专家团流程可以共享同一个 runtime Instance，但每个 session 使用唯一 artifact 目录：

```text
session A → runtime + runs/<uuid-a>
session B → runtime + runs/<uuid-b>
```

只要专家流程遵守 artifact 系统约束，两个流程的同名报告不会互相覆盖。共享 runtime 的配置、Agent 和 Provider 状态是有意设计；产物和工作目录是会话级隔离。

## 5. 后端创建目录优化与故障修复

### 5.1 轻量 createDirectory endpoint

`file.createDirectory` 本质只需要路径校验和 `mkdir -p`，以前却经过 `InstanceContextMiddleware`，导致一次 mkdir 也会加载完整 Instance。

现在该 endpoint 从 `InstanceContextMiddleware` 的端点集合中移出，仅保留：

- Workspace routing；
- Authorization；
- 目录边界校验。

其余 file endpoint 仍然保留 InstanceContext。这样目录创建不再触发 Config、Plugin、Agent、MCP、LSP 等冷启动。

### 5.2 编码边界修复

SDK 的 directory client 会把 `x-opencode-directory` header 做 `encodeURIComponent`。普通 Instance middleware 原本负责 decode；轻量 endpoint 移除该 middleware 后，编码路径会被误当成真实目录，返回 400，前端于是不会继续执行 `session.create`。

`createDirectory` handler 现在对 routed directory 做一次安全 decode，并增加编码 header 的真实 HTTP 测试。这个修复是“新对话创建失败”的确定性根因修复。

### 5.3 目录安全边界

允许：

- legacy `~/Documents/DeepInsight` 及其子目录；
- 服务当前 runtime 的严格子目录，例如 `runtime/runs/<id>`。

拒绝：

- runtime 根本身；
- runtime 外部路径和兄弟目录；
- `..` 穿越；
- 伪造其他 route 根；
- 服务 cwd 无法确定时的任意根路径。

## 6. Instance、缓存和生命周期设计

### 6.1 同目录并发加载

现有 `InstanceStore` 已通过 Deferred 对同目录并发 boot 去重，因此稳定 runtime 后不需要额外的前端或后端全局锁。

### 6.2 为什么本轮不直接加 TTL/LRU

前端 child store 的淘汰只清理前端 query/sdk cache，后端 InstanceStore 和 InstanceState 原本可能长期保留。简单 TTL/LRU 存在风险：`prompt_async` 返回后 fiber 仍可能在后台执行，按 HTTP 空闲时间回收会中断活跃专家流程。

本轮通过稳定 runtime 从源头减少唯一目录数量；后续如果要回收实例，应增加：

1. session/run busy 状态判断；
2. lease/refcount；
3. 明确的 `dispose` 生命周期和事件监听器清理；
4. 只在无活跃执行、无 pinned session 时回收。

## 7. 会话列表数据库优化

CMCC 的非 Git 目录通常归入 global project。会话列表常按 project、directory、root session 和更新时间过滤排序，原先只有 `session_project_idx(project_id)`，数据量增大后需要临时排序。

新增并迁移：

- `session_project_directory_parent_updated_idx(project_id, directory, parent_id, time_updated)`；
- `session_directory_parent_updated_id_idx(directory, parent_id, time_updated, id)`。

变更位置：

- `packages/core/src/session/sql.ts`
- `packages/core/src/database/migration/20260819094512_session-list-indexes.ts`
- 自动生成的 `schema.json`、`schema.gen.ts`、`migration.gen.ts`

测试通过 `EXPLAIN QUERY PLAN` 验证两个常用查询命中新索引，并避免临时排序。

## 8. 部署与运行时可靠性

### 8.1 配置来源

部署包把 `script/deploy/opencode-cmcc.jsonc` 复制为发布目录的 `.opencode/opencode.jsonc`，systemd 使用：

```text
OPENCODE_CONFIG_DIR=/opt/opencode-cmcc/current/.opencode
```

因此服务器实际模型和专家配置以发布包为准，不是服务用户的默认配置目录。新增模型后需要更新生产配置并重新部署。

### 8.2 重复扫描和启动

- 移除与 `OPENCODE_CONFIG_DIR` 同路径的 `OPENCODE_BUNDLED_CONFIG_DIR`，避免专家和配置被重复扫描；
- `systemctl enable` 与 `systemctl restart` 分开，避免首次部署 `enable --now` 后再次 restart 造成双启动；
- 部署包生成 `health-auth`，健康检查使用 Basic Auth 访问 `/global/health`；
- 使用 `curl --fail`，401/5xx 不再被误判为 ready；
- 健康检查失败时输出 systemd status 和 journal；
- 增加 14 天、单文件 20 MB、压缩和 `copytruncate` 日志轮转；
- installer 支持 source，以便在不执行安装动作的情况下测试 renderer/health 函数。

### 8.3 UI 反向代理兼容

CMCC 专家 iframe 的 CSP `frame-src` 端口同步为 8082，并更新对应 HTTP API 测试。

## 9. 模型白名单策略

CMCC 现在采用严格的硬编码模型白名单：

- `glm-5.2`；
- `CMCC_DEFAULT_MODEL_IDS` 中的 Qwen、Kimi、DeepSeek 模型。

白名单在 `packages/app-cmcc/src/context/model-defaults.ts` 中集中定义：

- 模型选择弹窗只展示白名单；
- session、Agent、全局配置或最近使用模型如果不在白名单，会被跳过；
- 首页默认回退只从当前已连接 Provider 的白名单模型中选择；
- 白名单当前模型即使被历史可见性设置隐藏，也仍可显示。

这样可以保证首页默认模型和点击后的模型列表始终遵守同一规则。

## 10. 旧数据和兼容策略

- 旧的按时间戳命名的 DeepInsight 会话目录继续识别；
- 没有 `cmccArtifactDirectory` metadata 的旧 session 使用原有 cwd/产物兼容路径；
- 不自动迁移旧 draft 的 directory，避免附件和上下文语义被改变；
- 默认首页只自动复用 `directory === stable runtime` 的 draft，旧目录需要用户显式打开；
- artifact 目录不写入 remembered workspace，避免每个 artifact 重新触发 Instance bootstrap；
- 同秒创建使用 UUID，避免双击和并发冲突。

## 11. 验证结果

本轮已执行：

- `packages/app-cmcc`: `bun run test:unit`，535 pass / 0 fail；
- `packages/app-cmcc`: `bun typecheck` 通过；
- CMCC 模型选择专项测试通过；
- `packages/opencode`: createDirectory 编码 header 专项测试通过，类型检查通过；
- `packages/core`: 数据库迁移测试 15 pass / 0 fail；
- `packages/core`: `bun run migration --check` 通过；
- 部署脚本 `bash -n` 和 installer 测试通过；
- 全部改动 `git diff --check` 通过。

本轮没有重启本地或部署服务。生产环境需要重新构建发布包、执行数据库迁移并重启 systemd 服务后，前后端改动才会全部生效。

## 12. 后续建议

1. 在生产环境重新部署后记录首屏到 draft 导航、首次 prompt、session.create 和专家首个 tool call 的耗时；
2. 对 1、10、50 个并发专家团流程验证 artifact 目录是否完全分离；
3. 如果需要真正安全隔离，将 artifact working directory 从系统提示升级为后端工具执行上下文；
4. 为 Instance 增加 lease/refcount 和 active prompt 判断后，再实施安全的 idle dispose；
5. 将 provider/path/project 的 global endpoint 与 runtime bootstrap 进一步拆分，减少首页全局请求；
6. 部署配置继续以 `script/deploy/opencode-cmcc.jsonc` 作为唯一生产模型配置源，避免本地配置与发布配置漂移。
