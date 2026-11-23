from __future__ import annotations

import csv
import hashlib
import json
import math
import random
import statistics
import time
from collections import Counter, defaultdict
from datetime import date, timedelta
from pathlib import Path
from typing import Any


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def file_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def number(value: Any) -> float | None:
    if value is None or str(value).strip() == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def percentile(values: list[float], q: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    index = (len(ordered) - 1) * q
    lower = math.floor(index)
    upper = math.ceil(index)
    if lower == upper:
        return ordered[lower]
    return ordered[lower] * (upper - index) + ordered[upper] * (index - lower)


def quality_profile(path: Path, _: dict[str, Any]) -> dict[str, Any]:
    rows = read_csv(path)
    fields = list(rows[0]) if rows else []
    columns = {}
    for field in fields:
        values = [row.get(field, "") for row in rows]
        missing = sum(1 for value in values if str(value).strip() == "")
        numeric = [item for item in (number(value) for value in values) if item is not None]
        entry = {
            "missing_count": missing,
            "missing_rate": round(missing / max(1, len(rows)), 6),
            "unique_count": len(set(values)),
            "inferred_type": "numeric" if numeric and len(numeric) >= .95 * (len(values) - missing) else "string",
        }
        if numeric:
            entry.update({
                "min": min(numeric), "p25": percentile(numeric, .25), "median": percentile(numeric, .5),
                "p75": percentile(numeric, .75), "max": max(numeric), "mean": statistics.fmean(numeric)
            })
        columns[field] = entry
    return {"row_count": len(rows), "column_count": len(fields), "columns": columns}


def temporal_pattern(path: Path, params: dict[str, Any]) -> dict[str, Any]:
    rows = read_csv(path)
    object_field = params.get("object_field", "site_id")
    hour_field = params.get("hour_field", "hour")
    metric = params.get("metric", "total_footfall")
    buckets: dict[tuple[str, int], list[float]] = defaultdict(list)
    missing = 0
    for row in rows:
        value = number(row.get(metric))
        hour = number(row.get(hour_field))
        if value is None or hour is None:
            missing += 1
            continue
        buckets[(row[object_field], int(hour))].append(value)
    series = []
    for (object_id, hour), values in sorted(buckets.items()):
        series.append({"object_id": object_id, "hour": hour, "mean": round(statistics.fmean(values), 4), "samples": len(values)})
    peaks = {}
    for item in series:
        current = peaks.get(item["object_id"])
        if current is None or item["mean"] > current["mean"]:
            peaks[item["object_id"]] = item
    return {"metric": metric, "series": series, "peak_hours": peaks, "excluded_missing_rows": missing}


def temporal_anomaly(path: Path, params: dict[str, Any]) -> dict[str, Any]:
    rows = read_csv(path)
    object_field = params.get("object_field", "site_id")
    metric = params.get("metric", "total_footfall")
    quality_field = params.get("quality_field", "data_quality_flag")
    grouped: dict[str, list[tuple[int, float, dict[str, str]]]] = defaultdict(list)
    missing = []
    for index, row in enumerate(rows):
        value = number(row.get(metric))
        if value is None:
            missing.append({"row": index + 2, "object_id": row.get(object_field), "quality_flag": row.get(quality_field, "")})
        else:
            grouped[row.get(object_field, "unknown")].append((index, value, row))
    anomalies = []
    for object_id, items in grouped.items():
        values = [item[1] for item in items]
        q1, q3 = percentile(values, .25), percentile(values, .75)
        iqr = q3 - q1
        upper = q3 + float(params.get("iqr_multiplier", 3.0)) * iqr
        for index, value, row in items:
            if value > upper:
                anomalies.append({"row": index + 2, "object_id": object_id, "value": value, "upper_fence": round(upper, 4), "date": row.get("date"), "hour": row.get("hour"), "quality_flag": row.get(quality_field, "")})
    return {"metric": metric, "missing_rows": missing, "high_anomalies": anomalies[:500], "high_anomaly_count": len(anomalies)}


def mobility_dwell(path: Path, params: dict[str, Any]) -> dict[str, Any]:
    rows = read_csv(path)
    group_field = params.get("group_field", "site_id")
    total_field = params.get("total_field", "total_footfall")
    effective_field = params.get("effective_field", "effective_dwell_visitors")
    target_field = params.get("target_field", "target_audience_est")
    excluded_flags = set(params.get("excluded_quality_flags", ["sensor_outage", "event_outlier"]))
    grouped = defaultdict(lambda: {"total": 0.0, "effective": 0.0, "target": 0.0, "rows": 0, "excluded": 0})
    for row in rows:
        group = row.get(group_field, "unknown")
        if row.get("data_quality_flag") in excluded_flags:
            grouped[group]["excluded"] += 1
            continue
        total, effective, target = number(row.get(total_field)), number(row.get(effective_field)), number(row.get(target_field))
        if total is None or effective is None:
            grouped[group]["excluded"] += 1
            continue
        grouped[group]["total"] += total
        grouped[group]["effective"] += effective
        grouped[group]["target"] += target or 0
        grouped[group]["rows"] += 1
    results = []
    for group, item in sorted(grouped.items()):
        results.append({
            "group": group, "total_footfall": round(item["total"], 2), "effective_dwell_visitors": round(item["effective"], 2),
            "effective_dwell_rate": round(item["effective"] / item["total"], 6) if item["total"] else None,
            "target_share_of_effective": round(item["target"] / item["effective"], 6) if item["effective"] else None,
            "included_rows": item["rows"], "excluded_rows": item["excluded"]
        })
    return {"groups": results, "excluded_quality_flags": sorted(excluded_flags)}


def mobility_od(path: Path, params: dict[str, Any]) -> dict[str, Any]:
    rows = read_csv(path)
    destination_field = params.get("destination_field", "site_id")
    flow_field = params.get("flow_field", "visits_180d")
    grouped = defaultdict(lambda: {"flow": 0.0, "distance": 0.0, "transit": 0.0, "car": 0.0, "origins": set()})
    for row in rows:
        flow = number(row.get(flow_field))
        if flow is None or flow <= 0:
            continue
        group = row.get(destination_field, "unknown")
        item = grouped[group]
        item["flow"] += flow
        item["distance"] += flow * (number(row.get("distance_km")) or 0)
        item["transit"] += flow * (number(row.get("public_transit_share")) or 0)
        item["car"] += flow * (number(row.get("car_share")) or 0)
        item["origins"].add(row.get("origin_grid_id") or row.get("origin_zone_id"))
    return {"destinations": [{
        "destination": group, "flow": round(item["flow"], 2), "origin_count": len(item["origins"]),
        "weighted_distance_km": round(item["distance"] / item["flow"], 4),
        "weighted_public_transit_share": round(item["transit"] / item["flow"], 6),
        "weighted_car_share": round(item["car"] / item["flow"], 6)
    } for group, item in sorted(grouped.items())]}


def audience_mix(path: Path, params: dict[str, Any]) -> dict[str, Any]:
    rows = read_csv(path)
    group_field = params.get("group_field", "site_id")
    segment_field = params.get("segment_field", "segment")
    value_field = params.get("value_field", "estimated_visitors")
    target_segments = set(params.get("target_segments", []))
    grouped: dict[str, Counter] = defaultdict(Counter)
    missing = 0
    for row in rows:
        value = number(row.get(value_field))
        if value is None:
            missing += 1
            continue
        grouped[row.get(group_field, "unknown")][row.get(segment_field, "unknown")] += value
    results = []
    for group, counts in sorted(grouped.items()):
        total = sum(counts.values())
        target = sum(value for segment, value in counts.items() if segment in target_segments)
        results.append({
            "group": group, "total": round(total, 2), "target_total": round(target, 2),
            "target_share": round(target / total, 6) if total else None,
            "segment_shares": {segment: round(value / total, 6) for segment, value in sorted(counts.items())}
        })
    return {"groups": results, "target_segments": sorted(target_segments), "excluded_missing_rows": missing}


def audience_association(path: Path, params: dict[str, Any]) -> dict[str, Any]:
    rows = read_csv(path)
    x_field = params.get("x_field", "segment")
    y_field = params.get("y_field", "category")
    weight_field = params.get("weight_field")
    table: dict[str, Counter] = defaultdict(Counter)
    for row in rows:
        x, y = row.get(x_field, ""), row.get(y_field, "")
        if x and y:
            table[x][y] += number(row.get(weight_field)) if weight_field else 1
    xs, ys = sorted(table), sorted({y for counts in table.values() for y in counts})
    n = sum(sum(table[x].values()) for x in xs)
    row_totals = {x: sum(table[x].values()) for x in xs}
    col_totals = {y: sum(table[x][y] for x in xs) for y in ys}
    chi2 = 0.0
    for x in xs:
        for y in ys:
            expected = row_totals[x] * col_totals[y] / n if n else 0
            if expected > 0:
                chi2 += (table[x][y] - expected) ** 2 / expected
    denominator = n * max(1, min(len(xs) - 1, len(ys) - 1))
    cramers_v = math.sqrt(chi2 / denominator) if denominator else 0
    return {"x_field": x_field, "y_field": y_field, "n": n, "chi_square": round(chi2, 6), "cramers_v": round(cramers_v, 6), "contingency": {x: dict(table[x]) for x in xs}, "evidence_level": "association"}


def commercial_diversity(path: Path, params: dict[str, Any]) -> dict[str, Any]:
    rows = read_csv(path)
    group_field = params.get("group_field", "zone_id")
    category_field = params.get("category_field", "category")
    grouped: dict[str, Counter] = defaultdict(Counter)
    for row in rows:
        group = row.get(group_field, "")
        category = row.get(category_field, "")
        if group and category:
            grouped[group][category] += 1
    results = []
    for group, counts in sorted(grouped.items()):
        total = sum(counts.values())
        shares = [count / total for count in counts.values()]
        entropy = -sum(share * math.log(share) for share in shares if share > 0)
        hhi = sum(share * share for share in shares)
        results.append({
            "group": group, "total_supply": total, "category_count": len(counts),
            "shannon_entropy": round(entropy, 6), "hhi": round(hhi, 6), "category_counts": dict(counts)
        })
    return {"groups": results}


def commercial_supply_gap(demand_path: Path, supply_path: Path, params: dict[str, Any]) -> dict[str, Any]:
    demand_rows, supply_rows = read_csv(demand_path), read_csv(supply_path)
    demand_group = params.get("demand_group_field", "zone_id")
    demand_metric = params.get("demand_metric", "entries")
    supply_group = params.get("supply_group_field", "zone_id")
    demand = defaultdict(float)
    supply = Counter()
    for row in demand_rows:
        value = number(row.get(demand_metric))
        if value is not None:
            demand[row.get(demand_group, "unknown")] += value
    for row in supply_rows:
        supply[row.get(supply_group, "unknown")] += 1
    groups = sorted(set(demand) | set(supply))
    demand_values = [demand[group] for group in groups]
    supply_values = [supply[group] for group in groups]
    demand_mean = statistics.fmean(demand_values) if demand_values else 0
    supply_mean = statistics.fmean(supply_values) if supply_values else 0
    demand_sd = statistics.pstdev(demand_values) or 1
    supply_sd = statistics.pstdev(supply_values) or 1
    results = []
    for group in groups:
        demand_z = (demand[group] - demand_mean) / demand_sd
        supply_z = (supply[group] - supply_mean) / supply_sd
        gap = demand_z - supply_z
        quadrant = "high_demand_low_supply" if demand_z >= 0 and supply_z < 0 else "low_demand_high_supply" if demand_z < 0 and supply_z >= 0 else "balanced_high" if demand_z >= 0 else "balanced_low"
        results.append({"group": group, "demand": round(demand[group], 2), "supply_count": supply[group], "demand_z": round(demand_z, 6), "supply_z": round(supply_z, 6), "gap_index": round(gap, 6), "quadrant": quadrant})
    return {"groups": results, "method": "standardized aggregate demand minus standardized supply count"}


def _decision_score_rows(rows: list[dict[str, str]], params: dict[str, Any]) -> dict[str, Any]:
    id_field = params.get("id_field", "candidate_id")
    metrics = params.get("metrics", [])
    if not metrics:
        raise ValueError("decision.score requires metrics")
    weights = [float(metric["weight"]) for metric in metrics]
    if any(weight < 0 for weight in weights) or sum(weights) <= 0:
        raise ValueError("metric weights must be non-negative with positive total")
    weight_total = sum(weights)
    columns = {metric["field"]: [number(row.get(metric["field"])) for row in rows] for metric in metrics}
    if any(any(value is None for value in values) for values in columns.values()):
        raise ValueError("decision.score does not silently impute missing values")
    results = []
    for row_index, row in enumerate(rows):
        components, total = {}, 0.0
        for metric, weight in zip(metrics, weights):
            values = columns[metric["field"]]
            low, high, value = min(values), max(values), values[row_index]
            normalized = .5 if high == low else (value - low) / (high - low)
            if metric.get("direction", "benefit") == "cost": normalized = 1 - normalized
            normalized_weight = weight / weight_total
            components[metric["field"]] = {"raw": value, "normalized": round(normalized, 6), "weight": round(normalized_weight, 6)}
            total += normalized * normalized_weight
        results.append({"candidate_id": row[id_field], "score": round(total, 6), "components": components})
    results.sort(key=lambda item: item["score"], reverse=True)
    for rank, item in enumerate(results, 1): item["rank"] = rank
    return {"candidates": results, "normalization": "min_max", "weight_source": params.get("weight_source", "user_or_business_default")}


def decision_score(path: Path, params: dict[str, Any]) -> dict[str, Any]:
    return _decision_score_rows(read_csv(path), params)


def decision_stability(path: Path, params: dict[str, Any]) -> dict[str, Any]:
    rows = read_csv(path)
    id_field = params.get("id_field", "candidate_id")
    metrics = params.get("metrics", [])
    iterations = min(int(params.get("iterations", 2000)), 10000)
    rng = random.Random(int(params.get("seed", 20260909)))
    first_place = Counter()
    rank_sums = Counter()
    for _ in range(iterations):
        perturbed = []
        for metric in metrics:
            base = float(metric["weight"])
            spread = float(params.get("weight_perturbation", .20))
            perturbed.append({**metric, "weight": max(.0001, base * rng.uniform(1 - spread, 1 + spread))})
        scored = _decision_score_rows(rows, {"id_field": id_field, "metrics": perturbed, "weight_source": "perturbed"})["candidates"]
        first_place[scored[0]["candidate_id"]] += 1
        for item in scored: rank_sums[item["candidate_id"]] += item["rank"]
    return {"iterations": iterations, "seed": int(params.get("seed", 20260909)), "candidates": [{
        "candidate_id": row[id_field], "first_place_rate": round(first_place[row[id_field]] / iterations, 6), "mean_rank": round(rank_sums[row[id_field]] / iterations, 4)
    } for row in rows]}


def forecast_baseline(path: Path, params: dict[str, Any]) -> dict[str, Any]:
    """Explainable short-horizon forecast with honest backtesting.

    Three familiar baselines compete on a held-out recent window: recent average,
    same-weekday average, and a straight trend. The lowest-MAE method wins per
    group; uncertainty comes from its observed holdout residuals, not invented
    confidence.
    """
    rows = read_csv(path)
    date_field = params.get("date_field", "date")
    group_field = params.get("group_field", "site_id")
    metric = params.get("metric", "total_footfall")
    aggregation = params.get("aggregation", "sum")
    horizon = min(max(int(params.get("horizon_days", 28)), 1), 90)
    holdout = min(max(int(params.get("holdout_days", 28)), 14), 60)
    recent_window = min(max(int(params.get("recent_window_days", 28)), 14), 84)
    grouped: dict[str, dict[date, list[float]]] = defaultdict(lambda: defaultdict(list))
    excluded = 0
    for row in rows:
        value = number(row.get(metric))
        try:
            observed_date = date.fromisoformat(str(row.get(date_field, ""))[:10])
        except ValueError:
            excluded += 1
            continue
        if value is None:
            excluded += 1
            continue
        grouped[row.get(group_field, "all")][observed_date].append(value)

    def aggregate(values: list[float]) -> float:
        if aggregation == "mean":
            return statistics.fmean(values)
        if aggregation != "sum":
            raise ValueError("forecast.baseline aggregation must be sum or mean")
        return sum(values)

    def recent_mean(history: list[tuple[date, float]], target: date) -> float:
        values = [value for _, value in history[-recent_window:]]
        return statistics.fmean(values)

    def weekday_mean(history: list[tuple[date, float]], target: date) -> float:
        values = [value for day, value in history if day.weekday() == target.weekday()][-8:]
        return statistics.fmean(values) if values else recent_mean(history, target)

    def linear_trend(history: list[tuple[date, float]], target: date) -> float:
        window = history[-min(84, len(history)):]
        xs = list(range(len(window)))
        ys = [value for _, value in window]
        x_mean, y_mean = statistics.fmean(xs), statistics.fmean(ys)
        denominator = sum((x - x_mean) ** 2 for x in xs)
        slope = sum((x - x_mean) * (y - y_mean) for x, y in zip(xs, ys)) / denominator if denominator else 0
        days_ahead = (target - window[-1][0]).days
        return max(0.0, y_mean + slope * ((len(window) - 1 + days_ahead) - x_mean))

    methods = {
        "recent_average": ("近期平均", recent_mean),
        "same_weekday": ("同星期规律", weekday_mean),
        "linear_trend": ("近期直线趋势", linear_trend),
    }
    outputs = []
    for group, daily_values in sorted(grouped.items()):
        series = sorted((day, aggregate(values)) for day, values in daily_values.items())
        if len(series) < holdout + 28:
            raise ValueError(f"forecast.baseline {group} 至少需要 {holdout + 28} 个有效日期")
        train, validation = series[:-holdout], series[-holdout:]
        evaluations = {}
        residuals_by_method = {}
        for method_id, (label, predictor) in methods.items():
            residuals = []
            history = list(train)
            for target_day, actual in validation:
                predicted = predictor(history, target_day)
                residuals.append(actual - predicted)
                history.append((target_day, actual))
            mae = statistics.fmean(abs(value) for value in residuals)
            actual_total = sum(abs(value) for _, value in validation)
            evaluations[method_id] = {
                "label": label,
                "holdout_mae": round(mae, 4),
                "holdout_wape": round(sum(abs(value) for value in residuals) / actual_total, 6) if actual_total else None,
            }
            residuals_by_method[method_id] = residuals
        selected = min(evaluations, key=lambda item: evaluations[item]["holdout_mae"])
        predictor = methods[selected][1]
        residuals = residuals_by_method[selected]
        error_band = 1.645 * (statistics.pstdev(residuals) if len(residuals) > 1 else evaluations[selected]["holdout_mae"])
        history = list(series)
        forecasts = []
        for step in range(1, horizon + 1):
            target_day = series[-1][0] + timedelta(days=step)
            predicted = predictor(history, target_day)
            forecasts.append({
                "date": target_day.isoformat(),
                "forecast": round(predicted, 2),
                "lower": round(max(0.0, predicted - error_band), 2),
                "upper": round(predicted + error_band, 2),
            })
            history.append((target_day, predicted))
        recent_actual = statistics.fmean(value for _, value in series[-recent_window:])
        projected = statistics.fmean(item["forecast"] for item in forecasts)
        outputs.append({
            "group": group,
            "selected_method": selected,
            "selected_method_plain_name": methods[selected][0],
            "backtest": evaluations,
            "recent_daily_average": round(recent_actual, 2),
            "forecast_daily_average": round(projected, 2),
            "forecast_change_rate": round(projected / recent_actual - 1, 6) if recent_actual else None,
            "average_lower": round(statistics.fmean(item["lower"] for item in forecasts), 2),
            "average_upper": round(statistics.fmean(item["upper"] for item in forecasts), 2),
            "forecast": forecasts,
        })
    return {
        "metric": metric,
        "aggregation": aggregation,
        "horizon_days": horizon,
        "holdout_days": holdout,
        "groups": outputs,
        "excluded_rows": excluded,
        "plain_language_method": "用最近一段真实数据留作考试，比较近期平均、同星期规律和直线趋势三种常见方法；哪一种在考试期误差最小，就用哪一种向前推演，并用历史误差给出上下范围。",
        "usage_boundary": "这是短期基线推演，假定近期规律大体延续；新开业、重大活动、价格变化、交通调整和竞争变化需要另做情景，不得把预测区间写成承诺。",
        "evidence_level": "model_based_projection",
    }


def pilot_did(path: Path, params: dict[str, Any]) -> dict[str, Any]:
    rows = read_csv(path)
    metric = params.get("metric", "conversion_rate")
    values: dict[tuple[str, str], list[float]] = defaultdict(list)
    for row in rows:
        value = number(row.get(metric))
        if value is not None:
            values[(row["group"], row["period"])].append(value)
    means = {f"{group}_{period}": statistics.fmean(items) for (group, period), items in values.items() if items}
    required = ["treatment_pre", "treatment_post", "control_pre", "control_post"]
    if not all(key in means for key in required):
        raise ValueError(f"DID 缺少分组：{', '.join(key for key in required if key not in means)}")
    treatment_change = means["treatment_post"] - means["treatment_pre"]
    control_change = means["control_post"] - means["control_pre"]
    return {
        "metric": metric,
        "group_means": {key: round(value, 6) for key, value in means.items()},
        "treatment_change": round(treatment_change, 6),
        "control_change": round(control_change, 6),
        "did_estimate": round(treatment_change - control_change, 6),
        "evidence_level": "simulation_demo_only"
    }


def finance_scenario(cost_path: Path, assumption_path: Path, params: dict[str, Any]) -> dict[str, Any]:
    costs = {row["site_id"]: row for row in read_csv(cost_path)}
    assumptions = read_csv(assumption_path)
    results = []
    tax_rate = float(params.get("tax_rate", .06))
    for row in assumptions:
        cost = costs[row["site_id"]]
        price = float(row["ticket_price_cny"])
        sessions = float(row["sessions_per_day"])
        seats = float(row["seats_per_session"])
        occupancy = float(row["occupancy_rate"])
        ancillary = float(row["ancillary_revenue_per_visitor_cny"])
        variable_cost = float(row["variable_cost_per_visitor_cny"])
        visitors = sessions * seats * occupancy * 30.4
        revenue = visitors * (price + ancillary)
        fixed = sum(float(cost[key]) for key in ["monthly_rent_cny", "monthly_property_fee_cny", "monthly_staff_cny", "monthly_marketing_cny"])
        fixed += float(cost["content_update_annual_cny"]) / 12
        depreciation = (float(cost["fitout_cny"]) + float(cost["equipment_cny"])) / 60
        operating_profit = revenue * (1 - tax_rate) - visitors * variable_cost - fixed - depreciation
        contribution = (price + ancillary) * (1 - tax_rate) - variable_cost
        breakeven_visitors = (fixed + depreciation) / contribution if contribution > 0 else None
        results.append({
            "site_id": row["site_id"], "scenario": row["scenario"], "monthly_visitors": round(visitors, 2),
            "monthly_revenue_cny": round(revenue, 2), "monthly_operating_profit_cny": round(operating_profit, 2),
            "breakeven_visitors": round(breakeven_visitors, 2) if breakeven_visitors else None,
            "occupancy_rate": occupancy
        })
    return {"scenarios": results, "assumption_note": "简化经营模型，用于模拟案例流程测试，不代表真实投资建议"}


def finance_monte_carlo(cost_path: Path, assumption_path: Path, params: dict[str, Any]) -> dict[str, Any]:
    costs = {row["site_id"]: row for row in read_csv(cost_path)}
    base_rows = {row["site_id"]: row for row in read_csv(assumption_path) if row["scenario"] == "base"}
    iterations = min(int(params.get("iterations", 10000)), 100000)
    rng = random.Random(int(params.get("seed", 20260909)))
    results = []
    for site_id, row in sorted(base_rows.items()):
        cost = costs[site_id]
        profits = []
        for _ in range(iterations):
            occupancy = clamp(rng.gauss(float(row["occupancy_rate"]), float(params.get("occupancy_sd", .07))), .05, .90)
            price = max(20, rng.gauss(float(row["ticket_price_cny"]), float(params.get("price_sd", 7))))
            rent = float(cost["monthly_rent_cny"]) * rng.uniform(.90, 1.12)
            visitors = float(row["sessions_per_day"]) * float(row["seats_per_session"]) * occupancy * 30.4
            revenue = visitors * (price + float(row["ancillary_revenue_per_visitor_cny"]))
            fixed = rent + sum(float(cost[key]) for key in ["monthly_property_fee_cny", "monthly_staff_cny", "monthly_marketing_cny"]) + float(cost["content_update_annual_cny"]) / 12
            depreciation = (float(cost["fitout_cny"]) + float(cost["equipment_cny"])) / 60
            profits.append(revenue * .94 - visitors * float(row["variable_cost_per_visitor_cny"]) - fixed - depreciation)
        profits.sort()
        results.append({
            "site_id": site_id, "iterations": iterations, "loss_probability": round(sum(value < 0 for value in profits) / iterations, 6),
            "profit_p10": round(percentile(profits, .10), 2), "profit_median": round(percentile(profits, .50), 2), "profit_p90": round(percentile(profits, .90), 2)
        })
    return {"sites": results, "seed": int(params.get("seed", 20260909)), "evidence_level": "simulated_scenario"}


RECIPES = {
    "quality.profile": lambda inputs, params: quality_profile(inputs[0], params),
    "temporal.pattern": lambda inputs, params: temporal_pattern(inputs[0], params),
    "temporal.anomaly": lambda inputs, params: temporal_anomaly(inputs[0], params),
    "mobility.dwell": lambda inputs, params: mobility_dwell(inputs[0], params),
    "mobility.od": lambda inputs, params: mobility_od(inputs[0], params),
    "audience.mix": lambda inputs, params: audience_mix(inputs[0], params),
    "audience.association": lambda inputs, params: audience_association(inputs[0], params),
    "commercial.diversity": lambda inputs, params: commercial_diversity(inputs[0], params),
    "commercial.supply_gap": lambda inputs, params: commercial_supply_gap(inputs[0], inputs[1], params),
    "decision.score": lambda inputs, params: decision_score(inputs[0], params),
    "decision.stability": lambda inputs, params: decision_stability(inputs[0], params),
    "forecast.baseline": lambda inputs, params: forecast_baseline(inputs[0], params),
    "pilot.did": lambda inputs, params: pilot_did(inputs[0], params),
    "finance.scenario": lambda inputs, params: finance_scenario(inputs[0], inputs[1], params),
    "finance.monte_carlo": lambda inputs, params: finance_monte_carlo(inputs[0], inputs[1], params),
}


def run_recipe(recipe: str, inputs: list[Path], params: dict[str, Any] | None = None, producer: str = "unknown") -> dict[str, Any]:
    if recipe not in RECIPES:
        raise ValueError(f"unknown recipe: {recipe}")
    if not inputs or any(not path.is_file() for path in inputs):
        raise ValueError("all recipe inputs must be existing files")
    started = time.perf_counter()
    params = params or {}
    input_artifacts = [{"path": str(path), "sha256": file_hash(path)} for path in inputs]
    cache_payload = {
        "recipe": recipe,
        "producer": producer,
        "input_artifacts": input_artifacts,
        "parameters": params,
        "code_version": "0.2.0",
    }
    cache_key = hashlib.sha256(
        json.dumps(cache_payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    result = RECIPES[recipe](inputs, params)
    return {
        "analysis_run_id": f"AN-{cache_key[:16]}",
        "cache_key": cache_key,
        "recipe": recipe,
        "producer": producer,
        "input_artifacts": input_artifacts,
        "parameters": params,
        "code_version": "0.2.0",
        "data_mode": "simulated" if all("cases" in path.parts for path in inputs) else "mixed",
        "status": "success",
        "duration_ms": int((time.perf_counter() - started) * 1000),
        "result": result,
        "warnings": []
    }


def write_svg_bar(path: Path, labels: list[str], values: list[float], title: str, watermark: str = "模拟数据，仅用于产品演示") -> None:
    width, height = 920, 520
    margin_left, margin_top, chart_width, chart_height = 110, 90, 750, 330
    min_value = min([0.0, *values]) if values else 0.0
    max_value = max([0.0, *values]) if values else 1.0
    span = max_value - min_value or 1.0
    zero_y = margin_top + chart_height * max_value / span
    bar_width = chart_width / max(1, len(values)) * .62
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
        '<rect width="100%" height="100%" fill="#ffffff"/>',
        f'<text x="{margin_left}" y="45" font-family="sans-serif" font-size="24" font-weight="700" fill="#17233d">{title}</text>',
        f'<line x1="{margin_left}" y1="{zero_y:.1f}" x2="{margin_left + chart_width}" y2="{zero_y:.1f}" stroke="#9aa7bd"/>',
    ]
    for index, (label, value) in enumerate(zip(labels, values)):
        x = margin_left + (index + .5) * chart_width / len(values) - bar_width / 2
        value_y = margin_top + chart_height * (max_value - value) / span
        y = min(zero_y, value_y)
        bar_height = max(1.0, abs(zero_y - value_y))
        color = '#5b66d6' if value >= 0 else '#b3261e'
        parts.append(f'<rect x="{x:.1f}" y="{y:.1f}" width="{bar_width:.1f}" height="{bar_height:.1f}" rx="5" fill="{color}"/>')
        label_y = y - 8 if value >= 0 else y + bar_height + 16
        parts.append(f'<text x="{x + bar_width / 2:.1f}" y="{label_y:.1f}" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#34405a">{value:.2f}</text>')
        parts.append(f'<text x="{x + bar_width / 2:.1f}" y="{margin_top + chart_height + 24}" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#34405a">{label}</text>')
    parts.append(f'<text x="{width - 24}" y="{height - 18}" text-anchor="end" font-family="sans-serif" font-size="13" fill="#b3261e">{watermark}</text>')
    parts.append("</svg>")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(parts), encoding="utf-8")
