from __future__ import annotations

import html
import json
from collections import Counter
from datetime import datetime
from pathlib import Path


def write_report(report: dict[str, object], output_dir: Path) -> dict[str, str]:
    output_dir.mkdir(parents=True, exist_ok=True)
    artifacts = {
        "title": str(report["strategy"]["name"]),
        "html": "report.html",
        "json": "result.json",
        "generated_at": datetime.now().astimezone().isoformat(timespec="seconds"),
    }
    report["artifacts"] = artifacts
    (output_dir / artifacts["json"]).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    (output_dir / artifacts["html"]).write_text(render_html(report), encoding="utf-8")
    return artifacts


def render_html(report: dict[str, object]) -> str:
    strategy = report["strategy"]
    period = report["period"]
    result = report["result"]
    metrics = result["metrics"]
    audit = report["audit"]
    selections = report["selections"]
    curve = result["equity_curve"]
    metric_cards = "".join(
        f'<div class="metric"><span>{html.escape(label)}</span><strong>{format_metric(metrics.get(key, 0), kind)}</strong></div>'
        for key, label, kind in [
            ("total_return", "策略收益", "percent"),
            ("annualized_return", "年化收益", "percent"),
            ("benchmark_total_return", "沪深300收益", "percent"),
            ("annualized_excess_return", "年化超额", "percent"),
            ("annualized_volatility", "年化波动", "percent"),
            ("maximum_drawdown", "最大回撤", "percent"),
            ("sharpe", "夏普比率", "number"),
            ("period_turnover", "样本期换手", "percent"),
            ("trade_count", "成交笔数", "integer"),
        ]
    )
    checks = "".join(
        f'<li class="{html.escape(str(check["status"]))}"><b>{html.escape(str(check["label"]))}</b><span>{html.escape(str(check["detail"]))}</span></li>'
        for check in audit["checks"]
    )
    rows = "".join(
        "<tr>"
        f'<td>{html.escape(str(selection["signal_date"]))}</td>'
        f'<td>{selection["universe_count"]}</td>'
        f'<td>{selection["factor_count"]}</td>'
        f'<td>{html.escape("、".join(str(stock["name"]) or str(stock["code"]) for stock in selection["stocks"]))}</td>'
        "</tr>"
        for selection in selections
    )
    chart = equity_svg(curve)
    drawdown = drawdown_svg(curve)
    initial_cash = float(report.get("assumptions", {}).get("initial_cash", curve[0]["equity"] if curve else 0))
    annual_rows = annual_return_rows(curve, initial_cash)
    monthly_rows = monthly_return_rows(curve, initial_cash)
    latest = selections[-1] if selections else None
    latest_rows = "" if latest is None else "".join(
        "<tr>"
        f'<td>{index}</td><td>{html.escape(str(stock["name"] or stock["code"]))}</td>'
        f'<td>{html.escape(str(stock["code"]))}</td><td>{float(stock["eps_ttm"]):.4f}</td>'
        f'<td>{html.escape(str(stock["stat_date"]))}</td><td>{html.escape(str(stock["pub_date"]))}</td>'
        "</tr>"
        for index, stock in enumerate(latest["stocks"], 1)
    )
    frequencies = Counter(str(stock["name"] or stock["code"]) for selection in selections for stock in selection["stocks"])
    frequency_rows = "".join(
        f"<tr><td>{index}</td><td>{html.escape(name)}</td><td>{count}</td><td>{count / max(len(selections), 1):.0%}</td></tr>"
        for index, (name, count) in enumerate(frequencies.most_common(15), 1)
    )
    coverage = sum(float(selection.get("factor_coverage", 0)) for selection in selections) / max(len(selections), 1)
    relative = float(metrics["total_return"]) - float(metrics["benchmark_total_return"])
    conclusion = (
        f'样本期策略累计收益 <b>{format_metric(metrics["total_return"], "percent")}</b>，'
        f'同期沪深300为 <b>{format_metric(metrics["benchmark_total_return"], "percent")}</b>，'
        f'累计领先 <b>{relative * 100:.2f} 个百分点</b>。'
        f'最大回撤为 <b>{format_metric(metrics["maximum_drawdown"], "percent")}</b>，'
        f'年化波动为 <b>{format_metric(metrics.get("annualized_volatility", 0), "percent")}</b>；'
        f'平均 EPS 可用覆盖率为 <b>{coverage:.1%}</b>。'
    )
    assumptions = report.get("assumptions", {})
    data = report.get("data", {})
    not_modeled = assumptions.get("not_modeled", []) if isinstance(assumptions, dict) else []
    limitation_items = "".join(f"<li><span>{html.escape(str(item))}</span></li>" for item in not_modeled)
    definitions = result.get("metric_definitions", {})
    definition_items = "".join(f"<li><b>{html.escape(str(key))}</b><span>{html.escape(str(value))}</span></li>" for key, value in definitions.items())
    generated_at = html.escape(str(report["artifacts"]["generated_at"]))
    title = html.escape(str(strategy["name"]))
    return f"""<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title}</title><style>
:root{{font-family:Inter,"Noto Sans SC",system-ui,sans-serif;color:#241b45;background:#f7f8ff}}
*{{box-sizing:border-box}}
body{{margin:0;background:radial-gradient(circle at 8% 0,rgba(231,219,255,.86),transparent 30%),radial-gradient(circle at 92% 12%,rgba(213,236,255,.82),transparent 32%),#f7f8ff}}
body::before{{content:"";position:fixed;inset:0;pointer-events:none;background-image:linear-gradient(rgba(109,74,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(109,74,255,.025) 1px,transparent 1px);background-size:32px 32px;mask-image:linear-gradient(to bottom,black,transparent 70%)}}
main{{position:relative;max-width:1240px;margin:auto;padding:42px 24px 64px}}
header{{position:relative;overflow:hidden;margin-bottom:20px;padding:24px 26px;border:1px solid #dce1f2;border-radius:16px;background:rgba(255,255,255,.9);box-shadow:0 12px 40px rgba(64,57,112,.08)}}
header::after{{content:"";position:absolute;width:260px;height:260px;right:-90px;top:-155px;border-radius:50%;background:radial-gradient(circle,rgba(109,74,255,.2),transparent 68%)}}
h1{{margin:5px 0;font-size:30px;letter-spacing:-.025em;color:#2a155a}}
h2{{font-size:17px;margin:0 0 16px;color:#2a155a}}
h3{{font-size:14px;color:#5f5878}}
p,small,td,th{{color:#68708a;font-size:13px;line-height:1.65}}
b{{color:#342c50}}
.eyebrow{{color:#6d4aff;font-size:11px;font-weight:700;letter-spacing:.17em}}
.panel{{background:rgba(255,255,255,.92);border:1px solid #dce1f2;border-radius:14px;padding:20px;margin:14px 0;overflow:auto;box-shadow:0 10px 32px rgba(64,57,112,.055)}}
.grid{{display:grid;grid-template-columns:1fr 1fr;gap:14px}}
.metrics{{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}}
.metric{{position:relative;overflow:hidden;background:rgba(255,255,255,.9);border:1px solid #e0e3f2;border-radius:12px;padding:16px;box-shadow:0 8px 24px rgba(64,57,112,.045)}}
.metric::after{{content:"";position:absolute;left:0;right:0;bottom:0;height:2px;background:linear-gradient(90deg,#8b5cf6,#2c5dff);opacity:.72}}
.metric span,.metric strong{{display:block}}
.metric span{{color:#77718c;font-size:13px}}
.metric strong{{color:#2a155a;font-size:26px;margin-top:7px}}
.summary{{font-size:15px;border-color:#d9d3fb;background:linear-gradient(135deg,rgba(124,58,237,.08),rgba(44,93,255,.025) 62%,rgba(255,255,255,.94))}}
svg{{width:100%;height:300px;border-radius:10px;background:linear-gradient(180deg,#fbfbff,#fff)}}
.legend{{display:flex;gap:18px;font-size:12px;color:#68708a}}
.dot{{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px}}
.strategy-dot{{background:#6d4aff}}
.benchmark-dot{{background:#7697d6}}
.pass{{color:#12805f}}
.warn{{color:#b7791f}}
.fail{{color:#d9485f}}
ul{{list-style:none;padding:0;margin:0}}
li{{display:flex;gap:12px;padding:10px 0;border-bottom:1px solid #e5e7f2}}
li span{{color:#68708a}}
table{{width:100%;border-collapse:collapse;font-size:13px}}
th,td{{padding:10px;text-align:left;border-bottom:1px solid #e5e7f2;white-space:nowrap}}
th{{color:#5f5878;font-weight:600;background:#f8f8fc}}
tbody tr:hover{{background:#faf9ff}}
td:last-child{{white-space:normal}}
.positive{{color:#12805f}}
.negative{{color:#d9485f}}
.method{{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}}
.method div{{background:#f8f8fc;border:1px solid #e5e7f2;border-radius:10px;padding:14px;color:#403957}}
.method span{{display:block;color:#817b94;font-size:11px;margin-bottom:4px}}
footer{{margin-top:28px;padding-top:18px;border-top:1px solid #dce1f2;color:#817b94;font-size:11px}}
@media(max-width:760px){{main{{padding:20px 14px 42px}}header{{padding:20px}}.metrics{{grid-template-columns:repeat(2,1fr)}}.grid,.method{{grid-template-columns:1fr}}}}
</style></head><body><main>
<header><span class="eyebrow">ALPHALAB · STRATEGY REPORT</span><h1>{title}</h1><p>{html.escape(str(period["start"]))} — {html.escape(str(period["end"]))} · {html.escape(str(strategy["rebalance"]))}</p></header>
<section class="metrics">{metric_cards}</section>
<section class="panel summary"><h2>结论与发现</h2><p>{conclusion}</p><p>该结果只说明本样本与既定成本假设下的历史表现；单因子集中持仓、财报低频更新和交易约束仍可能使样本外表现显著变化。</p></section>
<section class="grid"><section class="panel"><h2>策略净值</h2><div class="legend"><span><i class="dot strategy-dot"></i>策略</span><span><i class="dot benchmark-dot"></i>沪深300</span></div>{chart}</section><section class="panel"><h2>回撤曲线</h2>{drawdown}</section></section>
<section class="grid"><section class="panel"><h2>年度收益</h2><table><thead><tr><th>年份</th><th>收益率</th></tr></thead><tbody>{annual_rows}</tbody></table></section><section class="panel"><h2>月度收益</h2><table><thead><tr><th>月份</th><th>收益率</th></tr></thead><tbody>{monthly_rows}</tbody></table></section></section>
<section class="panel"><h2>最新一期持仓 · {html.escape(str(latest["signal_date"])) if latest else "无"}</h2><table><thead><tr><th>#</th><th>股票</th><th>代码</th><th>EPS TTM</th><th>报告期</th><th>公告日</th></tr></thead><tbody>{latest_rows}</tbody></table></section>
<section class="panel"><h2>最常入选股票</h2><table><thead><tr><th>#</th><th>股票</th><th>入选月数</th><th>覆盖月份占比</th></tr></thead><tbody>{frequency_rows}</tbody></table></section>
<section class="panel"><h2>数据与回测审计 · <span class="{html.escape(str(audit["status"]))}">{html.escape(str(audit["status"]).upper())}</span></h2><ul>{checks}</ul></section>
<section class="panel"><h2>月度选股记录</h2><table><thead><tr><th>信号日</th><th>成分数</th><th>有效 EPS</th><th>入选股票</th></tr></thead><tbody>{rows}</tbody></table></section>
<section class="panel"><h2>方法论与数据口径</h2><div class="method"><div><span>股票池</span>{html.escape(str(strategy.get("universe", "")))}</div><div><span>因子</span>{html.escape(str(strategy.get("factor", "")))}</div><div><span>数据主源</span>{html.escape(str(data.get("primary", "")))}</div><div><span>价格口径</span>{html.escape(str(data.get("price_adjustment", "")))}</div><div><span>点时规则</span>{html.escape(str(data.get("point_in_time_rule", "")))}</div><div><span>初始资金 / 交易单位</span>{format_metric(assumptions.get("initial_cash", 0), "money")} / {assumptions.get("lot_size", "-")} 股</div></div><h3>指标定义</h3><ul>{definition_items}</ul></section>
<section class="panel"><h2>关键假设与局限</h2><ul>{limitation_items}</ul></section>
<footer>{html.escape(str(report["disclaimer"]))} · 生成时间 {generated_at}</footer>
</main></body></html>"""


