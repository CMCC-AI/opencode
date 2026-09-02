# DeepXiv iframe 统一登录

iframe 使用现有 `VITE_DEEPXIV_URL`（默认同主机3100端口），认证仍由 `VITE_DOCKAPI_URL` 指定的 DockAPI 提供。无需在前端配置任何 SSO 服务密钥，也不要传递 access/refresh token 到 iframe。

DeepLiterature 部署需要设置：

- `DEEPLIT_AUTH_MODE=dockapi`
- `DEEPLIT_PUBLIC_ORIGIN`：浏览器看到的 iframe origin，与 VITE_DEEPXIV_URL 匹配。
- `DEEPLIT_PARENT_ORIGIN`：浏览器看到的 APP-CMCC origin，包含协议和非默认端口。
- `DEEPLIT_DOCKAPI_URL` 和 `DEEPLIT_SSO_CLIENT_SECRET`：仅服务端使用。

部署新版 DockAPI（sid主会话及SSO接口）、执行 DeepLiterature 的010迁移后再启用。旧 DockAPI JWT 会要求重新登录。完整说明位于 DeepLiterature 仓库 `docs/DOCKAPI_SSO.md`。

当前远程 HTTP 拓扑为：APP-CMCC `http://81.70.49.200:3002`，iframe 代理 `http://81.70.49.200:3100`，DeepLiterature 上游 `http://81.70.174.140:3000`。DeepLiterature 的服务端 `DEEPLIT_DOCKAPI_URL` 使用 `http://81.70.49.200:3002`，由既有 Nginx `/api/` 转发到 DockAPI `8081`；不要把浏览器 iframe 地址和服务端 DockAPI 地址混用。

桥接校验来源 origin、iframe window、随机 requestId。首次加载、重载和身份变化会重新握手；父应用/iframe 均通过 DockAPI 统一退出。退出请求失败会提示重试，不会假装服务端已注销。跨标签页用 storage 事件同步，HTTPS/localhost 下使用 Web Locks 串行刷新 token；生产请使用 HTTPS。

现有 deepxiv-proxy 删除 Authorization 和 auth_token 的行为保持不变。票据走 iframe 内同源 POST，不需要放宽代理或 CORS。

从本包目录运行：

```sh
bun typecheck
bun test --preload ./happydom.ts ./src/utils/deepxiv-sso.test.ts ./src/context/dockapi.test.ts
bun test ./scripts/deepxiv-proxy.test.ts
```
