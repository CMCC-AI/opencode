# APP-CMCC 用户 Token 配额

## 绑定与隔离

APP-CMCC 的模型 API Key 仍由服务端统一保管，浏览器和普通用户不会获得 Key。登录网关在认证成功后向 OpenCode 注入稳定且不可复用的用户主键，默认请求头为 `x-opencode-user-id`。OpenCode 将该用户主键写入 `token_quota_session`，一个 Session 只能绑定一个用户；子 Session 会继承父 Session 的绑定。

登录网关必须删除客户端传入的同名请求头，再写入认证结果，并禁止用户绕过网关访问 OpenCode 端口。不要使用昵称、手机号或可修改邮箱作为主键，应使用登录系统内部不可变的用户 ID。

每次 Provider 调用会生成一条 `token_quota_usage` 流水，绑定：

- `user_id`：登录系统用户主键；
- `session_id`、`request_id`：会话与触发本次 Provider turn 的用户消息；
- `provider_id`、`model_id`：实际调用的模型；
- `api_key_hash`：服务端凭据的 SHA-256 截断指纹，只用于区分 Key，绝不保存明文；
- 预占值、最终 Token 明细、状态与时间。

这样即使多个用户共享同一批 Key，额度、审计和并发预占仍按用户隔离，Key 维度也可以独立汇总排障。

## 计量口径

调用开始前按约每 4 个字符 1 Token 估算输入，只用于单次上限和并发预占。最终扣减以 Provider 在流结束事件中返回的权威 usage 为准：

`total = non-cached input + cache read + cache write + output`

其中 `output` 使用 Provider 的输出总量，已包含其报告的 reasoning Token，因此 reasoning 只作为明细保存，不再次相加。Provider 提供 `totalTokens` 时优先采用该值。失败且没有 usage 的调用释放预占；已经返回 usage 的中断调用仍按实际用量结算。

日额度按 UTC 自然日统计，月额度按 UTC 自然月统计。`reserved` 流水与 `settled` 流水都参与准入判断，防止同一用户并发请求同时穿透限额。

## 配置

启动服务前设置 `OPENCODE_TOKEN_QUOTA`：

```json
{
  "enabled": true,
  "identityHeader": "x-opencode-user-id",
  "dailyTokens": 1000000,
  "monthlyTokens": 20000000,
  "requestTokens": 200000,
  "reservationTokens": 8192,
  "overage": "reject"
}
```

- `dailyTokens`、`monthlyTokens`：缺省表示不限制对应周期；
- `requestTokens`：输入估算与最大输出之和的单次硬上限；
- `reservationTokens`：调用期间在输入估算之外预占的输出预算，默认 8192；
- `overage: "reject"`：额度不足时不调用 Provider；
- `overage: "allow_and_audit"`：继续调用并记录超额，适合灰度观察或白名单用户。

单用户覆盖策略写入 `token_quota_policy`。字段为 `daily_limit`、`monthly_limit`、`request_limit`、`overage`；`NULL` 表示继承全局配置。例如：

```sql
INSERT INTO token_quota_policy
  (user_id, daily_limit, monthly_limit, request_limit, overage, time_created, time_updated)
VALUES
  ('user-123', 2000000, 40000000, 250000, 'reject', unixepoch() * 1000, unixepoch() * 1000)
ON CONFLICT(user_id) DO UPDATE SET
  daily_limit = excluded.daily_limit,
  monthly_limit = excluded.monthly_limit,
  request_limit = excluded.request_limit,
  overage = excluded.overage,
  time_updated = excluded.time_updated;
```

## 登录系统改造点

1. 认证网关校验现有登录态后注入不可变用户 ID，并覆盖外部同名 Header。
2. OpenCode 服务端口仅对网关或内网开放。
3. 新 Session 在创建时绑定用户；历史 Session 在首次经过已认证的模型请求时绑定，冲突会被拒绝。
4. 管理后台维护 `token_quota_policy`，用量页面从 `token_quota_usage` 按用户与周期聚合。
5. 前端收到配额错误时停止自动重试，并展示日/月重置时间；`allow_and_audit` 用户只记录告警。

## 数据存储与部署

迁移会创建 `token_quota_policy`、`token_quota_session`、`token_quota_usage` 三张 SQLite 表，Session 删除时相关绑定与流水级联删除。建议生产环境定期把结算流水归档到数仓，但保留周期内数据以便准入计算和审计。

当前 APP-CMCC 单实例部署通过进程内用户锁加 SQLite 事务避免并发穿透。若同一数据库前部署多个 OpenCode 进程，应将预占/结算改为 Redis Lua 或 PostgreSQL 行锁事务，并继续把最终流水落库；仅使用进程内锁不能提供跨进程强一致额度。