def equity_svg(curve: list[dict[str, object]]) -> str:
    if not curve:
        return "<p>无可展示净值数据</p>"
    values = [float(point["equity"]) / float(curve[0]["equity"]) * 100 for point in curve]
    benchmark = [float(point.get("benchmark_equity", point["equity"])) / float(curve[0].get("benchmark_equity", curve[0]["equity"])) * 100 for point in curve]
    low, high = min(values + benchmark), max(values + benchmark)
    spread = max(high - low, 1)
    coordinates = [
        f'{20 + index / max(len(values) - 1, 1) * 960:.1f},{230 - (value - low) / spread * 200:.1f}'
        for index, value in enumerate(values)
    ]
    benchmark_coordinates = [
        f'{20 + index / max(len(benchmark) - 1, 1) * 960:.1f},{230 - (value - low) / spread * 200:.1f}'
        for index, value in enumerate(benchmark)
    ]
    return (
        '<svg viewBox="0 0 1000 250" preserveAspectRatio="none" role="img" aria-label="策略权益曲线">'
        '<line x1="20" y1="230" x2="980" y2="230" stroke="#e3e5f1"/>'
        f'<polyline points="{" ".join(coordinates)}" fill="none" stroke="#6d4aff" stroke-width="3" vector-effect="non-scaling-stroke"/>'
        f'<polyline points="{" ".join(benchmark_coordinates)}" fill="none" stroke="#7697d6" stroke-width="2" vector-effect="non-scaling-stroke"/>'
        "</svg>"
    )


