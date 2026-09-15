# AlphaLab AI 策略实验室

一个与 `app-cmcc`、DeepTrading 完全独立的股票策略研究产品。它有自己的前端、服务端 API、回测页面和 AI 连续问答入口，只复用 OpenCode SDK 与仓库内的通用行情/回测内核。

## 当前闭环

- BaoStock 免费提供历史沪深300成分、点时 EPS、A 股前复权行情、交易日历和基准行情，无需 API Key。
- AKShare 免费提供 A 股行情、当前指数成分和交叉校验，无需 API Key；东方财富行情失败时自动降级到 AKShare 的腾讯行情接口，但不把网页财务接口作为历史 EPS 的唯一来源。
- 本机 westock（腾讯自选股）既可作为单标的行情源，也会用 `BasicEPS` 自算 TTM 对最近一期首选股做独立口径校验；由于财务记录缺少公告日，财务数据只校验、不参与历史信号。
- Tushare 是可选数据源，支持自动补全 `.SH` / `.SZ` / `.BJ` 后缀与前复权日线。
- 美股使用 Alpha Vantage 的复权日线。
- 双均线多头策略：收盘产生信号，下一交易日开盘成交。
- 沪深300 EPS 月度选股：使用信号日历史成分股与 `pubDate <= 信号日` 的 `epsTTM`，选前 20 只并在下一交易日开盘等权调仓。
- 每次 EPS 回测持久化自包含 `report.html` 与完整 `result.json`，AI 回复中直接提供报告入口。
- 报告内置结论摘要、净值与回撤、年度/月度收益、最新持仓、持仓频次，以及 PIT 股票池、公告日、EPS 覆盖、行情覆盖、指标公式、westock 交叉校验和可成交性限制审计。
- 可配置初始资金、佣金、最低佣金、卖出印花税、滑点和交易单位。
- 展示策略收益、年化、最大回撤、夏普、胜率、基准与超额收益、净值曲线和成交记录。
- 自动检查样本长度、交易次数、收益、超额收益、回撤与夏普，给出可行性分级和逐项证据。
- 自动运行最多 9 组相邻均线参数，检查收益、回撤和夏普是否依赖单一参数点。
- AI 问答通过 OpenCode `stock-analyst` Agent 运行，自动携带当前参数和最近一次回测摘要。
- 产品可独立打开，也可在登录后的 `app-cmcc` 中通过“AlphaLab 策略实验室”统一展示。

## 本地运行

1. 在本目录运行 `uv sync --frozen`，安装锁定的 BaoStock 与 AKShare 到隔离环境。
2. 如需 Tushare / Alpha Vantage，将 `.env.example` 复制为 `.env` 并填写相应可选密钥。
3. 如需 AI 问答，先在 `4096` 端口启动 OpenCode 服务。
4. 从仓库根目录运行：

```bash
bun run dev:stock
```

浏览器访问 `http://localhost:3010`。开发模式下，Vite 会将 `/api` 代理到 `4174` 端口的产品服务端。

同时开发 `app-cmcc` 和股票产品时，从仓库根目录运行：

```bash
bun run dev:cmcc-stock
```

登录 `app-cmcc` 后，从左侧导航进入“AlphaLab 策略实验室”。股票产品仍使用自己的前端与 API 进程，`app-cmcc` 只负责登录后的统一入口和页面承载。

生产模式：

```bash
cd packages/app-stock
bun run build
bun run start
```

此时静态页面和 API 都由 `4174` 端口提供。

## 环境变量

| 变量                                                    | 作用                                                                          |
| ------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `TUSHARE_TOKEN`                                         | A 股日线与复权因子                                                            |
| `ALPHA_VANTAGE_API_KEY`                                 | 美股复权日线                                                                  |
| `OPENCODE_SERVER_URL`                                   | OpenCode 服务地址，默认 `http://127.0.0.1:4096`                               |
| `OPENCODE_STOCK_WORKSPACE`                              | OpenCode 会话目录，默认仓库根目录                                             |
| `OPENCODE_SERVER_USERNAME` / `OPENCODE_SERVER_PASSWORD` | 可选的 Basic Auth                                                             |
| `PORT`                                                  | 产品服务端口，默认 `4174`                                                     |
| `VITE_STOCK_LAB_URL`                                    | `app-cmcc` 内嵌的股票产品地址；生产环境建议配置为受同一登录网关保护的同域地址 |

通过 `cmcc-local-dev` 使用时，`./dev.sh bootstrap` 会自动执行 `uv sync --frozen`，随后使用 `./dev.sh up` 启动即可。

生产环境不要把未经鉴权的 `app-stock` 服务直接暴露到公网。默认内嵌地址为同域 `/stock-app/`，应由现有登录网关代理到 `app-stock` 服务；也可以通过 `VITE_STOCK_LAB_URL` 指向其他受保护地址。内嵌模式会自动追加 `embed=1`。

## 数据与回测口径

- Alpha Vantage 的原始 OHLC 会按 `adjusted close / raw close` 比例统一复权，避免拆股和分红造成虚假日内波动。
- Tushare 支持 `.SH`、`.SZ`、`.BJ`，包括北交所 920 代码段。
- EPS 工具的数据缓存位于 `python/.cache/market.sqlite3`，首次构建按 BaoStock 匿名单会话分批执行，后续相同查询直接命中缓存。
- EPS 运行产物位于 `python/.artifacts/<session-id>/`，包括离线 HTML 与完整 JSON；目录默认不纳入 Git。
- AKShare 的网页型接口可能随上游站点变化；批量财报中的“最新公告日期”可能包含后续修订，因此不会替代 BaoStock 的历史 `pubDate` 做点时选股。
- 腾讯行情通过 AKShare 与本机 westock 两条入口提供；它们适合作为免费降级和交叉校验，但属于上游公开网页接口封装，不视为有稳定 SLA 的官方数据合同。
- 策略收益、基准、年化和展示区间都从第一个可执行交易日开始。
- 可行性初筛包含参数邻域盈利占比；参数变化后旧报告会明确标记为已过期。
- 整个回测区间暂时使用同一组费用参数，长周期研究需要按历史日期自行调整税费假设。

## 产品演进

1. 把策略内核抽象为统一接口，支持 RSI、动量、海龟、行业轮动和多因子选股。
2. 将当前 SQLite 请求账本升级为带内容哈希的数据快照，并评估 DuckDB + Parquet 的分析收益；不要只为换技术而迁移。
3. 增加参数网格、walk-forward、训练/验证/测试三段式评估。
4. 增加历史股票池、退市、ST、停牌、涨跌停、成交容量与分红送转规则。
5. 接入 JQData / QMT / 券商行情，用于更完整的 A 股数据和模拟交易；实盘交易必须单独做权限、审计和风控。

所有结果仅用于研究和工程验证，不构成投资建议。
