import { describe, expect, test } from "bun:test"
import { parseStrategyArtifact, safeSessionId, summarizeStrategyArtifact } from "./artifact"

const report = JSON.stringify({
  strategy: { name: "沪深300 EPS 月度选股策略" },
  period: { start: "2025-01-01", end: "2025-12-31" },
  result: {
    metrics: {
      total_return: 0.2937,
      benchmark_total_return: 0.2119,
      annualized_excess_return: 0.0845,
      maximum_drawdown: -0.0791,
      sharpe: 1.97,
    },
  },
  audit: { status: "warn", summary: "6 项通过，1 项提示，0 项失败" },
  artifacts: { generated_at: "2026-09-15T10:00:00+08:00" },
})

describe("策略运行产物", () => {
  test("模型漏掉最终文本时生成确定性摘要", () => {
    expect(summarizeStrategyArtifact(report)).toContain("策略收益 29.37%")
    expect(summarizeStrategyArtifact(report)).toContain("最大回撤 -7.91%")
  })

  test("只暴露安全的会话级报告路径", () => {
    expect(safeSessionId("ses/../unsafe")).toBe("ses____unsafe")
    expect(parseStrategyArtifact("ses/../unsafe", report)?.htmlUrl).toBe("/api/artifacts/ses____unsafe/report.html")
  })
})
