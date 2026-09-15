from __future__ import annotations

import argparse
import contextlib
import io
import importlib.metadata
import json
import math
import os
import socket
import sqlite3
import statistics
import subprocess
import sys
import time
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Callable, Iterable, TypeVar

from report import write_report


CACHE_PATH = Path(__file__).parent / ".cache" / "market.sqlite3"
socket.setdefaulttimeout(15)
T = TypeVar("T")


@dataclass(frozen=True)
class Costs:
    commission_rate: float
    minimum_commission: float
    stamp_duty_rate: float
    slippage_bps: float
    lot_size: int


def main() -> None:
    parser = argparse.ArgumentParser(description="AlphaLab 免费 A 股数据桥")
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("health")

    bars = subparsers.add_parser("bars")
    bars.add_argument("--provider", choices=["baostock", "akshare", "westock"], required=True)
    bars.add_argument("--symbol", required=True)
    bars.add_argument("--start-date", required=True)
    bars.add_argument("--end-date", required=True)

    backtest = subparsers.add_parser("eps-backtest")
    backtest.add_argument("--start-date", required=True)
    backtest.add_argument("--end-date", required=True)
    backtest.add_argument("--top", type=int, default=20)
    backtest.add_argument("--initial-cash", type=float, default=1_000_000)
    backtest.add_argument("--commission-rate", type=float, default=0.0003)
    backtest.add_argument("--minimum-commission", type=float, default=5)
    backtest.add_argument("--stamp-duty-rate", type=float, default=0.0005)
    backtest.add_argument("--slippage-bps", type=float, default=5)
    backtest.add_argument("--lot-size", type=int, default=100)
    backtest.add_argument("--compact", action="store_true")
    backtest.add_argument("--output-dir")
    backtest.add_argument("--westock-cross-check", action="store_true")

    args = parser.parse_args()
    if args.command == "health":
        print(json.dumps(health(), ensure_ascii=False))
        return
    if args.command == "bars":
        result = load_bars(args.provider, args.symbol, args.start_date, args.end_date)
        print(json.dumps(result, ensure_ascii=False))
        return
    validate_backtest_args(args)
    result = eps_backtest(
        args.start_date,
        args.end_date,
        args.top,
        args.initial_cash,
        Costs(
            args.commission_rate,
            args.minimum_commission,
            args.stamp_duty_rate,
            args.slippage_bps,
            args.lot_size,
        ),
        args.westock_cross_check,
    )
    if args.output_dir:
        write_report(result, Path(args.output_dir))
    print(json.dumps(compact_report(result) if args.compact else result, ensure_ascii=False))


def health() -> dict[str, object]:
    import akshare

    baostock_network = probe(
        lambda: with_baostock(
            lambda bs: query_rows(bs.query_trade_dates("2024-01-01", "2024-01-10")),
            attempts=1,
        )
    )
    akshare_network = probe(lambda: akshare_bars("600519", "2024-01-02", "2024-01-05"))

    westock_path = Path.home() / ".local" / "bin" / "westock"
    return {
        "ok": bool(baostock_network["ok"]),
        "providers": {
            "baostock": {
                "version": importlib.metadata.version("baostock"),
                "authentication": "anonymous",
                "roles": ["historical_constituents", "point_in_time_eps", "prices", "trade_calendar", "benchmark"],
                "installed": True,
                "network": baostock_network,
            },
            "akshare": {
                "version": akshare.__version__,
                "authentication": "none",
                "roles": ["eastmoney_prices_with_tencent_fallback", "current_constituents", "cross_check"],
                "installed": True,
                "network": akshare_network,
            },
            "westock": {
                "authentication": "none",
                "roles": ["prices", "basic_eps_cross_check", "cross_market_supplement"],
                "installed": westock_path.exists(),
                "network": {"ok": None, "detail": "回测时按需校验，不在健康检查中额外请求腾讯接口"},
                "limitations": ["财务记录没有公告日，禁止用于 point-in-time 历史信号", "历史深度与字段少于主数据源"],
            },
        },
    }


def probe(task: Callable[[], list[dict[str, object]]]) -> dict[str, object]:
    try:
        rows = task()
        return {"ok": bool(rows), "rows": len(rows)}
    except Exception as error:
        return {"ok": False, "error": str(error)}


def validate_backtest_args(args: argparse.Namespace) -> None:
    start = parse_date(args.start_date)
    end = parse_date(args.end_date)
    if start >= end:
        raise ValueError("开始日期必须早于结束日期")
    if (end - start).days > 366 * 3:
        raise ValueError("交互式 EPS 回测区间不能超过 3 年；请先用 6 到 12 个月验证，再分段扩展")
    if not 1 <= args.top <= 100:
        raise ValueError("选股数量必须在 1 到 100 之间")
    if args.initial_cash <= 0 or args.lot_size <= 0:
        raise ValueError("初始资金和交易单位必须为正数")
    if min(args.commission_rate, args.minimum_commission, args.stamp_duty_rate, args.slippage_bps) < 0:
        raise ValueError("交易成本参数不能为负数")