def drawdown_svg(curve: list[dict[str, object]]) -> str:
    if not curve:
        return "<p>无可展示回撤数据</p>"
    peak = 0.0
    values = []
    for point in curve:
        equity = float(point["equity"])
        peak = max(peak, equity)
        values.append(equity / peak - 1)
    low = min(values)
    spread = max(abs(low), 0.01)
    coordinates = [f'{20 + index / max(len(values) - 1, 1) * 960:.1f},{20 + abs(value) / spread * 210:.1f}' for index, value in enumerate(values)]
    return '<svg viewBox="0 0 1000 250" preserveAspectRatio="none" role="img" aria-label="策略回撤曲线"><line x1="20" y1="20" x2="980" y2="20" stroke="#e3e5f1"/>' f'<polyline points="{" ".join(coordinates)}" fill="none" stroke="#d9485f" stroke-width="3" vector-effect="non-scaling-stroke"/></svg>'


def annual_return_rows(curve: list[dict[str, object]], initial_cash: float) -> str:
    groups: dict[str, list[float]] = {}
    for point in curve:
        groups.setdefault(str(point["date"])[:4], []).append(float(point["equity"]))
    years = list(groups.items())
    return "".join(return_row(year, values[-1] / (initial_cash if index == 0 else years[index - 1][1][-1]) - 1) for index, (year, values) in enumerate(years))


def monthly_return_rows(curve: list[dict[str, object]], initial_cash: float) -> str:
    months: dict[str, float] = {}
    for point in curve:
        months[str(point["date"])[:7]] = float(point["equity"])
    items = list(months.items())
    return "".join(return_row(month, value / (initial_cash if index == 0 else items[index - 1][1]) - 1) for index, (month, value) in enumerate(items))


def return_row(label: str, value: float) -> str:
    style = "positive" if value >= 0 else "negative"
    return f'<tr><td>{html.escape(label)}</td><td class="{style}">{value * 100:.2f}%</td></tr>'


def format_metric(value: object, kind: str) -> str:
    number = float(value)
    if kind == "percent":
        return f"{number * 100:.2f}%"
    if kind == "integer":
        return f"{number:,.0f}"
    if kind == "money":
        return f"¥{number:,.0f}"
    return f"{number:.2f}"
