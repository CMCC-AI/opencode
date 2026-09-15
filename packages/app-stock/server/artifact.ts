import type { StrategyArtifact } from "../src/lib/contracts"

export function parseStrategyArtifact(sessionId: string, content: string): StrategyArtifact | undefined {
  const value = JSON.parse(content) as unknown
  if (typeof value !== "object" || value === null) return
  const report = value as Record<string, unknown>
  const strategy = report.strategy
  const artifacts = report.artifacts
  const audit = report.audit
  if (
    typeof strategy !== "object" ||
    strategy === null ||
    typeof artifacts !== "object" ||
    artifacts === null ||
    typeof audit !== "object" ||
    audit === null
  )
    return
  const strategyRecord = strategy as Record<string, unknown>
  const artifactRecord = artifacts as Record<string, unknown>
  const auditRecord = audit as Record<string, unknown>
  if (
    typeof strategyRecord.name !== "string" ||
    typeof artifactRecord.generated_at !== "string" ||
    typeof auditRecord.summary !== "string"
  )
    return
  if (auditRecord.status !== "pass" && auditRecord.status !== "warn" && auditRecord.status !== "fail") return
  const encoded = encodeURIComponent(safeSessionId(sessionId))
  return {
    title: strategyRecord.name,
    htmlUrl: `/api/artifacts/${encoded}/report.html`,
    jsonUrl: `/api/artifacts/${encoded}/result.json`,
    generatedAt: artifactRecord.generated_at,
    auditStatus: auditRecord.status,
    auditSummary: auditRecord.summary,
  }
}

export function summarizeStrategyArtifact(content: string) {
  const report = JSON.parse(content) as {
    period?: { start?: unknown; end?: unknown }
    result?: { metrics?: Record<string, unknown> }
    audit?: { summary?: unknown }
  }
  const metrics = report.result?.metrics
  if (!metrics) return "回测已经完成，并生成了可查看的策略报告与原始数据。"
  const formatPercent = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value) ? `${(value * 100).toFixed(2)}%` : "—"
  const formatNumber = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value) ? value.toFixed(2) : "—"
  return [
    `回测已完成（${String(report.period?.start ?? "")} 至 ${String(report.period?.end ?? "")}），并生成了可复现策略报告。`,
    `策略收益 ${formatPercent(metrics.total_return)}，沪深300同期收益 ${formatPercent(metrics.benchmark_total_return)}，年化超额 ${formatPercent(metrics.annualized_excess_return)}，最大回撤 ${formatPercent(metrics.maximum_drawdown)}，夏普比率 ${formatNumber(metrics.sharpe)}。`,
    `数据审计：${String(report.audit?.summary ?? "已完成")}。请打开下方报告查看完整月度选股、数据口径和交易假设。`,
  ].join("\n\n")
}

export function safeSessionId(sessionId: string) {
  return sessionId.replaceAll(/[^a-zA-Z0-9_-]/g, "_")
}