def eps_backtest(start_date: str, end_date: str, top: int, initial_cash: float, costs: Costs, westock_cross_check: bool = False) -> dict[str, object]:
    calendar_start = (parse_date(start_date) - timedelta(days=45)).isoformat()
    calendar = cached_query("baostock", "calendar", f"{calendar_start}:{end_date}", lambda: baostock_calendar(calendar_start, end_date))
    trading_dates = [row["date"] for row in calendar if row["is_trading_day"]]
    if len(trading_dates) < 2:
        raise RuntimeError("回测区间内没有足够的交易日")
    month_ends = monthly_last_dates(trading_dates)
    signal_dates = [
        item
        for item in month_ends
        if next_trading_date(trading_dates, item) and start_date <= str(next_trading_date(trading_dates, item)) <= end_date
    ]
    if not signal_dates:
        raise RuntimeError("回测区间内没有可执行的月末调仓日")

    memberships = load_constituent_rows(signal_dates)
    symbols = sorted({row["code"] for rows in memberships.values() for row in rows})
    quarters = report_quarters(start_date, end_date)
    jobs = [(symbol, year, quarter) for symbol in symbols for year, quarter in quarters]
    profits = load_profit_rows(jobs)
    selections = build_selections(signal_dates, memberships, profits, top)
    selected_symbols = sorted({row["code"] for selection in selections for row in selection["stocks"]})
    price_start = (parse_date(start_date) - timedelta(days=10)).isoformat()
    price_end = end_date
    price_jobs = [(symbol, price_start, price_end) for symbol in selected_symbols]
    prices = load_bar_rows(price_jobs)
    benchmark = cached_query("baostock", "index-bars", f"sh.000300:{price_start}:{price_end}", lambda: baostock_bars("sh.000300", price_start, price_end, index=True))
    result = simulate(trading_dates, selections, prices, benchmark, start_date, initial_cash, costs)
    cross_check = cross_check_latest_selection(selections) if westock_cross_check else {"status": "not_run", "source": "tencent-westock"}
    report = {
        "strategy": {
            "name": "沪深300 EPS 月度选股策略",
            "universe": "沪深300历史成分股",
            "factor": "BaoStock epsTTM（公告日点时口径）",
            "selection_count": top,
            "rebalance": "每月最后一个交易日收盘后选股，下一交易日开盘等权调仓",
        },
        "period": {"start": start_date, "end": end_date},
        "data": {
            "primary": "baostock",
            "akshare_role": "可选行情降级与交叉校验；本次因子回测未混用 AKShare 财务数据",
            "westock_role": "腾讯自选股 BasicEPS 仅作独立交叉校验；因缺少公告日，不参与历史信号生成",
            "price_adjustment": "前复权",
            "point_in_time_rule": "仅使用 pubDate 不晚于信号日的 epsTTM，按当日历史指数成分股筛选",
            "constituent_snapshots": len(memberships),
            "constituent_union": len(symbols),
            "priced_symbols": len(selected_symbols),
            "cross_check": cross_check,
        },
        "assumptions": {
            "initial_cash": initial_cash,
            "commission_rate": costs.commission_rate,
            "minimum_commission": costs.minimum_commission,
            "stamp_duty_rate": costs.stamp_duty_rate,
            "slippage_bps": costs.slippage_bps,
            "lot_size": costs.lot_size,
            "not_modeled": ["涨跌停无法成交", "停牌延期成交", "市场冲击", "分红税"],
        },
        "result": result,
        "selections": selections,
        "disclaimer": "历史回测不代表未来表现，本结果仅用于研究，不构成投资建议。",
    }
    report["audit"] = audit_backtest(report, memberships, prices)
    return report


def build_selections(signal_dates: list[str], memberships: dict[str, list[dict[str, object]]], profits: dict[str, list[dict[str, object]]], top: int) -> list[dict[str, object]]:
    result = []
    for signal_date in signal_dates:
        candidates = [
            {
                "code": member["code"],
                "name": member["name"],
                **eps,
            }
            for member in memberships[signal_date]
            if (eps := latest_eps(profits.get(str(member["code"]), []), signal_date))
        ]
        result.append(
            {
                "signal_date": signal_date,
                "universe_count": len(memberships[signal_date]),
                "factor_count": len(candidates),
                "factor_coverage": len(candidates) / len(memberships[signal_date]) if memberships[signal_date] else 0,
                "stocks": sorted(candidates, key=lambda row: float(row["eps_ttm"]), reverse=True)[:top],
            }
        )
    return result


