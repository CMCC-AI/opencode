/// <reference path="../env.d.ts" />
import { tool } from "@opencode-ai/plugin"
import { runFreeMarketData } from "../stock/free-data"

export default tool({
  description: `检查 BaoStock、AKShare 与腾讯自选股 westock 免费 A 股数据能力。用户询问免费数据源、数据权限、数据源是否可用或数据口径时使用。

BaoStock 是历史成分股、点时 EPS、行情、交易日历和基准数据的主数据源；AKShare 用于行情降级和当前数据补充；westock 用腾讯自选股 BasicEPS 对因子结果做独立交叉校验，但因不提供公告日而不参与历史信号。三者都不需要用户 API Key。`,
  args: {},
  async execute(_args, context) {
    return runFreeMarketData(["health"], context.abort)
  },
})
