import json

from market_data import audit_backtest, build_selections, monthly_last_dates, normalize_akshare_symbol, normalize_westock_bars, performance_metrics, report_quarters, westock_basic_eps_ttm
from report import write_report


def test_monthly_last_dates():
    assert monthly_last_dates(["2024-01-02", "2024-01-31", "2024-02-01", "2024-02-29"]) == ["2024-01-31", "2024-02-29"]


def test_point_in_time_eps_selection_excludes_future_publication():
    memberships = {"2024-03-29": [{"code": "sh.600001", "name": "A"}, {"code": "sh.600002", "name": "B"}]}
    profits = {
        "sh.600001": [{"pub_date": "2024-03-20", "stat_date": "2023-12-31", "eps_ttm": 2.0}],
        "sh.600002": [
            {"pub_date": "2024-03-10", "stat_date": "2023-09-30", "eps_ttm": 1.0},
            {"pub_date": "2024-04-01", "stat_date": "2023-12-31", "eps_ttm": 9.0},
        ],
    }
    result = build_selections(["2024-03-29"], memberships, profits, 2)
    assert [row["code"] for row in result[0]["stocks"]] == ["sh.600001", "sh.600002"]
    assert result[0]["stocks"][1]["eps_ttm"] == 1.0


def test_performance_metrics():
    result = performance_metrics([100, 110, 99])
    assert round(result["total_return"], 4) == -0.01
    assert round(result["maximum_drawdown"], 4) == -0.1


def test_report_quarters_includes_prior_year():
    assert report_quarters("2024-01-01", "2024-03-31") == [(2023, 2), (2023, 3)]
    assert report_quarters("2024-07-01", "2024-12-31") == [(2024, 1), (2024, 2), (2024, 3)]


def test_akshare_symbol_formats():
    assert normalize_akshare_symbol("600519") == "600519"
    assert normalize_akshare_symbol("600519.SH") == "600519"
    assert normalize_akshare_symbol("sh.600519") == "600519"


def test_audit_rejects_future_publication():
    report = {
        "strategy": {"selection_count": 1},
        "selections": [
            {
                "signal_date": "2024-03-29",
                "factor_coverage": 1.0,
                "stocks": [{"code": "sh.600001", "pub_date": "2024-04-01"}],
            }
        ],
        "result": {"metrics": {"maximum_drawdown": -0.1, "total_return": 0.2}},
    }
    audit = audit_backtest(
        report,
        {"2024-03-29": [{"code": f"sh.{index:06d}"} for index in range(300)]},
        {"sh.600001": [{"date": "2024-04-01", "close": 10}]},
    )
    assert audit["status"] == "fail"
    assert next(check for check in audit["checks"] if check["id"] == "publication_date")["status"] == "fail"


def test_report_writes_offline_html_and_json(tmp_path):
    report = {
        "strategy": {"name": "EPS20", "rebalance": "月末选股，次日开盘调仓"},
        "period": {"start": "2024-01-01", "end": "2024-02-29"},
        "result": {
            "metrics": {
                "total_return": 0.1,
                "annualized_return": 0.2,
                "benchmark_total_return": 0.05,
                "annualized_excess_return": 0.1,
                "maximum_drawdown": -0.03,
                "sharpe": 1.2,
            },
            "equity_curve": [{"date": "2024-01-01", "equity": 100}, {"date": "2024-02-29", "equity": 110}],
        },
        "audit": {"status": "pass", "checks": [], "summary": "全部通过"},
        "selections": [{"signal_date": "2024-01-31", "universe_count": 300, "factor_count": 300, "stocks": []}],
        "disclaimer": "仅用于研究。",
    }
    write_report(report, tmp_path)
    saved = json.loads((tmp_path / "result.json").read_text())
    rendered = (tmp_path / "report.html").read_text()
    assert saved["artifacts"]["html"] == "report.html"
    assert "EPS20" in rendered
    assert "http://" not in rendered and "https://" not in rendered


def test_westock_basic_eps_builds_ttm_from_cumulative_values():
    rows = [
        {"EndDate": "2025-09-30", "BasicEPS": "51.53"},
        {"EndDate": "2024-12-31", "BasicEPS": "68.64"},
        {"EndDate": "2024-09-30", "BasicEPS": "48.42"},
    ]
    assert round(westock_basic_eps_ttm(rows), 2) == 71.75


def test_westock_bars_normalizes_order_close_and_volume():
    rows = [
        {"date": "2025-01-03", "open": 11, "high": 12, "low": 10, "last": 11.5, "volume": 20, "amount": 2300},
        {"date": "2025-01-02", "open": 10, "high": 11, "low": 9, "last": 10.5, "volume": 10, "amount": 1050},
    ]
    result = normalize_westock_bars(rows, "600519.SH")
    assert [row["date"] for row in result] == ["2025-01-02", "2025-01-03"]
    assert result[0]["close"] == 10.5
    assert result[0]["volume"] == 1000