def latest_eps(rows: list[dict[str, object]], signal_date: str) -> dict[str, object]:
    available = [row for row in rows if row.get("pub_date") and str(row["pub_date"]) <= signal_date and finite_number(row.get("eps_ttm"))]
    if not available:
        return {}
    row = max(available, key=lambda item: (str(item["pub_date"]), str(item["stat_date"])))
    return {"eps_ttm": float(row["eps_ttm"]), "pub_date": row["pub_date"], "stat_date": row["stat_date"]}


def simulate(trading_dates: list[str], selections: list[dict[str, object]], prices: dict[str, list[dict[str, object]]], benchmark: list[dict[str, object]], start_date: str, initial_cash: float, costs: Costs) -> dict[str, object]:
    by_symbol = {symbol: {str(row["date"]): row for row in rows} for symbol, rows in prices.items()}
    schedule = {next_trading_date(trading_dates, str(selection["signal_date"])): selection for selection in selections}
    schedule.pop(None, None)
    cash = initial_cash
    holdings: dict[str, int] = {}
    equity_curve: list[dict[str, object]] = []
    trades: list[dict[str, object]] = []
    turnover_notional = 0.0
    skipped = 0

    for trading_date in trading_dates:
        selection = schedule.get(trading_date)
        if selection:
            desired = [str(row["code"]) for row in selection["stocks"]]
            open_prices = {
                symbol: float(by_symbol[symbol][trading_date]["open"])
                for symbol in set(holdings) | set(desired)
                if symbol in by_symbol and trading_date in by_symbol[symbol] and finite_number(by_symbol[symbol][trading_date].get("open")) and float(by_symbol[symbol][trading_date]["open"]) > 0
            }
            equity_at_open = cash + sum(shares * open_prices.get(symbol, last_close(by_symbol.get(symbol, {}), trading_date)) for symbol, shares in holdings.items())
            target_value = equity_at_open / len(desired) if desired else 0
            targets = {
                symbol: math.floor(target_value / (open_prices[symbol] * costs.lot_size)) * costs.lot_size
                for symbol in desired
                if symbol in open_prices
            }
            for symbol, shares in list(holdings.items()):
                target = targets.get(symbol, 0)
                quantity = max(0, shares - target)
                if not quantity or symbol not in open_prices:
                    if symbol not in open_prices and quantity:
                        skipped += 1
                    continue
                execution_price = open_prices[symbol] * (1 - costs.slippage_bps / 10_000)
                notional = execution_price * quantity
                fee = max(costs.minimum_commission, notional * costs.commission_rate) + notional * costs.stamp_duty_rate
                cash += notional - fee
                holdings[symbol] = shares - quantity
                turnover_notional += notional
                trades.append({"date": trading_date, "code": symbol, "side": "sell", "shares": quantity, "price": execution_price, "fee": fee})
                if holdings[symbol] == 0:
                    holdings.pop(symbol)
            for symbol, target in targets.items():
                current = holdings.get(symbol, 0)
                requested = max(0, target - current)
                if not requested:
                    continue
                execution_price = open_prices[symbol] * (1 + costs.slippage_bps / 10_000)
                affordable = math.floor(cash / (execution_price * costs.lot_size)) * costs.lot_size
                quantity = min(requested, affordable)
                while quantity > 0:
                    notional = execution_price * quantity
                    fee = max(costs.minimum_commission, notional * costs.commission_rate)
                    if notional + fee <= cash:
                        break
                    quantity -= costs.lot_size
                if quantity <= 0:
                    skipped += 1
                    continue
                notional = execution_price * quantity
                fee = max(costs.minimum_commission, notional * costs.commission_rate)
                cash -= notional + fee
                holdings[symbol] = current + quantity
                turnover_notional += notional
                trades.append({"date": trading_date, "code": symbol, "side": "buy", "shares": quantity, "price": execution_price, "fee": fee})

        if trading_date >= start_date:
            equity = cash + sum(shares * close_on_or_before(by_symbol.get(symbol, {}), trading_date) for symbol, shares in holdings.items())
            equity_curve.append({"date": trading_date, "equity": equity})

    values = [float(row["equity"]) for row in equity_curve]
    metrics = performance_metrics([initial_cash, *values])
    benchmark_map = {str(row["date"]): float(row["close"]) for row in benchmark if finite_number(row.get("close"))}
    benchmark_values = [benchmark_map[item] for item in trading_dates if item >= start_date and item in benchmark_map]
    if benchmark_values:
        first_benchmark = benchmark_values[0]
        for point in equity_curve:
            if str(point["date"]) in benchmark_map:
                point["benchmark_equity"] = initial_cash * benchmark_map[str(point["date"])] / first_benchmark
    benchmark_metrics = performance_metrics(benchmark_values)
    return {
        "metrics": {
            **metrics,
            "benchmark_total_return": benchmark_metrics["total_return"],
            "benchmark_annualized_return": benchmark_metrics["annualized_return"],
            "annualized_excess_return": metrics["annualized_return"] - benchmark_metrics["annualized_return"],
            "period_turnover": turnover_notional / statistics.fmean(values) if values else 0,
            "trade_count": len(trades),
            "rebalance_count": len(selections),
            "skipped_orders": skipped,
        },
        "metric_definitions": {
            "period_turnover": "样本期内买卖成交金额之和 / 样本期日均权益；未年化",
            "sharpe": "日收益均值 / 日收益标准差 × sqrt(252)，无风险利率按 0 处理",
        },
        "equity_curve": equity_curve,
        "trades": trades,
    }


