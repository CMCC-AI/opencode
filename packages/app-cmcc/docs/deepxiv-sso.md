# DeepXiv iframe 统一登录

iframe 使用现有 `VITE_DEEPXIV_URL`（默认同主机3100端口），认证仍由 `VITE_DOCKAPI_URL` 指定的 DockAPI 提供。无需在前端配置任何 SSO 服务密钥，也不要传递 access/refresh token 到 iframe。

DeepLiterature 部署需要设置：

- `DEEPLIT_AUTH_MODE=dockapi`
- `DEEPLIT_PUBLIC_ORIGIN`：浏览器看到的 iframe origin，与 VITE_DEEPXIV_URL 匹配。
- `DEEPLIT_PARENT_ORIGIN`：浏览器看到的 APP-CMCC origin，包含协议和非默认端口。
- `DEEPLIT_DOCKAPI_URL` 和 `DEEPLIT_SSO_CLIENT_SECRET`：仅服务端使用。

部署新版 DockAPI（sid主会话及SSO接口）、执行 DeepLiterature 的010迁移后再启用。旧 DockAPI JWT 会要求重新登录。完整说明位于 DeepLiterature 仓库 `docs/DOCKAPI_SSO.md`。

当前同时保留两套远程 HTTP 环境：

- 旧环境：APP-CMCC `http://81.70.49.200:3002`，iframe 代理 `http://81.70.49.200:3100`，DeepLiterature 上游 `http://81.70.174.140:3000`。
- 新环境：APP-CMCC `http://152.136.106.161:3002`，iframe 代理 `http://152.136.106.161:3100`，DeepLiterature 上游 `http://81.70.174.140:3004`。

两个 DeepLiterature Web 实例共享 PostgreSQL 和论文文件存储，但分别持有对应环境的 `DEEPLIT_DOCKAPI_URL`、`DEEPLIT_PARENT_ORIGIN`、`DEEPLIT_PUBLIC_ORIGIN` 和 `DEEPLIT_SSO_CLIENT_SECRET`。不能让同一 Web 实例复用两套 SSO 配置，否则父页面来源校验、Cookie 和客户端密钥会互相覆盖。旧环境继续使用既有 `3000` 实例，新环境固定使用独立 `3004` 实例；仓库根目录 `deploy_to_server.sh` 的生产默认值已与此拓扑一致。

DeepLiterature 的服务端 `DEEPLIT_DOCKAPI_URL` 应指向各自 APP-CMCC/DockAPI 入口；不要把浏览器 iframe 地址和服务端 DockAPI 地址混用。两套环境都应通过对应的 `3100` 同站代理加载 iframe，不要直接把浏览器指向 `81.70.174.140:3000` 或 `:3004`。

新实例的可复现模板位于 `script/deploy/deeplit-cmcc.compose.yaml`，环境变量示例位于 `script/deploy/deeplit-cmcc.env.example`。部署时从现有 DeepLiterature 生产环境复制模型和流水线配置，再替换新 DockAPI 对应的四个 SSO 变量；真实环境文件必须置于仓库外并设为 `0600`。在 DeepLiterature 主机执行：

```sh
docker compose \
  --env-file /home/ubuntu/deeplit/shared/.env.cmcc \
  -f /home/ubuntu/deeplit/shared/compose.cmcc-sso.yaml \
  up -d
```

`3004` 是 APP-CMCC 代理访问的内部上游端口，应在云安全组或主机 `DOCKER-USER` 链中仅允许 `152.136.106.161`，不应作为用户入口公开。

桥接校验来源 origin、iframe window、随机 requestId。首次加载、重载和身份变化会重新握手；父应用/iframe 均通过 DockAPI 统一退出。退出请求失败会提示重试，不会假装服务端已注销。跨标签页用 storage 事件同步，HTTPS/localhost 下使用 Web Locks 串行刷新 token；生产请使用 HTTPS。

现有 deepxiv-proxy 删除 Authorization 和 auth_token 的行为保持不变。票据走 iframe 内同源 POST，不需要放宽代理或 CORS。

从本包目录运行：

```sh
bun typecheck
bun test --preload ./happydom.ts ./src/utils/deepxiv-sso.test.ts ./src/context/dockapi.test.ts
bun test ./scripts/deepxiv-proxy.test.ts
```
