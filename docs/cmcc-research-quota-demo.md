# APP-CMCC 科研限额演示版

## 分支与开关

演示实现位于独立分支 `research-quota-demo`，不会改变 `dev` 或当前主线分支。该分支默认开启科研演示模式；如需在同一代码上对照完整界面，可在构建前设置：

```bash
VITE_CMCC_RESEARCH_DEMO=false
```

## 保留与隐藏范围

演示模式只保留以下用户入口：

- 主会话（新对话和普通历史会话）；
- `AI for Science 科研专家团`；
- `DeepXiv 前沿论文`；
- 登录用户的设置、退出登录和必要的会话删除能力。

以下内容从导航、专家中心、输入框扩展菜单和历史列表中隐藏：

- 深度研究、财经、购买决策、巡查、政企、位置等其他专家团；
- AI Wiki、DeepTrack、DeepLens、案例库、MStock、插件中心；
- 专业数据库、技能和知识库快捷入口；
- 其他专家团产生的旧历史任务。

隐藏采用两层逻辑：

1. `CMCC_EXPERTS` 只暴露科研专家团，专家中心和 `/expert/:id` 因此不能打开其他专家；完整专家表仍保留给内部会话识别，避免旧专家会话被误判为普通主会话。
2. 隐藏功能的直达路由统一跳回 `/app`。这不只是隐藏菜单，用户手工输入旧 URL 也不会进入被裁剪页面。

该逻辑是产品演示裁剪，不代替服务端授权。生产环境仍应在网关和 OpenCode 服务端限制可调用 Agent。

## 注册用户与 Token 限额

注册用户登录后，认证网关必须验证 DockAPI 登录态，将不可变的内部用户 ID 注入 `x-opencode-user-id`，并删除浏览器自行提交的同名 Header。OpenCode 端口只能由可信网关访问。

演示环境可使用以下统一默认额度：

```bash
OPENCODE_TOKEN_QUOTA='{"enabled":true,"identityHeader":"x-opencode-user-id","authorizationHeader":"x-dockapi-authorization","identityUrl":"http://127.0.0.1:8081","dailyTokens":200000,"monthlyTokens":3000000,"requestTokens":100000,"reservationTokens":8192,"overage":"reject"}'
```

不需要为每个新注册用户预先创建策略记录：没有个人策略的用户自动继承上述全局额度。需要单独调整时，再向 `token_quota_policy` 写入该用户覆盖值。

限额在 Provider 调用前生效：

- Session 首次提交请求时绑定当前登录用户，之后不能被另一用户接管；子 Session 继承父 Session 用户；
- 每次模型调用先按估算输入和输出预算预占额度，并发请求也会计入，避免额度穿透；
- 调用结束后以模型供应商返回的实际 usage 结算，统计输入、缓存读写和输出 Token；
- 日额度按 UTC 自然日、月额度按 UTC 自然月累计；
- 当日额度、月额度或单次额度不足时，`overage: "reject"` 会在调用 API Key 之前拒绝请求，因此科研专家团和主会话都无法继续消耗后台 Key；额度重置或管理员提高个人策略后恢复。

DeepXiv 如果只展示和检索论文，不经过 OpenCode Provider，则不会消耗模型额度；若 DeepXiv 自身调用模型，需要让它接入同一配额服务或经 OpenCode 发起调用，才能纳入同一用户账本。

## 改动范围

- `packages/app-cmcc/src/utils/research-demo.ts`：演示开关与科研专家标识；
- `packages/app-cmcc/src/utils/cmcc-experts.ts`：完整专家表与可见专家表隔离；
- `packages/app-cmcc/src/pages/cmcc-experts.tsx`：科研专家中心文案和唯一专家入口；
- `packages/app-cmcc/src/pages/layout-new.tsx`：导航、历史会话、帮助和案例入口裁剪；
- `packages/app-cmcc/src/components/prompt-input.tsx`：只保留附件与科研专家入口；
- `packages/app-cmcc/src/app.tsx`：隐藏功能的直达路由保护；
- `packages/core/src/token-quota`、`packages/opencode/src/token-quota`：策略、绑定、流水和准入结算；
- `packages/opencode/src/session/llm.ts`：模型调用前预占、结束后按实际 usage 结算；
- `packages/opencode/src/server/routes/instance/httpapi/handlers/session.ts`：登录用户与 Session 绑定。

更完整的计量口径、表结构和个人策略 SQL 见 `docs/cmcc-token-quota.md`。