def performance_metrics(values: list[float]) -> dict[str, float]:
    if len(values) < 2 or values[0] <= 0:
        return {"total_return": 0, "annualized_return": 0, "annualized_volatility": 0, "sharpe": 0, "maximum_drawdown": 0}
    returns = [values[index] / values[index - 1] - 1 for index in range(1, len(values)) if values[index - 1] > 0]
    total_return = values[-1] / values[0] - 1
    annualized_return = (values[-1] / values[0]) ** (252 / max(1, len(returns))) - 1
    volatility = statistics.stdev(returns) * math.sqrt(252) if len(returns) > 1 else 0
    sharpe = statistics.fmean(returns) * 252 / volatility if volatility else 0
    peak = values[0]
    maximum_drawdown = 0.0
    for value in values:
        peak = max(peak, value)
        maximum_drawdown = min(maximum_drawdown, value / peak - 1)
    return {
        "total_return": total_return,
        "annualized_return": annualized_return,
        "annualized_volatility": volatility,
        "sharpe": sharpe,
        "maximum_drawdown": maximum_drawdown,
    }


def audit_backtest(
    report: dict[str, object],
    memberships: dict[str, list[dict[str, object]]],
    prices: dict[str, list[dict[str, object]]],
) -> dict[str, object]:
    selections = report["selections"]
    requested = int(report["strategy"]["selection_count"])
    minimum_universe = min((len(rows) for rows in memberships.values()), default=0)
    minimum_factor_coverage = min((float(selection["factor_coverage"]) for selection in selections), default=0)
    short_selections = [selection["signal_date"] for selection in selections if len(selection["stocks"]) < requested]
    selected_symbols = {str(stock["code"]) for selection in selections for stock in selection["stocks"]}
    missing_prices = sorted(symbol for symbol in selected_symbols if not prices.get(symbol))
    future_publications = [
        f'{selection["signal_date"]}:{stock["code"]}'
        for selection in selections
        for stock in selection["stocks"]
        if str(stock["pub_date"]) > str(selection["signal_date"])
    ]
    metrics = report["result"]["metrics"]
    data = report.get("data") if isinstance(report.get("data"), dict) else {}
    invalid_metrics = [key for key, value in metrics.items() if isinstance(value, (int, float)) and not math.isfinite(float(value))]
    checks = [
        audit_check(
            "pit_universe",
            "历史成分股（PIT）",
            "pass" if minimum_universe >= 250 else "fail",
            f"{len(memberships)} 个信号日，最小股票池 {minimum_universe} 只；没有用当前成分股静态回溯",
        ),
        audit_check(
            "publication_date",
            "财报可用日",
            "pass" if not future_publications else "fail",
            "所有入选 EPS 的 pubDate 均不晚于信号日" if not future_publications else f"发现 {len(future_publications)} 条未来财报",
        ),
        audit_check(
            "factor_coverage",
            "EPS 覆盖率",
            "pass" if minimum_factor_coverage >= 0.8 and not short_selections else "warn",
            f"各期最低覆盖 {minimum_factor_coverage:.1%}；{len(short_selections)} 期未选满 {requested} 只",
        ),
        audit_check(
            "price_coverage",
            "行情覆盖",
            "pass" if not missing_prices else "fail",
            f"{len(selected_symbols) - len(missing_prices)}/{len(selected_symbols)} 只入选股票有行情",
        ),
        audit_check(
            "metric_sanity",
            "指标健全性",
            "pass" if not invalid_metrics and -1 <= float(metrics["maximum_drawdown"]) <= 0 else "fail",
            "净值先转换为日收益后计算年化、波动、夏普与回撤" if not invalid_metrics else f"异常指标：{', '.join(invalid_metrics)}",
        ),
        *westock_audit_checks(data.get("cross_check")),
        audit_check(
            "execution_limits",
            "可成交性模型",
            "warn",
            "已计佣金、最低佣金、印花税、滑点和 100 股交易单位；涨跌停、停牌延期和市场冲击仍未建模",
        ),
    ]
    failed = sum(check["status"] == "fail" for check in checks)
    warned = sum(check["status"] == "warn" for check in checks)
    return {
        "status": "fail" if failed else "warn" if warned else "pass",
        "summary": f"{len(checks) - failed - warned} 项通过，{warned} 项提示，{failed} 项失败",
        "checks": checks,
        "provenance": {
            "signal_source": "BaoStock historical constituents + profit.epsTTM/pubDate",
            "price_source": "BaoStock qfq daily bars",
            "benchmark_source": "BaoStock CSI300 price index",
            "cache": "SQLite request ledger with per-query incremental persistence",
            "cross_check": "westock/腾讯自选股可用于 BasicEPS 独立核验，但不参与历史信号",
        },
    }


