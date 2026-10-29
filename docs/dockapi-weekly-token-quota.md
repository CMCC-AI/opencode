# DockAPI 周 Token 额度接入

## 配置

OpenCode 的额度开关默认关闭。启用时显式设置：

```text
OPENCODE_DOCKAPI_QUOTA_ENABLED=true
OPENCODE_DOCKAPI_URL=<DockAPI 内网根地址，不含 /api>
DOCKAPI_QUOTA_SERVICE_TOKEN=<与 DockAPI 相同的不少于 32 字符的随机服务密钥>
```

错误的开关值、缺少地址或密钥会报错，不能静默变成无限额度。以上变量不要放在 VITE_* 中，不能暴露给浏览器。旧 research-quota-demo 的 OPENCODE_TOKEN_QUOTA 配置不是本实现的配置入口。

DockAPI 的数据库迁移、周额度 SQL、VIP 切换和内部 API 以 dockapi-service/docs/token-quota.md 为准。模型 API Key 仍由原有 Provider 配置管理。

## 一键部署

首次部署前，在仓库根目录的 Git Bash 中准备私有配置：

```bash
mkdir -p .deploy
cp script/deploy/quota.env.example .deploy/quota.env
chmod 600 .deploy/quota.env
```

编辑 `.deploy/quota.env`（UTF-8 无 BOM、LF 换行），把 `DOCKAPI_QUOTA_SERVICE_TOKEN` 填成与 DockAPI 相同的真实随机密钥，再执行原来的命令：

```bash
bash deploy_to_server.sh
```

模板默认启用额度，但密钥留空；未填写、少于 32 字符或含空白/非 ASCII 字符时部署会明确报错。推荐使用 `openssl rand -hex 32` 生成一次，然后在 DockAPI 和 OpenCode 两边配置相同值，不要分别生成。

- `OPENCODE_DOCKAPI_URL` 填 DockAPI 内网根地址，不含 `/api`。模板中的 `http://127.0.0.1:8081` 仅适用于同机、非跨容器部署；不要填公网 Nginx 的 `:3002` 入口。
- `.deploy/` 已被 Git 忽略。真实配置不进入 Git、前端、编译环境或发布压缩包；通过 SSH 标准输入单独传输，不写入 SSH 命令参数，也不输出密钥。
- 可以用 `OPENCODE_QUOTA_ENV_FILE=/path/to/private/quota.env bash deploy_to_server.sh` 指定仓库外的配置文件，方便多个部署 worktree 共用。指定文件不存在时直接失败，不默默忽略。
- 也支持现有的三个环境变量；显式环境变量优先于配置文件，未覆盖的字段继续读取文件。只提供地址或密钥、未明确开关时会报错。
- 不提供本地文件且三个变量都未设置时，沿用服务器配置；新服务器没有任何旧配置时保持关闭，并在安装日志中明确显示，绝不会凭空生成密钥或启用配额。

安装脚本把额度配置保存到服务器的 `/etc/opencode-cmcc/quota.env`，由 systemd 在普通 `opencode.env` 之后读取，文件归属 root、权限 `0600`。普通代码部署保留额度设置；原先写在 `opencode.env` 中的三个额度变量会先迁移到独立文件，再更新普通环境文件。非法的新配置或旧配置会在切换版本、覆盖配置、操作服务前被拒绝。systemd 必须能读到独立文件；已经使用独立文件的服务器若丢失该文件，重新部署也会报错，需恢复旧文件或明确提供新配置，不会悄悄关闭限额。

