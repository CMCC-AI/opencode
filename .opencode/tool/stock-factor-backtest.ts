/// <reference path="../env.d.ts" />
import { resolve } from "node:path"
import { tool } from "@opencode-ai/plugin"
import { runFreeMarketData } from "../stock/free-data"

export default tool({
  description: `对沪深300运行基于 EPS 的多股票月度选股回测。用户要求按 EPS 排名选股、沪深300成分股轮动、月末调仓、等权组合或对应策略报告时使用。

工具使用 BaoStock 的历史沪深300成分股与 epsTTM，只使用财报 pubDate 不晚于月末信号日的数据，下一交易日开盘成交，并计入佣金、最低佣金、卖出印花税、滑点和 A 股交易单位。首次运行需要构建本地缓存，可能耗时数分钟，后续相同数据会复用缓存。`,
  args: {
    start_date: tool.schema.string().describe("回测开始日期，格式 YYYY-MM-DD"),
    end_date: tool.schema.string().describe("回测结束日期，格式 YYYY-MM-DD"),
    selection_count: tool.schema.number().int().min(1).max(100).describe("每月选择 EPS 最高的股票数量").default(20),
    initial_cash: tool.schema.number().positive().describe("初始资金，单位人民币").default(1000000),
    commission_rate: tool.schema.number().min(0).max(0.1).describe("单边佣金率").default(0.0003),
    minimum_commission: tool.schema.number().min(0).describe("每笔最低佣金，单位人民币").default(5),
    stamp_duty_rate: tool.schema.number().min(0).max(0.1).describe("卖出印花税率").default(0.0005),
    slippage_bps: tool.schema.number().min(0).max(10000).describe("单边滑点，单位基点").default(5),
    lot_size: tool.schema.number().int().positive().describe("A 股最小交易单位").default(100),
  },
  async execute(args, context) {
    const outputDirectory = resolve(
      import.meta.dir,
      `../../packages/app-stock/python/.artifacts/${context.sessionID.replaceAll(/[^a-zA-Z0-9_-]/g, "_")}`,
    )
    return runFreeMarketData(
      [
        "eps-backtest",
        "--start-date",
        args.start_date,
        "--end-date",
        args.end_date,
        "--top",
        String(args.selection_count ?? 20),
        "--initial-cash",
        String(args.initial_cash ?? 1000000),
        "--commission-rate",
        String(args.commission_rate ?? 0.0003),
        "--minimum-commission",
        String(args.minimum_commission ?? 5),
        "--stamp-duty-rate",
        String(args.stamp_duty_rate ?? 0.0005),
        "--slippage-bps",
        String(args.slippage_bps ?? 5),
        "--lot-size",
        String(args.lot_size ?? 100),
        "--output-dir",
        outputDirectory,
        "--westock-cross-check",
        "--compact",
      ],
      context.abort,
    )
  },
})