def audit_check(identifier: str, label: str, status: str, detail: str) -> dict[str, str]:
    return {"id": identifier, "label": label, "status": status, "detail": detail}


def westock_audit_checks(value: object) -> list[dict[str, str]]:
    if not isinstance(value, dict) or value.get("status") == "not_run":
        return []
    status = str(value.get("status"))
    if status == "pass":
        return [audit_check("westock_cross_check", "腾讯自选股交叉校验", "pass", str(value.get("detail", "口径一致")))]
    return [audit_check("westock_cross_check", "腾讯自选股交叉校验", "warn", str(value.get("detail", "交叉校验不可用")))]


def cross_check_latest_selection(selections: list[dict[str, object]]) -> dict[str, object]:
    if not selections or not selections[-1]["stocks"]:
        return {"status": "unavailable", "source": "tencent-westock", "detail": "没有可校验的入选股票"}
    stock = selections[-1]["stocks"][0]
    signal_date = str(selections[-1]["signal_date"])
    try:
        rows = westock_finance(str(stock["code"]), (parse_date(signal_date) - timedelta(days=800)).isoformat(), signal_date)
        eps = westock_basic_eps_ttm(rows)
        primary = float(stock["eps_ttm"])
        difference = abs(eps - primary) / max(abs(primary), 0.01)
        return {
            "status": "pass" if difference <= 0.1 else "mismatch",
            "source": "tencent-westock",
            "code": stock["code"],
            "signal_date": signal_date,
            "baostock_eps_ttm": primary,
            "westock_basic_eps_ttm": eps,
            "relative_difference": difference,
            "detail": f'{stock["name"] or stock["code"]}：BaoStock {primary:.4f}，westock BasicEPS 自算 TTM {eps:.4f}，差异 {difference:.1%}',
        }
    except Exception as error:
        return {"status": "unavailable", "source": "tencent-westock", "code": stock["code"], "detail": f"校验源不可用：{error}"}


def westock_finance(symbol: str, start_date: str, end_date: str) -> list[dict[str, object]]:
    value = run_westock(["finance", normalize_westock_symbol(symbol), "--type", "income", "--start", start_date, "--end", end_date, "--limit", "12", "--raw"])
    if not isinstance(value, list) or not value:
        raise RuntimeError("westock 没有返回财务记录")
    return value


def run_westock(arguments: list[str]) -> object:
    executable = Path.home() / ".local" / "bin" / "westock"
    if not executable.exists():
        raise RuntimeError("本机未安装 westock")
    environment = {key: value for key, value in os.environ.items() if key.lower() not in {"http_proxy", "https_proxy", "all_proxy", "no_proxy"}}
    environment.update({"NO_PROXY": "*", "no_proxy": "*"})
    process = subprocess.run(
        [str(executable), *arguments],
        capture_output=True,
        text=True,
        timeout=15,
        env=environment,
    )
    if process.returncode != 0:
        raise RuntimeError(process.stderr.strip() or "westock 进程失败")
    return json.loads(process.stdout)


def westock_basic_eps_ttm(rows: list[dict[str, object]]) -> float:
    values = {
        str(row.get("EndDate")): float(row["BasicEPS"])
        for row in rows
        if row.get("EndDate") and finite_number(row.get("BasicEPS"))
    }
    if not values:
        raise RuntimeError("westock BasicEPS 为空")
    end_date = max(values)
    current = parse_date(end_date)
    if current.month == 12:
        return values[end_date]
    prior_period = f"{current.year - 1:04d}-{current.month:02d}-{current.day:02d}"
    prior_annual = f"{current.year - 1:04d}-12-31"
    if prior_period not in values or prior_annual not in values:
        raise RuntimeError("westock 历史期数不足，无法用 BasicEPS 自算 TTM")
    return values[end_date] - values[prior_period] + values[prior_annual]


