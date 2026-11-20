export type QuickPresetItem = {
  id: string
  label: string
  prompt: string
}

export type QuickPresetGroup = {
  id: string
  label: string
  items: QuickPresetItem[]
}

export type QuickPresetLite = {
  id: "lite"
  label: string
  prompt: string
}

export type TeamQuickPresets = {
  groups: QuickPresetGroup[]
  lite: QuickPresetLite
}

// 「快速」模式的场景预设按钮。模板中的【】为待用户替换的占位。
export const QUICK_PRESETS_BY_TEAM: Record<string, TeamQuickPresets> = {
  deeptrading: {
    groups: [
      {
        id: "market",
        label: "大势研判",
        items: [
          {
            id: "risk",
            label: "风险洞察",
            prompt: "当前影响市场的主要潜在风险有哪些？请从宏观、政策、行业等角度，分析这些风险对【黄金概念】短期和中期可能造成的冲击。",
          },
          {
            id: "market-trace",
            label: "市场溯因",
            prompt: "请结合近期【共封装光学(CPO)】相关的热点分析对整体市场的影响。",
          },
          {
            id: "bull-bear",
            label: "熊牛研判",
            prompt: "帮我研判当前市场属于牛市、熊市还是震荡市？短期和中期【趋势】分别如何？",
          },
          {
            id: "macro",
            label: "宏观分析",
            prompt: "请分析【未来一周】市场大势，结合【宏观经济】判断【A股政策】与【资金面】的整体方向。",
          },
        ],
      },
      {
        id: "industry",
        label: "行业分析",
        items: [
          {
            id: "trend",
            label: "行业趋势",
            prompt: "【黄金概念】未来1-2年的发展趋势主要集中在哪些方向？",
          },
          {
            id: "sector",
            label: "板块分析",
            prompt: "请分析【猪肉】未来6个月的景气度变化，以及主要受益公司。",
          },
          {
            id: "chain",
            label: "产业链分析",
            prompt: "请为我梳理【猪肉】的产业链上中下游结构，并分析当前哪个环节最具投资价值？关键的投资逻辑是什么？",
          },
          {
            id: "compare",
            label: "行业对比",
            prompt: "比较【PCB概念】和【猪肉】，哪个更有增长潜力？请从政策、资金流入、龙头竞争力三个角度分析。",
          },
        ],
      },
      {
        id: "stock",
        label: "股票诊断",
        items: [
          {
            id: "anomaly",
            label: "异动分析",
            prompt: "请以专业分析师身份，从资金面、基本面和技术面，诊断【冰山冷热】的异动情况。",
          },
          {
            id: "diagnosis",
            label: "诊股报告",
            prompt: "请对【华胜天成】进行全面诊断，包括基本面、技术面、资金面和风险提示。",
          },
          {
            id: "trend-diagnosis",
            label: "趋势诊断",
            prompt: "对于【冰山冷热】，接下来一周的短期走势如何？",
          },
          {
            id: "stock-compare",
            label: "股票诊断",
            prompt: "请以专业分析师身份，从近一个月的基本面、财务、估值、风险，对比一下【冰山冷热】和【东方海洋】。",
          },
        ],
      },
      {
        id: "review",
        label: "AI复盘",
        items: [
          {
            id: "operation-review",
            label: "操作复盘",
            prompt: "我近期操作了【九阳股份】，请通过AI复盘拆解其交易风险，提供后续操作思路。",
          },
          {
            id: "stock-review",
            label: "个股复盘",
            prompt: "请帮我复盘今天【华胜天成】的表现，包括K线形态、资金流向、成交量异动、涨跌幅，并结合消息面总结上涨或下跌的原因。",
          },
          {
            id: "market-review",
            label: "市场复盘",
            prompt: "请帮我复盘今天的市场整体走势，包括主要指数【涨跌】、【成交量变化】、北向资金流入流出情况，并总结关键驱动因素（政策、消息面、行业热点）。",
          },
          {
            id: "trade-review",
            label: "交易复盘",
            prompt: "我今天买入了【天孚通信】（仓位约20%，买入价175元），卖出了【卧龙电驱】（仓位约30%，卖出价50.31元）。想请从仓位管理、买卖点、风险控制角度，分析这笔交易是否合理，并给出改进建议。",
          },
        ],
      },
    ],
    lite: {
      id: "lite",
      label: "轻量",
      prompt: "一句话快速看下【股票/板块/问题】：给出结论与关键理由，不用写报告。",
    },
  },
}
