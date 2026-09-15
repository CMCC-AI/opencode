/// <reference path="../env.d.ts" />
import { tool } from "@opencode-ai/plugin"
import { analyzeBars } from "../stock/metrics"
import { fetchBars } from "../stock/providers"
import { fetchFreeBars } from "../stock/free-data"

export default tool({
  description: `获取股票历史行情并执行可复现的技术分析。用户询问股票走势、波动、均线、RSI、回撤或区间表现时使用。

支持 baostock、akshare、westock（A 股，免费免密）、tushare（A 股，需要权限）和 alpha_vantage（美股/全球原型，需要 API Key）。
所有输出都包含数据源、复权方式和截止日期。不要把结果描述为投资建议。`,
  args: {
    provider: tool.schema
      .enum(["baostock", "akshare", "westock", "tushare", "alpha_vantage"])
      .describe("行情数据源；A 股默认使用免费的 baostock")
      .default("baostock"),
    symbol: tool.schema.string().describe("股票代码，例如 000001.SZ、600519.SH 或 AAPL"),
    start_date: tool.schema.string().describe("开始日期，格式 YYYY-MM-DD"),
    end_date: tool.schema.string().describe("结束日期，格式 YYYY-MM-DD"),
  },
  async execute(args, context) {
    const provider = args.provider ?? "baostock"
    const series =
      provider === "baostock" || provider === "akshare" || provider === "westock"
        ? {
            provider,
            symbol: args.symbol,
            adjustment: "qfq" as const,
            bars: await fetchFreeBars({
              provider,
              symbol: args.symbol,
              startDate: args.start_date,
              endDate: args.end_date,
              signal: context.abort,
            }),
          }
        : await fetchBars({ provider, symbol: args.symbol, startDate: args.start_date, endDate: args.end_date })
    return JSON.stringify(
      {
        data: {
          provider: series.provider,
          symbol: series.symbol,
          adjustment: series.adjustment,
          start: series.bars[0]!.date,
          end: series.bars.at(-1)!.date,
        },
        analysis: analyzeBars(series.bars),
        recentBars: series.bars.slice(-10),
        disclaimer: "结果仅用于研究与回测，不构成投资建议。",
      },
      null,
      2,
    )
  },
})