def compact_report(report: dict[str, object]) -> dict[str, object]:
    result = dict(report["result"])
    curve = result["equity_curve"]
    monthly: dict[str, dict[str, object]] = {}
    for point in curve:
        monthly[str(point["date"])[:7]] = point
    result["equity_curve"] = list(monthly.values())
    result["trades"] = result["trades"][-30:]
    return {**report, "result": result}


def load_constituent_rows(signal_dates: list[str]) -> dict[str, list[dict[str, object]]]:
    cached: dict[str, list[dict[str, object]]] = {}
    missing = []
    for signal_date in signal_dates:
        value = cache_get("baostock", "hs300", signal_date)
        if value is None:
            missing.append(signal_date)
            continue
        cached[signal_date] = value
    if not missing:
        return cached
    print(f"正在获取 {len(missing)} 个月末的沪深300历史成分股…", file=sys.stderr, flush=True)

    def fetch(bs: object) -> None:
        for signal_date in missing:
            if signal_date in cached:
                continue
            rows = [
                {"date": row["updateDate"], "code": row["code"], "name": row["code_name"]}
                for row in query_rows(bs.query_hs300_stocks(signal_date))
            ]
            cache_put("baostock", "hs300", signal_date, rows)
            cached[signal_date] = rows
            print(f"成分股缓存进度 {len(cached)}/{len(signal_dates)}", file=sys.stderr, flush=True)

    with_baostock(fetch)
    return cached


def load_profit_rows(jobs: list[tuple[str, int, int]]) -> dict[str, list[dict[str, object]]]:
    cached: dict[tuple[str, int, int], list[dict[str, object]]] = {}
    missing: list[tuple[str, int, int]] = []
    for job in jobs:
        value = cache_get("baostock", "profit", f"{job[0]}:{job[1]}Q{job[2]}")
        if value is None:
            missing.append(job)
            continue
        cached[job] = value
    if missing:
        print(f"正在获取 {len(missing)} 组 BaoStock 点时 EPS 数据（匿名接口按单会话分批）…", file=sys.stderr, flush=True)
        for chunk in partition_by_size(missing, 80):
            def fetch(bs: object) -> None:
                for job in chunk:
                    if job in cached:
                        continue
                    value = [normalize_profit(row) for row in query_rows(bs.query_profit_data(job[0], job[1], job[2]))]
                    cache_put("baostock", "profit", f"{job[0]}:{job[1]}Q{job[2]}", value)
                    cached[job] = value

            with_baostock(fetch)
            print(f"EPS 缓存进度 {len(cached)}/{len(jobs)}", file=sys.stderr, flush=True)
    result: dict[str, list[dict[str, object]]] = {}
    for (symbol, _, _), rows in cached.items():
        result.setdefault(symbol, []).extend(rows)
    return result


def load_bar_rows(jobs: list[tuple[str, str, str]]) -> dict[str, list[dict[str, object]]]:
    cached: dict[str, list[dict[str, object]]] = {}
    missing: list[tuple[str, str, str]] = []
    for symbol, start_date, end_date in jobs:
        value = cache_get("baostock", "bars", f"{symbol}:{start_date}:{end_date}")
        if value is None:
            missing.append((symbol, start_date, end_date))
            continue
        cached[symbol] = value
    if missing:
        print(f"正在获取 {len(missing)} 只入选股票的前复权行情…", file=sys.stderr, flush=True)
        for chunk in partition_by_size(missing, 40):
            def fetch(bs: object) -> None:
                for job in chunk:
                    if job[0] in cached:
                        continue
                    query = bs.query_history_k_data_plus(
                        job[0],
                        "date,code,open,high,low,close,volume,amount",
                        start_date=job[1],
                        end_date=job[2],
                        frequency="d",
                        adjustflag="2",
                    )
                    value = [normalize_bar(row) for row in query_rows(query)]
                    cache_put("baostock", "bars", f"{job[0]}:{job[1]}:{job[2]}", value)
                    cached[job[0]] = value

            with_baostock(fetch)
            print(f"行情缓存进度 {len(cached)}/{len(jobs)}", file=sys.stderr, flush=True)
    return cached


def baostock_calendar(start_date: str, end_date: str) -> list[dict[str, object]]:
    return with_baostock(lambda bs: [{"date": row["calendar_date"], "is_trading_day": row["is_trading_day"] == "1"} for row in query_rows(bs.query_trade_dates(start_date, end_date))])


def baostock_constituents(on_date: str) -> list[dict[str, object]]:
    return with_baostock(lambda bs: [{"date": row["updateDate"], "code": row["code"], "name": row["code_name"]} for row in query_rows(bs.query_hs300_stocks(on_date))])


