from __future__ import annotations

import argparse
import math
import random
from datetime import date
from pathlib import Path

from .common import build_manifest, clamp, daterange, seasonal, write_csv, write_json


SEGMENTS = ["young_couples", "students", "families", "office_workers", "tourists", "others"]
POI_TYPES = ["restaurant", "cafe", "family", "cinema", "arcade", "vr_xr", "retail", "education", "fitness", "transit"]


SITES = [
    {"site_id": "SITE-A", "name": "星港中心", "tier": "city_core", "x": 0.8, "y": 0.6, "footfall": 1.28, "young": .82, "family": .58, "transit": .91, "synergy": .82, "competition": .78, "cost": 1.48, "pass_through": .18, "area": 920, "floor": 5},
    {"site_id": "SITE-B", "name": "云澜广场", "tier": "regional", "x": 3.2, "y": 1.4, "footfall": 1.08, "young": .86, "family": .72, "transit": .84, "synergy": .91, "competition": .52, "cost": .96, "pass_through": .10, "area": 880, "floor": 4},
    {"site_id": "SITE-C", "name": "枢纽汇", "tier": "transit_hub", "x": 5.8, "y": 0.8, "footfall": 1.22, "young": .64, "family": .43, "transit": .98, "synergy": .50, "competition": .43, "cost": 1.08, "pass_through": .46, "area": 760, "floor": 6},
    {"site_id": "SITE-D", "name": "亲子里", "tier": "community", "x": 1.6, "y": 4.2, "footfall": .88, "young": .58, "family": .94, "transit": .67, "synergy": .76, "competition": .28, "cost": .73, "pass_through": .08, "area": 820, "floor": 3},
    {"site_id": "SITE-E", "name": "湖畔天地", "tier": "leisure", "x": 4.4, "y": 4.8, "footfall": .96, "young": .76, "family": .66, "transit": .62, "synergy": .85, "competition": .44, "cost": .91, "pass_through": .09, "area": 980, "floor": 2},
    {"site_id": "SITE-F", "name": "东城悦坊", "tier": "regional", "x": 7.0, "y": 3.7, "footfall": 1.01, "young": .70, "family": .61, "transit": .80, "synergy": .67, "competition": .69, "cost": 1.02, "pass_through": .17, "area": 700, "floor": 5},
    {"site_id": "SITE-G", "name": "创智天地", "tier": "office", "x": 8.2, "y": 1.6, "footfall": .92, "young": .79, "family": .31, "transit": .76, "synergy": .60, "competition": .35, "cost": .88, "pass_through": .31, "area": 740, "floor": 4},
    {"site_id": "SITE-H", "name": "南湾生活城", "tier": "community", "x": 6.8, "y": 6.0, "footfall": .78, "young": .55, "family": .75, "transit": .55, "synergy": .58, "competition": .18, "cost": .61, "pass_through": .06, "area": 860, "floor": 3},
]


def hour_weight(hour: int, weekend: bool, pass_through: float) -> float:
    lunch = math.exp(-((hour - 12.5) ** 2) / 9)
    evening = math.exp(-((hour - 19.0) ** 2) / 10)
    commute = math.exp(-((hour - 8.0) ** 2) / 2.5) + math.exp(-((hour - 18.0) ** 2) / 3)
    daytime = 0.15 if 10 <= hour <= 21 else 0.025
    return daytime + (0.34 if weekend else 0.22) * lunch + 0.58 * evening + pass_through * 0.42 * commute


def weather_for(rng: random.Random) -> tuple[str, float]:
    value = rng.random()
    if value < .08:
        return "heavy_rain", .73
    if value < .25:
        return "light_rain", .90
    if value < .32:
        return "hot", .94
    return "clear", 1.0