生成文件的双引号转义遵循 [systemd EnvironmentFile 的格式](https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html#EnvironmentFile=)，同时支持由 Bash 重新读取。

`DEPLOY_BUILD_ONLY=1` 生成的离线包也不含密钥。离线首次安装需另外准备受信任的私有 Bash env 文件：

```bash
sudo bash /path/to/release/install-single-server.sh /path/to/release ubuntu /path/to/private/quota.env
```

后续离线安装可不传最后一个参数，沿用服务器配置。配置文件会作为管理员控制的 Bash env 文件读取，不要使用来自不可信来源的文件。启用或更换密钥前应停止新任务、等待已有任务及结算完成，并协调 DockAPI 两侧配置；不要单侧切换开关。

此脚本只负责 OpenCode 部署，不会自动迁移 DockAPI 数据库、填写周额度或修改 Nginx。启用前仍需先完成 DockAPI 配置和启动，并确认已使用 `script/deploy/nginx-dockapi.conf` 的内部接口限制。DockAPI 开关也应显式配置；当前 `token-quota.properties` 的缺省值是 `true`，不要仅根据旧文档的“默认关闭”判断其状态。

### 部署脚本测试

```bash
cd script/deploy
bash quota-env.test.sh
bash install-single-server.test.sh
node --test deploy-quota.test.mjs
```

Windows 下可用 `BASH_EXECUTABLE` 指定 Git Bash 的 `bash.exe`。部署集成测试使用临时目录、模拟 SSH/rsync/SCP 和模拟二进制，覆盖整包、增量、离线打包、配置保留及非法配置拦截，不连接真实服务器，不启动或重启任何服务。

2026-10-29 本地验证：41 项配置检查、原安装脚本测试、5 项模拟部署测试及 Bash/JavaScript 语法检查通过。Windows 下跳过 POSIX 文件权限断言；未在实际 Linux systemd 中启动服务，未执行真实部署、数据库迁移或模型调用。

## 执行链

1. app-cmcc SDK 转发当前 DockAPI 登录凭证，仅限选定 OpenCode 服务源；401 时沿用登录刷新流程。外部身份头和内部服务头会被去除。
2. OpenCode 创建会话、续问及相关模型入口核验登录身份，根会话绑定用户，子会话继承。DockAPI 内部创建使用服务密钥认证的用户 ID。旧业务会话通过内部 owner 接口核对，不认领归属不明的会话。
3. 每轮模型调用预占输入估算和本次最大输出，获批后按批准上限执行。传统 AI SDK、原生执行、新 Session runner 及其压缩调用均接入。
4. Token usage 以供应商总量优先，推理 Token 不重复加总。未得到 usage 的已发送调用保持 unknown，不按零消耗退款。
5. 结算先保存本地 outbox 再提交。后台每 30 秒补报待提交结算，并核对超过五分钟没有更新的遗留调用；只补报额度，不重放模型请求。模型 SDK 内部隐式重试在受控调用中关闭，外层正常重试需要重新申请一次额度。

本地 SQLite 新表只有身份绑定和可靠补报状态，不维护额度余额或个人策略；无会话级联删除。输入 Token 仍属估算，不能承诺供应商费用严格零超额。

## 用户界面与 LangGraph

设置中 Token 额度页显示本周已消耗、预占、余额与北京时间重置时间，VIP 显示不限额。额度变动通过刷新或下一次申请获取，不长期缓存。

LangGraph Python 无改动。前端只在启动/继续/AI 润色前读取余额，查询失败不发起执行。已开始的执行段允许超额完成，由 DockAPI 代理记入共享账本；AI 润色没有已确认 usage，第一版不估算扣费。未知用量明确提示，不恢复旧的顶部状态横幅。

## 部署与回滚

先完成 DockAPI 迁移与额度设置，待旧任务结束，再协调启用 OpenCode 和前端。使用更新后的 Nginx 配置，禁止公网调用内部额度 API，同时隔离实际后端端口。不要只关闭单侧开关；停收新任务、核对 outbox 和未结算流水后才能协调回滚，保留所有账目。

## 本地验收（2026-10-22）

- 核心额度、SQLite 迁移、Session runner 和压缩回归：107 项通过；前端额度与身份转发：6 项通过；跨域预检：1 项通过。
- 浏览器额度、计划确认、继续研究及章节润色：14 项通过；1440/390 像素额度页已截图检查。
- core、opencode、server、app-cmcc 类型检查及前端生产构建通过。构建保留原有 sourcemap/大 chunk 警告。
- 交互抽样：主页附件菜单 64.8ms → 62.6ms，会话菜单 64.1ms → 64.3ms；尺寸一致。单次抽样用于回归观察，不代表性能统计结论。
- 数据库生成脚本在 Windows 的路径分隔符问题使用临时运行适配完成生成和一致性检查，未修改原生成器。
- 未执行实际业务库迁移，未使用真实模型计费，未提交、推送或部署。上线前须完成目标 MySQL 的迁移及联调。