def baostock_bars(symbol: str, start_date: str, end_date: str, index: bool = False) -> list[dict[str, object]]:
    code = normalize_baostock_symbol(symbol)
    fields = "date,code,open,high,low,close,volume,amount"
    adjustflag = "3" if index else "2"
    return with_baostock(
        lambda bs: [
            normalize_bar(row)
            for row in query_rows(
                bs.query_history_k_data_plus(
                    code,
                    fields,
                    start_date=start_date,
                    end_date=end_date,
                    frequency="d",
                    adjustflag=adjustflag,
                )
            )
        ]
    )


def akshare_bars(symbol: str, start_date: str, end_date: str) -> list[dict[str, object]]:
    import akshare

    try:
        frame = akshare.stock_zh_a_hist(symbol=normalize_akshare_symbol(symbol), period="daily", start_date=start_date.replace("-", ""), end_date=end_date.replace("-", ""), adjust="qfq")
    except Exception:
        return akshare_tencent_bars(symbol, start_date, end_date)
    return [
        {
            "date": row["日期"].strftime("%Y-%m-%d"),
            "code": str(row["股票代码"]),
            "open": float(row["开盘"]),
            "high": float(row["最高"]),
            "low": float(row["最低"]),
            "close": float(row["收盘"]),
            "volume": float(row["成交量"]) * 100,
            "amount": float(row["成交额"]),
        }
        for _, row in frame.iterrows()
    ]


def akshare_tencent_bars(symbol: str, start_date: str, end_date: str) -> list[dict[str, object]]:
    import akshare

    frame = akshare.stock_zh_a_hist_tx(
        symbol=normalize_westock_symbol(symbol),
        start_date=start_date.replace("-", ""),
        end_date=end_date.replace("-", ""),
        adjust="qfq",
        timeout=15,
    )
    return [
        {
            "date": row["date"].strftime("%Y-%m-%d"),
            "code": normalize_akshare_symbol(symbol),
            "open": float(row["open"]),
            "high": float(row["high"]),
            "low": float(row["low"]),
            "close": float(row["close"]),
            "volume": float(row["volume"]),
            "amount": float(row["amount"]),
        }
        for _, row in frame.iterrows()
    ]


def westock_bars(symbol: str, start_date: str, end_date: str) -> list[dict[str, object]]:
    value = run_westock(["kline", normalize_westock_symbol(symbol), "--period", "day", "--start", start_date, "--end", end_date, "--fq", "qfq", "--limit", "2000", "--raw"])
    if not isinstance(value, list) or not value:
        raise RuntimeError("westock 没有返回行情记录")
    return normalize_westock_bars(value, symbol)


def normalize_westock_bars(rows: list[dict[str, object]], symbol: str) -> list[dict[str, object]]:
    return sorted(
        [
            {
                "date": str(row["date"]),
                "code": normalize_akshare_symbol(symbol),
                "open": float(row["open"]),
                "high": float(row["high"]),
                "low": float(row["low"]),
                "close": float(row["last"]),
                "volume": float(row["volume"]) * 100,
                "amount": float(row["amount"]),
            }
            for row in rows
        ],
        key=lambda row: str(row["date"]),
    )


def load_bars(provider: str, symbol: str, start_date: str, end_date: str) -> list[dict[str, object]]:
    if provider == "baostock":
        return baostock_bars(symbol, start_date, end_date)
    if provider == "westock":
        return westock_bars(symbol, start_date, end_date)
    return akshare_bars(symbol, start_date, end_date)


def with_baostock(task: Callable[[object], T], attempts: int = 3) -> T:
    import baostock as bs

    last_error: Exception | None = None
    for attempt in range(attempts):
        logged_in = False
        try:
            with contextlib.redirect_stdout(io.StringIO()):
                login = bs.login()
            if login.error_code != "0":
                raise RuntimeError(f"BaoStock 登录失败：{login.error_msg}")
            logged_in = True
            return task(bs)
        except Exception as error:
            last_error = error
        finally:
            if logged_in:
                with contextlib.suppress(Exception), contextlib.redirect_stdout(io.StringIO()):
                    bs.logout()
        if attempt + 1 < attempts:
            delay = 1.5 * (attempt + 1)
            print(f"BaoStock 请求失败，{delay:g} 秒后进行第 {attempt + 2}/{attempts} 次尝试…", file=sys.stderr, flush=True)
            time.sleep(delay)
    raise RuntimeError(f"BaoStock 请求失败（已尝试 {attempts} 次）：{last_error}") from last_error


def query_rows(query: object) -> list[dict[str, str]]:
    if query.error_code != "0":
        raise RuntimeError(f"BaoStock 查询失败：{query.error_msg}")
    rows = []
    while query.next():
        rows.append(dict(zip(query.fields, query.get_row_data())))
    return rows


def normalize_profit(row: dict[str, str]) -> dict[str, object]:
    return {"code": row["code"], "pub_date": row["pubDate"], "stat_date": row["statDate"], "eps_ttm": optional_float(row["epsTTM"])}