def generate(output_root: Path, seed: int = 20260909, fixtures_root: Path | None = None) -> dict:
    rng = random.Random(seed)
    root = output_root / "xr-cinema"
    input_dir = root
    fixture_dir = (fixtures_root / "xr-cinema") if fixtures_root else (root / ".test-fixtures")
    acceptance_dir = fixture_dir / "acceptance"
    root.mkdir(parents=True, exist_ok=True)
    acceptance_dir.mkdir(parents=True, exist_ok=True)
    row_counts: dict[str, int] = {}

    site_rows = []
    for site in SITES:
        site_rows.append({
            "site_id": site["site_id"], "site_name": site["name"], "mall_tier": site["tier"],
            "longitude": round(113.90 + site["x"] * .012, 6), "latitude": round(22.48 + site["y"] * .010, 6),
            "available_area_sqm": site["area"], "floor": site["floor"],
            "metro_distance_m": int(180 + (1 - site["transit"]) * 1500),
            "parking_spaces": int(320 + site["family"] * 850),
            "opening_hours": "10:00-22:00", "data_mode": "simulated"
        })
    row_counts["xr_sites.csv"] = write_csv(input_dir / "xr_sites.csv", list(site_rows[0]), site_rows)

    start = date(2026, 1, 1)
    hourly_rows = []
    audience_rows = []
    daily_weather = {}
    for day_index, current in enumerate(daterange(start, 180)):
        weekend = current.weekday() >= 5
        holiday = day_index in set(range(44, 51)) | set(range(120, 124))
        weather, weather_factor = weather_for(rng)
        daily_weather[current.isoformat()] = weather
        season_factor = seasonal(day_index, 365, .09, -.7)
        for site in SITES:
            event = "immersive_festival" if day_index == 92 and site["site_id"] == "SITE-A" else "none"
            event_factor = 2.35 if event != "none" else 1.0
            weekend_factor = 1.28 if weekend else 1.0
            holiday_factor = 1.35 if holiday else 1.0
            weights = [hour_weight(hour, weekend, site["pass_through"]) for hour in range(24)]
            weight_sum = sum(weights)
            base_daily = 22500 * site["footfall"] * weekend_factor * holiday_factor * season_factor * weather_factor
            segment_weights = {
                "young_couples": 0.14 + .17 * site["young"] + (.04 if weekend else 0),
                "students": 0.08 + .12 * site["young"],
                "families": 0.08 + .21 * site["family"] + (.07 if weekend else 0),
                "office_workers": 0.22 + .12 * site["pass_through"] - (.08 if weekend else 0),
                "tourists": 0.07 + (.04 if holiday else 0),
                "others": 0.20,
            }
            segment_total = sum(segment_weights.values())
            daily_segment_counts = {key: int(base_daily * value / segment_total) for key, value in segment_weights.items()}
            for segment in SEGMENTS:
                count = daily_segment_counts[segment]
                missing = rng.random() < .018
                audience_rows.append({
                    "site_id": site["site_id"], "date": current.isoformat(), "segment": segment,
                    "estimated_visitors": "" if missing else count,
                    "share": "" if missing else round(count / max(1, sum(daily_segment_counts.values())), 5),
                    "avg_dwell_minutes": round(34 + site["synergy"] * 28 + (10 if segment == "families" else 0) + rng.gauss(0, 3), 2),
                    "visit_frequency_30d": round(clamp(1.1 + site["pass_through"] * 4 + rng.gauss(0, .25), .5, 6), 2),
                    "data_quality_flag": "missing_profile" if missing else "ok", "data_mode": "simulated"
                })
            for hour, weight in enumerate(weights):
                sensor_gap = site["site_id"] == "SITE-F" and 70 <= day_index <= 72
                expected = base_daily * weight / weight_sum * event_factor
                total = max(0, int(expected * rng.lognormvariate(0, .075)))
                mall_entries = int(total * clamp(.72 - site["pass_through"] * .60 + rng.gauss(0, .015), .30, .88))
                dwell_ratio = clamp(.24 + .30 * site["synergy"] - .27 * site["pass_through"] + (.05 if weekend else 0), .12, .62)
                dwellers = int(mall_entries * dwell_ratio)
                target_ratio = clamp(.16 + .22 * site["young"] + .12 * site["family"] + (.04 if 17 <= hour <= 21 else 0), .18, .62)
                random_missing = rng.random() < .012
                hourly_rows.append({
                    "site_id": site["site_id"], "date": current.isoformat(), "hour": hour,
                    "total_footfall": "" if sensor_gap else total,
                    "mall_entries": "" if sensor_gap else mall_entries,
                    "effective_dwell_visitors": "" if sensor_gap or random_missing else dwellers,
                    "target_audience_est": "" if sensor_gap or random_missing else int(dwellers * target_ratio),
                    "avg_dwell_minutes": "" if sensor_gap else round(22 + 35 * site["synergy"] - 14 * site["pass_through"] + rng.gauss(0, 2.2), 2),
                    "is_weekend": int(weekend), "is_holiday": int(holiday), "weather": weather,
                    "event_type": event, "data_quality_flag": "sensor_outage" if sensor_gap else ("partial_missing" if random_missing else ("event_outlier" if event != "none" else "ok")),
                    "data_mode": "simulated"
                })
    row_counts["xr_hourly_footfall.csv"] = write_csv(input_dir / "xr_hourly_footfall.csv", list(hourly_rows[0]), hourly_rows)
    row_counts["xr_audience_mix.csv"] = write_csv(input_dir / "xr_audience_mix.csv", list(audience_rows[0]), audience_rows)

    od_rows = []
    for origin in range(1, 121):
        ox, oy = rng.uniform(-1, 10), rng.uniform(-1, 8)
        population = int(rng.lognormvariate(8.2, .45))
        for site in SITES:
            distance = math.dist((ox, oy), (site["x"], site["y"])) * 2.1 + .4
            attraction = site["footfall"] * (1 + .35 * site["synergy"]) / ((distance + 1) ** 1.35)
            visits = int(population * attraction * rng.uniform(.08, .14))
            transit_share = clamp(.25 + .48 * site["transit"] - .025 * distance + rng.gauss(0, .03), .08, .82)
            od_rows.append({
                "origin_grid_id": f"GRID-{origin:03d}", "site_id": site["site_id"], "origin_population": population,
                "visits_180d": visits, "distance_km": round(distance, 2),
                "public_transit_share": round(transit_share, 4), "car_share": round(clamp(.70 - transit_share + .05 * site["family"], .10, .75), 4),
                "estimated_travel_minutes": round(8 + distance * (3.4 - site["transit"]), 1), "data_mode": "simulated"
            })
    row_counts["xr_origin_od.csv"] = write_csv(input_dir / "xr_origin_od.csv", list(od_rows[0]), od_rows)

    poi_rows = []
    for index in range(600):
        site = SITES[index % len(SITES)]
        poi_type = rng.choices(POI_TYPES, weights=[18, 9, 8, 4, 5, 2, 22, 8, 8, 6], k=1)[0]
        distance = max(35, int(rng.expovariate(1 / 850)))
        price_level = rng.choice([1, 2, 2, 3, 3, 4])
        synergy = {"restaurant": .75, "cafe": .65, "family": .78, "cinema": .45, "arcade": .72, "vr_xr": .15, "retail": .42, "education": .35, "fitness": .25, "transit": .55}[poi_type]
        poi_rows.append({
            "poi_id": f"POI-{index + 1:04d}", "nearest_site_id": site["site_id"], "poi_type": poi_type,
            "brand_tier": rng.choice(["independent", "regional", "national"]), "distance_m": distance,
            "popularity_index": round(clamp(rng.gauss(58 + 18 * site["synergy"], 14), 5, 100), 2),
            "price_level": price_level, "business_hours": "10:00-22:00", "xr_synergy_prior": synergy,
            "data_mode": "simulated"
        })
    row_counts["xr_poi.csv"] = write_csv(input_dir / "xr_poi.csv", list(poi_rows[0]), poi_rows)

    competitor_rows = []
    competitor_types = ["traditional_cinema", "vr_arcade", "immersive_theatre", "escape_room"]
    for index in range(20):
        site = SITES[index % 8]
        competitor_rows.append({
            "competitor_id": f"COMP-{index + 1:03d}", "nearest_site_id": site["site_id"],
            "competitor_type": competitor_types[index % len(competitor_types)], "distance_m": int(rng.uniform(180, 4800)),
            "ticket_price_cny": rng.choice([58, 68, 88, 98, 128, 158]), "rating": round(rng.uniform(3.6, 4.8), 1),
            "capacity": rng.randint(24, 240), "months_open": rng.randint(3, 96),
            "competitive_pressure": round(clamp(site["competition"] * rng.uniform(.72, 1.18), .1, 1), 3), "data_mode": "simulated"
        })
    row_counts["xr_competitors.csv"] = write_csv(input_dir / "xr_competitors.csv", list(competitor_rows[0]), competitor_rows)

    cost_rows = []
    assumption_rows = []
    for site in SITES:
        monthly_rent = int(site["area"] * 165 * site["cost"])
        cost_rows.append({
            "site_id": site["site_id"], "monthly_rent_cny": monthly_rent, "monthly_property_fee_cny": int(site["area"] * 28),
            "fitout_cny": int(site["area"] * rng.uniform(3200, 4100)), "equipment_cny": int(rng.uniform(3_600_000, 4_600_000)),
            "monthly_staff_cny": int(rng.uniform(150_000, 205_000)), "monthly_marketing_cny": int(rng.uniform(65_000, 110_000)),
            "content_update_annual_cny": int(rng.uniform(780_000, 1_150_000)), "data_mode": "simulated"
        })
        demand_factor = (.68 + .16 * site["young"] + .12 * site["family"] + .14 * site["synergy"] - .18 * site["pass_through"]) * (.72 + .28 * site["footfall"])
        for scenario, occupancy, price in [("conservative", .32, 88), ("base", .58, 98), ("optimistic", .70, 108)]:
            assumption_rows.append({
                "site_id": site["site_id"], "scenario": scenario, "ticket_price_cny": price,
                "sessions_per_day": 11, "seats_per_session": 42, "occupancy_rate": round(clamp(occupancy * demand_factor, .16, .78), 4),
                "ancillary_revenue_per_visitor_cny": 13, "variable_cost_per_visitor_cny": 18,
                "projection_months": 36, "annual_discount_rate": .08, "data_mode": "simulated"
            })
    row_counts["xr_property_costs.csv"] = write_csv(input_dir / "xr_property_costs.csv", list(cost_rows[0]), cost_rows)
    row_counts["xr_finance_assumptions.csv"] = write_csv(input_dir / "xr_finance_assumptions.csv", list(assumption_rows[0]), assumption_rows)

    online_rows = []
    for month_index in range(6):
        month = f"2026-{month_index + 1:02d}"
        for site in SITES:
            online_rows.append({
                "site_id": site["site_id"], "month": month,
                "wechat_posts": int(clamp(4 + 15 * site["synergy"] + 6 * site["young"] + rng.gauss(0, 1.4), 0, 30)),
                "wechat_avg_reads": int(clamp(500 + 3800 * site["footfall"] * (.7 + .3 * site["young"]) + rng.gauss(0, 260), 120, 9000)),
                "mini_program_users": int(clamp(12000 * site["footfall"] * (.5 + .65 * site["synergy"]) + rng.gauss(0, 900), 1500, 40000)),
                "online_campaigns": int(clamp(.6 + 2.8 * site["synergy"] * site["young"] + rng.gauss(0, .5), 0, 6)),
                "data_mode": "simulated"
            })
    row_counts["xr_online_presence.csv"] = write_csv(input_dir / "xr_online_presence.csv", list(online_rows[0]), online_rows)

    dictionary = {
        "data_mode": "simulated",
        "spatial_note": "坐标为虚构城市中的模拟坐标，不对应真实商业体",
        "tables": {
            "xr_sites.csv": "八个虚构候选商业综合体及场地条件",
            "xr_hourly_footfall.csv": "180 天逐小时聚合客流，含天气、节假日、活动和质量标志",
            "xr_audience_mix.csv": "点位、日期和六类客群的聚合画像，含 30 天到访频次（visit_frequency_30d，经过型点位更高，用于客群活跃度与新鲜度分析）",
            "xr_origin_od.csv": "120 个来源网格至八个点位的聚合 OD",
            "xr_poi.csv": "候选点周边六百个模拟 POI",
            "xr_competitors.csv": "二十个直接或间接竞品",
            "xr_property_costs.csv": "场地与运营成本",
            "xr_finance_assumptions.csv": "三类财务情景假设",
            "xr_online_presence.csv": "八个候选商场近六个月公众号发文、篇均阅读、小程序月活和线上活动投入，用于线上运营投入度评估"
        }
    }
    brief = {
        "case_id": "DG-XR-DEMO-001",
        "title": "虚构城市 XR 沉浸式影院八点位选址",
        "data_mode": "simulated",
        "decision_request": "比较八个商业综合体候选点，形成优先洽谈点、主题化备选点、不推荐点、财务边界和签约前验证清单。",
        "target_audience": ["young_couples", "students", "families"],
        "analysis_period": {"start": "2026-01-01", "days": 180},
        "must_cover": [
            "总客流与有效停留客流", "目标客群时段匹配", "交通与来源覆盖", "POI 协同与竞品压力",
            "商场线上运营投入度", "综合评分及权重稳定性", "可解释预测、留出期回测与预测范围",
            "保守基准乐观财务情景", "进入条件与现场验证"
        ],
        "network_authorized": False,
        "release_scope": "internal_demo_artifacts_only",
        "external_distribution_authorized": False,
        "required_outputs": ["markdown", "html", "pdf", "publication_charts", "story_outline", "clean_delivery"],
        "prohibited_claims": ["模拟结果代表真实投资收益", "客流最高等于选址最优", "活动异常代表稳定需求"]
    }
    write_json(root / "case.json", {"brief": brief, "data_dictionary": dictionary})
    truth = {
        "scenario": "xr_cinema",
        "not_for_agent_input": True,
        "expected_patterns": [
            {"id": "XR-T1", "pattern": "SITE-A 总客流高但租金压力和竞争压力显著，不应机械列为最优"},
            {"id": "XR-T2", "pattern": "SITE-B 在目标客群、娱乐协同和成本之间最均衡，是风险调整后的预设优选"},
            {"id": "XR-T3", "pattern": "SITE-C 可达性强但通勤经过型客流比例高，有效停留不足"},
            {"id": "XR-T4", "pattern": "SITE-D 周末亲子客群突出，适合作为亲子主题备选"},
            {"id": "XR-T5", "pattern": "SITE-A 第 93 天异常峰值来自沉浸节活动，不能外推为稳定需求"},
            {"id": "XR-T6", "pattern": "SITE-F 存在连续三天传感器采集断点"},
            {"id": "XR-T7", "pattern": "SITE-H 公众号阅读量与小程序月活为八个候选中最低，线上运营投入不足，签约前需验证商场线上导流与配合能力"}
        ],
        "preferred_site": "SITE-B",
        "conditional_alternative": "SITE-D"
    }
    write_json(acceptance_dir / "truth_ledger.json", truth)
    manifest = build_manifest(root, "xr_cinema", seed, "xr-1.1.0", row_counts)
    write_json(fixture_dir / "manifest.json", manifest)
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=Path("../cases"))
    parser.add_argument("--fixtures", type=Path, default=Path("tests/fixtures/cases"))
    parser.add_argument("--seed", type=int, default=20260909)
    args = parser.parse_args()
    manifest = generate(args.output, args.seed, args.fixtures)
    print(f"generated xr-cinema: {sum(item['rows'] for item in manifest['files'])} rows")


if __name__ == "__main__":
    main()
