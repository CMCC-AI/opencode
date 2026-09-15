/// <reference path="../env.d.ts" />
import { tool } from "@opencode-ai/plugin"
import { assessBacktest, runSmaCrossBacktest, runSmaSensitivity } from "../stock/backtest"
import { fetchBars } from "../stock/providers"
import { fetchFreeBars } from "../stock/free-data"

export default tool({
  description: `对单只股票运行可复现的双均线多头策略回测。A 股默认使用免费的 BaoStock，也可使用 AKShare 或 westock 腾讯行情；用户要求回测、比较均线参数、计算策略收益或交易记录时使用。

信号在收盘后产生并于下一交易日开盘成交，支持配置手续费、最低佣金、卖出印花税、滑点和交易单位。默认费用只是研究假设，回答时必须明确披露。`,
  args: {
    provider: tool.schema
      .enum(["baostock", "akshare", "westock", "tushare", "alpha_vantage"])
      .describe("行情数据源；A 股默认使用免费的 baostock")
      .default("baostock"),
    symbol: tool.schema.string().describe("股票代码，例如 000001.SZ、600519.SH 或 AAPL"),
    start_date: tool.schema.string().describe("开始日期，格式 YYYY-MM-DD"),
    end_date: tool.schema.string().describe("结束日期，格式 YYYY-MM-DD"),
    fast_window: tool.schema.number().int().min(2).describe("短期均线窗口").default(20),
    slow_window: tool.schema.number().int().min(3).describe("长期均线窗口").default(60),
    initial_cash: tool.schema.number().positive().describe("初始资金").default(100000),
    commission_rate: tool.schema.number().min(0).describe("单边佣金率，例如 0.0003").default(0.0003),
    minimum_commission: tool.schema.number().min(0).describe("每笔最低佣金").default(5),
    stamp_duty_rate: tool.schema.number().min(0).describe("卖出印花税率；请按回测时期核对").default(0.0005),
    slippage_bps: tool.schema.number().min(0).describe("单边滑点，单位基点").default(5),
    lot_size: tool.schema.number().int().positive().describe("最小交易单位；A 股通常填 100，美股填 1").default(100),
  },
  async execute(args, context) {
    const provider = args.provider ?? "baostock"
    const fastWindow = args.fast_window ?? 20
    const slowWindow = args.slow_window ?? 60
    if (fastWindow >= slowWindow) throw new Error("fast_window 必须小于 slow_window")
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
    const config = {
      fastWindow,
      slowWindow,
      initialCash: args.initial_cash ?? 100000,
      commissionRate: args.commission_rate ?? 0.0003,
      minimumCommission: args.minimum_commission ?? 5,
      stampDutyRate: args.stamp_duty_rate ?? 0.0005,
      slippageBps: args.slippage_bps ?? 5,
      lotSize: args.lot_size ?? 100,
    }
    const result = runSmaCrossBacktest(series.bars, config)
    const sensitivity = runSmaSensitivity(series.bars, config)
    return JSON.stringify(
      {
        data: { provider: series.provider, symbol: series.symbol, adjustment: series.adjustment },
        result,
        evaluation: assessBacktest(result, sensitivity),
        sensitivity,
        disclaimer: "历史回测不代表未来表现，本结果不构成投资建议。",
      },
      null,
      2,
    )
  },
})