def normalize_bar(row: dict[str, str]) -> dict[str, object]:
    return {
        "date": row["date"],
        "code": row["code"],
        "open": optional_float(row["open"]),
        "high": optional_float(row["high"]),
        "low": optional_float(row["low"]),
        "close": optional_float(row["close"]),
        "volume": optional_float(row["volume"]),
        "amount": optional_float(row["amount"]),
    }


def cached_query(source: str, kind: str, key: str, fetch: Callable[[], list[dict[str, object]]]) -> list[dict[str, object]]:
    value = cache_get(source, kind, key)
    if value is not None:
        return value
    value = fetch()
    cache_put(source, kind, key, value)
    return value


def cache_get(source: str, kind: str, key: str) -> list[dict[str, object]] | None:
    with cache_connection() as connection:
        row = connection.execute("SELECT payload FROM cache WHERE source = ? AND kind = ? AND cache_key = ?", (source, kind, key)).fetchone()
    return json.loads(row[0]) if row else None


def cache_put(source: str, kind: str, key: str, value: list[dict[str, object]]) -> None:
    with cache_connection() as connection:
        connection.execute(
            "INSERT OR REPLACE INTO cache(source, kind, cache_key, payload, updated_at) VALUES (?, ?, ?, ?, ?)",
            (source, kind, key, json.dumps(value, ensure_ascii=False), datetime.now().isoformat()),
        )


def cache_connection() -> sqlite3.Connection:
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(CACHE_PATH)
    connection.execute("CREATE TABLE IF NOT EXISTS cache(source TEXT, kind TEXT, cache_key TEXT, payload TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(source, kind, cache_key))")
    return connection


def report_quarters(start_date: str, end_date: str) -> list[tuple[int, int]]:
    start = parse_date(start_date)
    end = parse_date(end_date)
    months = []
    cursor = date(start.year, start.month, 1)
    while cursor <= end:
        months.append(cursor)
        cursor = date(cursor.year + (cursor.month == 12), cursor.month % 12 + 1, 1)
    candidates = {quarter for month in months for quarter in likely_report_quarters(month)}
    return sorted(candidates)


def likely_report_quarters(month: date) -> list[tuple[int, int]]:
    if month.month <= 3:
        return [(month.year - 1, 2), (month.year - 1, 3)]
    if month.month == 4:
        return [(month.year - 1, 4), (month.year, 1)]
    if month.month <= 6:
        return [(month.year - 1, 4), (month.year, 1)]
    if month.month <= 9:
        return [(month.year, 1), (month.year, 2)]
    return [(month.year, 2), (month.year, 3)]


def monthly_last_dates(trading_dates: list[str]) -> list[str]:
    result: dict[str, str] = {}
    for item in trading_dates:
        result[item[:7]] = item
    return list(result.values())


def next_trading_date(trading_dates: list[str], current: str) -> str | None:
    try:
        return trading_dates[trading_dates.index(current) + 1]
    except (ValueError, IndexError):
        return None


def partition_by_size(items: list[tuple], size: int) -> list[list[tuple]]:
    return [items[index : index + size] for index in range(0, len(items), size)]


def last_close(rows: dict[str, dict[str, object]], trading_date: str) -> float:
    return close_on_or_before(rows, trading_date)


def close_on_or_before(rows: dict[str, dict[str, object]], trading_date: str) -> float:
    candidates = [row for item, row in rows.items() if item <= trading_date and finite_number(row.get("close"))]
    return float(max(candidates, key=lambda row: str(row["date"]))["close"]) if candidates else 0


def normalize_baostock_symbol(symbol: str) -> str:
    value = symbol.lower()
    if value.startswith("sh.") or value.startswith("sz."):
        return value
    digits = value.split(".")[0]
    return f"sh.{digits}" if digits.startswith(("5", "6", "9")) else f"sz.{digits}"


def normalize_akshare_symbol(symbol: str) -> str:
    digits = next((part for part in symbol.split(".") if part.isdigit()), "")
    if len(digits) != 6:
        raise ValueError("AKShare A 股代码必须包含 6 位数字")
    return digits


def normalize_westock_symbol(symbol: str) -> str:
    code = normalize_akshare_symbol(symbol)
    return f"sh{code}" if code.startswith(("5", "6", "9")) else f"sz{code}"


def optional_float(value: object) -> float | None:
    try:
        result = float(value)
        return result if math.isfinite(result) else None
    except (TypeError, ValueError):
        return None


def finite_number(value: object) -> bool:
    return optional_float(value) is not None


def parse_date(value: str) -> date:
    return date.fromisoformat(value)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"数据任务失败：{error}", file=sys.stderr, flush=True)
        raise SystemExit(1) from None
