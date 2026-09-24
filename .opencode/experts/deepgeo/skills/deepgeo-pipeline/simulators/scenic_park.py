from __future__ import annotations

import argparse
import math
import random
from datetime import date, timedelta
from pathlib import Path

from .common import build_manifest, clamp, daterange, seasonal, weighted_choice, write_csv, write_json


ZONES = [
    {"zone_id": "ZONE-01", "name": "迎宾入口", "type": "entrance", "x": 0.5, "y": 3.0, "draw": 1.20, "dwell": 22, "capacity": 4200},
    {"zone_id": "ZONE-02", "name": "林荫主道", "type": "corridor", "x": 1.8, "y": 3.1, "draw": 1.02, "dwell": 18, "capacity": 3600},
    {"zone_id": "ZONE-03", "name": "云台核心景点", "type": "attraction", "x": 3.2, "y": 4.0, "draw": 1.38, "dwell": 52, "capacity": 2800},
    {"zone_id": "ZONE-04", "name": "山谷演艺区", "type": "show", "x": 4.6, "y": 4.3, "draw": 1.12, "dwell": 68, "capacity": 2200},
    {"zone_id": "ZONE-05", "name": "童梦亲子区", "type": "family", "x": 3.8, "y": 2.2, "draw": 1.04, "dwell": 61, "capacity": 2400},
    {"zone_id": "ZONE-06", "name": "镜湖休闲区", "type": "leisure", "x": 5.7, "y": 2.4, "draw": .91, "dwell": 47, "capacity": 1900},
    {"zone_id": "ZONE-07", "name": "远山步道", "type": "trail", "x": 6.7, "y": 4.8, "draw": .72, "dwell": 39, "capacity": 1200},
    {"zone_id": "ZONE-08", "name": "百味食集", "type": "food", "x": 5.2, "y": 5.5, "draw": .96, "dwell": 55, "capacity": 2100},
    {"zone_id": "ZONE-09", "name": "松风休憩区", "type": "rest", "x": 4.1, "y": 6.2, "draw": .76, "dwell": 43, "capacity": 1500},
    {"zone_id": "ZONE-10", "name": "非遗文化街", "type": "culture", "x": 2.6, "y": 6.0, "draw": .89, "dwell": 49, "capacity": 1900},
    {"zone_id": "ZONE-11", "name": "归程出口区", "type": "exit", "x": 1.2, "y": 5.5, "draw": 1.08, "dwell": 20, "capacity": 3300},
    {"zone_id": "ZONE-12", "name": "南门备用区", "type": "secondary", "x": 7.2, "y": 1.5, "draw": .52, "dwell": 24, "capacity": 1000},
]

SEGMENTS = ["local_family", "nonlocal_family", "young_couples", "student_group", "senior_group", "tour_group", "outdoor_enthusiast", "cultural_visitor"]
CATEGORIES = ["beverage", "quick_meal", "restaurant", "souvenir", "cultural_creative", "family", "outdoor", "convenience", "visitor_service"]

EDGES = {
    "ZONE-01": ["ZONE-02", "ZONE-10"], "ZONE-02": ["ZONE-03", "ZONE-05"],
    "ZONE-03": ["ZONE-04", "ZONE-05", "ZONE-09"], "ZONE-04": ["ZONE-07", "ZONE-08"],
    "ZONE-05": ["ZONE-06", "ZONE-03"], "ZONE-06": ["ZONE-08", "ZONE-12"],
    "ZONE-07": ["ZONE-08"], "ZONE-08": ["ZONE-09", "ZONE-11"],
    "ZONE-09": ["ZONE-10", "ZONE-11"], "ZONE-10": ["ZONE-11"],
    "ZONE-11": [], "ZONE-12": ["ZONE-06", "ZONE-11"]
}


def park_hour_weight(hour: int, zone_type: str) -> float:
    arrival = math.exp(-((hour - 9.5) ** 2) / 3.5)
    lunch = math.exp(-((hour - 12.5) ** 2) / 4)
    afternoon = math.exp(-((hour - 15.0) ** 2) / 8)
    exit_peak = math.exp(-((hour - 17.5) ** 2) / 3)
    show_peak = math.exp(-((hour - 14.0) ** 2) / 2.2) + .7 * math.exp(-((hour - 18.0) ** 2) / 2)
    base = .02 if hour < 7 or hour > 21 else .10
    if zone_type == "entrance": return base + .95 * arrival + .15 * afternoon
    if zone_type == "exit": return base + .18 * lunch + .95 * exit_peak
    if zone_type == "food": return base + .75 * lunch + .38 * exit_peak
    if zone_type == "show": return base + .78 * show_peak
    return base + .22 * arrival + .34 * lunch + .68 * afternoon + .20 * exit_peak


def daily_context(rng: random.Random, current: date, index: int) -> dict:
    weekend = current.weekday() >= 5
    holiday = index in set(range(42, 50)) | set(range(120, 125)) | set(range(272, 280))
    value = rng.random()
    if value < .07: weather, weather_factor = "heavy_rain", .56
    elif value < .22: weather, weather_factor = "light_rain", .82
    elif value < .31: weather, weather_factor = "hot", .83
    else: weather, weather_factor = "clear", 1.0
    event = "valley_music_show" if index in {103, 104, 225} else ("family_festival" if index in {160, 161} else "none")
    return {"date": current.isoformat(), "weekend": weekend, "holiday": holiday, "weather": weather, "weather_factor": weather_factor, "event": event}


def shop_blueprint() -> list[dict]:
    specs = [
        ("ZONE-01", "souvenir", 4, "09:00", "20:30"), ("ZONE-01", "visitor_service", 1, "08:00", "19:00"),
        ("ZONE-02", "beverage", 1, "09:00", "18:30"), ("ZONE-02", "convenience", 1, "09:00", "19:00"),
        ("ZONE-03", "souvenir", 1, "09:30", "18:00"), ("ZONE-03", "cultural_creative", 1, "10:00", "18:00"),
        ("ZONE-04", "beverage", 1, "10:00", "19:00"), ("ZONE-04", "cultural_creative", 1, "10:00", "18:30"),
        ("ZONE-05", "family", 1, "09:30", "18:00"), ("ZONE-05", "souvenir", 1, "10:00", "18:00"),
        ("ZONE-06", "beverage", 1, "10:00", "18:00"), ("ZONE-06", "outdoor", 1, "09:30", "18:00"),
        ("ZONE-07", "outdoor", 1, "09:00", "17:00"), ("ZONE-07", "convenience", 1, "09:00", "17:00"),
        ("ZONE-08", "restaurant", 2, "10:30", "19:30"), ("ZONE-08", "quick_meal", 1, "10:00", "19:00"), ("ZONE-08", "beverage", 2, "10:00", "19:30"),
        ("ZONE-09", "beverage", 1, "10:00", "18:00"), ("ZONE-09", "convenience", 1, "10:00", "18:00"),
        ("ZONE-10", "cultural_creative", 2, "09:30", "18:30"), ("ZONE-10", "souvenir", 1, "09:30", "18:30"),
        ("ZONE-11", "souvenir", 1, "09:30", "18:00"), ("ZONE-11", "beverage", 1, "10:00", "18:00"),
        ("ZONE-12", "convenience", 1, "10:00", "17:30")
    ]
    shops, index = [], 1
    for zone_id, category, count, opening, closing in specs:
        for _ in range(count):
            shops.append({"shop_id": f"SHOP-{index:03d}", "zone_id": zone_id, "category": category, "opening": opening, "closing": closing})
            index += 1
    assert len(shops) == 30
    return shops


def generate(output_root: Path, seed: int = 20260909, fixtures_root: Path | None = None) -> dict:
    rng = random.Random(seed + 17)
    root = output_root / "scenic-park"
    input_dir = root
    fixture_dir = (fixtures_root / "scenic-park") if fixtures_root else (root / ".test-fixtures")
    acceptance_dir = fixture_dir / "acceptance"
    root.mkdir(parents=True, exist_ok=True)
    acceptance_dir.mkdir(parents=True, exist_ok=True)
    row_counts: dict[str, int] = {}
    start = date(2025, 1, 1)

    zone_rows = [{
        "zone_id": z["zone_id"], "zone_name": z["name"], "zone_type": z["type"], "area_sqm": int(7800 + z["capacity"] * 2.6),
        "capacity_people": z["capacity"], "distance_from_main_entrance_m": int(math.dist((.5, 3.0), (z["x"], z["y"])) * 420),
        "x_coord": z["x"], "y_coord": z["y"], "shade_index": round(clamp(.62 + rng.gauss(0, .18), .15, .95), 2),
        "seating_capacity": int(35 + rng.random() * 120), "data_mode": "simulated"
    } for z in ZONES]
    row_counts["park_zones.csv"] = write_csv(input_dir / "park_zones.csv", list(zone_rows[0]), zone_rows)

    contexts = [daily_context(rng, current, index) for index, current in enumerate(daterange(start, 365))]
    event_rows = []
    for ctx in contexts:
        event_rows.append({
            "date": ctx["date"], "weather": ctx["weather"], "is_weekend": int(ctx["weekend"]), "is_holiday": int(ctx["holiday"]),
            "park_event": ctx["event"], "maintenance_zone": "ZONE-06" if ctx["date"] in {"2025-07-14", "2025-07-15", "2025-07-16"} else "",
            "data_mode": "simulated"
        })
    row_counts["park_events.csv"] = write_csv(input_dir / "park_events.csv", list(event_rows[0]), event_rows)

    hourly_rows = []
    segment_rows = []
    for day_index, ctx in enumerate(contexts):
        current = date.fromisoformat(ctx["date"])
        season_factor = seasonal(day_index, 365, .24, -.9)
        calendar_factor = (1.32 if ctx["weekend"] else 1.0) * (1.48 if ctx["holiday"] else 1.0)
        park_total = 17600 * season_factor * calendar_factor * ctx["weather_factor"] * rng.lognormvariate(0, .06)
        for zone in ZONES:
            weights = [park_hour_weight(hour, zone["type"]) for hour in range(24)]
            weight_sum = sum(weights)
            event_factor = 1.0
            if ctx["event"] == "valley_music_show" and zone["zone_id"] in {"ZONE-04", "ZONE-08"}: event_factor = 1.75
            if ctx["event"] == "family_festival" and zone["zone_id"] == "ZONE-05": event_factor = 1.65
            if ctx["weather"] in {"heavy_rain", "light_rain"} and zone["type"] in {"food", "culture"}: event_factor *= 1.18
            daily_zone = park_total * zone["draw"] * .39 * event_factor
            for hour, weight in enumerate(weights):
                entries = max(0, int(daily_zone * weight / weight_sum * rng.lognormvariate(0, .08)))
                queue_penalty = 1.0
                if zone["zone_id"] == "ZONE-04" and hour in {13, 14, 17, 18}: queue_penalty = 1.55
                avg_dwell = max(5, zone["dwell"] * queue_penalty * rng.uniform(.90, 1.10))
                occupancy = entries * avg_dwell / 60
                crowding = occupancy / zone["capacity"]
                sensor_gap = zone["zone_id"] == "ZONE-07" and 202 <= day_index <= 204
                missing_dwell = rng.random() < .011
                hourly_rows.append({
                    "zone_id": zone["zone_id"], "date": ctx["date"], "hour": hour,
                    "entries": "" if sensor_gap else entries, "exits": "" if sensor_gap else max(0, int(entries * rng.uniform(.82, 1.08))),
                    "average_occupancy": "" if sensor_gap else round(occupancy, 2),
                    "avg_dwell_minutes": "" if sensor_gap or missing_dwell else round(avg_dwell, 2),
                    "crowding_index": "" if sensor_gap else round(crowding, 4),
                    "weather": ctx["weather"], "park_event": ctx["event"],
                    "data_quality_flag": "sensor_outage" if sensor_gap else ("partial_missing" if missing_dwell else "ok"),
                    "data_mode": "simulated"
                })
            segment_base = {
                "local_family": .13, "nonlocal_family": .14, "young_couples": .16, "student_group": .10,
                "senior_group": .11, "tour_group": .15, "outdoor_enthusiast": .09, "cultural_visitor": .12
            }
            if zone["type"] == "family": segment_base["local_family"] += .13; segment_base["nonlocal_family"] += .11
            if zone["type"] == "culture": segment_base["cultural_visitor"] += .15; segment_base["senior_group"] += .07
            if zone["type"] == "trail": segment_base["outdoor_enthusiast"] += .22
            if ctx["weekend"]: segment_base["local_family"] += .05; segment_base["student_group"] += .03
            total_weight = sum(segment_base.values())
            for segment, value in segment_base.items():
                visitors = int(daily_zone * value / total_weight)
                segment_rows.append({
                    "zone_id": zone["zone_id"], "date": ctx["date"], "segment": segment,
                    "estimated_visitors": visitors, "share": round(value / total_weight, 5),
                    "repeat_visit_rate": round(clamp(.08 + (.16 if segment.startswith("local") else 0) + rng.gauss(0, .015), .02, .36), 4),
                    "app_preference_score": round(clamp(rng.gauss(.52 + (.08 if segment in {"young_couples", "student_group"} else 0), .13), .05, .95), 4),
                    "data_mode": "simulated"
                })
    row_counts["park_hourly_footfall.csv"] = write_csv(input_dir / "park_hourly_footfall.csv", list(hourly_rows[0]), hourly_rows)
    row_counts["park_segments.csv"] = write_csv(input_dir / "park_segments.csv", list(segment_rows[0]), segment_rows)

    zone_map = {z["zone_id"]: z for z in ZONES}
    od_rows = []
    for ctx in contexts:
        for origin in ZONES:
            destinations = [z["zone_id"] for z in ZONES if z["zone_id"] != origin["zone_id"]]
            for destination_id in destinations:
                destination = zone_map[destination_id]
                direct = destination_id in EDGES[origin["zone_id"]]
                distance = math.dist((origin["x"], origin["y"]), (destination["x"], destination["y"]))
                weight = destination["draw"] * (1.0 if direct else .08) / ((distance + .5) ** 1.15)
                flow = int((520 if ctx["weekend"] else 390) * weight * ctx["weather_factor"] * rng.uniform(.72, 1.28))
                od_rows.append({
                    "date": ctx["date"], "origin_zone_id": origin["zone_id"], "destination_zone_id": destination_id,
                    "visitor_flows": flow, "estimated_walk_minutes": round(3 + distance * 4.2, 1),
                    "path_type": "direct" if direct else "indirect", "data_mode": "simulated"
                })
    row_counts["park_zone_od.csv"] = write_csv(input_dir / "park_zone_od.csv", list(od_rows[0]), od_rows)

    shops = shop_blueprint()
    shop_rows = []
    base_prices = {"beverage": 24, "quick_meal": 42, "restaurant": 92, "souvenir": 68, "cultural_creative": 118, "family": 78, "outdoor": 136, "convenience": 32, "visitor_service": 25}
    for shop in shops:
        area = rng.randint(24, 150) if shop["category"] != "restaurant" else rng.randint(110, 260)
        shop["area_sqm"] = area
        shop["avg_ticket"] = round(base_prices[shop["category"]] * rng.uniform(.84, 1.18), 2)
        shop["quality"] = rng.uniform(.78, 1.18)
        shop_rows.append({
            "shop_id": shop["shop_id"], "shop_name": f"模拟{shop['category']}-{shop['shop_id'][-2:]}", "zone_id": shop["zone_id"],
            "category": shop["category"], "area_sqm": area, "monthly_rent_cny": int(area * rng.uniform(95, 210)),
            "opening_time": shop["opening"], "closing_time": shop["closing"], "seats": rng.randint(0, 56) if shop["category"] in {"restaurant", "quick_meal", "beverage"} else 0,
            "staff_count": rng.randint(2, 10), "data_mode": "simulated"
        })
    row_counts["park_shops.csv"] = write_csv(input_dir / "park_shops.csv", list(shop_rows[0]), shop_rows)

    zone_demand = {z["zone_id"]: z["draw"] for z in ZONES}
    shop_weights = []
    for shop in shops:
        scarcity_bonus = 1.0
        if shop["zone_id"] == "ZONE-03" and shop["category"] in {"beverage", "quick_meal"}: scarcity_bonus = 1.8
        if shop["zone_id"] == "ZONE-05" and shop["category"] in {"quick_meal", "beverage"}: scarcity_bonus = 1.7
        if shop["zone_id"] == "ZONE-01" and shop["category"] == "souvenir": scarcity_bonus = .68
        shop_weights.append(zone_demand[shop["zone_id"]] * shop["quality"] * scarcity_bonus)
    day_weights = []
    for index, ctx in enumerate(contexts):
        day_weights.append(seasonal(index, 365, .24, -.9) * (1.32 if ctx["weekend"] else 1) * (1.48 if ctx["holiday"] else 1) * ctx["weather_factor"])

    def transaction_rows():
        for order_index in range(200_000):
            day_index = weighted_choice(rng, list(range(365)), day_weights)
            ctx = contexts[day_index]
            shop = weighted_choice(rng, shops, shop_weights)
            zone = zone_map[shop["zone_id"]]
            open_hour = int(shop["opening"].split(":")[0])
            close_hour = int(shop["closing"].split(":")[0])
            hours = list(range(open_hour, max(open_hour + 1, close_hour)))
            hour_weights = [park_hour_weight(hour, "exit" if zone["type"] == "exit" else ("food" if shop["category"] in {"restaurant", "quick_meal", "beverage"} else zone["type"])) for hour in hours]
            hour = weighted_choice(rng, hours, hour_weights)
            segment = rng.choices(SEGMENTS, weights=[15, 16, 18, 10, 9, 13, 8, 11], k=1)[0]
            match = 1.0
            if shop["category"] == "family" and "family" in segment: match = 1.30
            if shop["category"] == "cultural_creative" and segment in {"cultural_visitor", "young_couples"}: match = 1.20
            if shop["category"] == "outdoor" and segment == "outdoor_enthusiast": match = 1.35
            if shop["zone_id"] == "ZONE-04": match *= .82  # 排队使长停留不等于高消费
            amount = max(5, shop["avg_ticket"] * match * rng.lognormvariate(-.03, .28))
            discount = rng.choice([0, 0, 0, 5, 8, 10, 15])
            yield {
                "order_id": f"ORDER-{order_index + 1:07d}", "date": ctx["date"], "hour": hour,
                "shop_id": shop["shop_id"], "zone_id": shop["zone_id"], "category": shop["category"], "segment": segment,
                "amount_cny": round(amount, 2), "discount_cny": discount, "party_size": rng.choices([1, 2, 3, 4, 5], weights=[21, 39, 18, 16, 6], k=1)[0],
                "data_mode": "simulated"
            }
    transaction_fields = ["order_id", "date", "hour", "shop_id", "zone_id", "category", "segment", "amount_cny", "discount_cny", "party_size", "data_mode"]
    row_counts["park_transactions.csv"] = write_csv(input_dir / "park_transactions.csv", transaction_fields, transaction_rows())

    feedback_rows = []
    for month in range(1, 13):
        for zone in ZONES:
            queue_issue = zone["zone_id"] == "ZONE-04"
            supply_issue = zone["zone_id"] in {"ZONE-03", "ZONE-05"}
            feedback_rows.append({
                "month": f"2025-{month:02d}", "zone_id": zone["zone_id"], "responses": rng.randint(180, 620),
                "rating": round(clamp(rng.gauss(4.15 - (.38 if queue_issue else 0) - (.22 if supply_issue else 0), .12), 2.8, 4.8), 2),
                "avg_wait_minutes": round(rng.uniform(18, 34) if queue_issue else rng.uniform(3, 13), 1),
                "price_perception_score": round(clamp(rng.gauss(3.7, .25), 2.6, 4.5), 2),
                "top_need": "shorter_queue" if queue_issue else ("quick_refreshment" if supply_issue else rng.choice(["shade", "seating", "wayfinding", "variety"])),
                "data_mode": "simulated"
            })
    row_counts["park_feedback.csv"] = write_csv(input_dir / "park_feedback.csv", list(feedback_rows[0]), feedback_rows)

    pilot_rows = []
    pilot_start = date(2025, 9, 1)
    for offset in range(56):
        period = "pre" if offset < 28 else "post"
        current = pilot_start + timedelta(days=offset)
        weekend = current.weekday() >= 5
        for zone_id, group in [("ZONE-05", "treatment"), ("ZONE-09", "control")]:
            footfall = int((1450 if zone_id == "ZONE-05" else 1180) * (1.25 if weekend else 1) * random.Random(seed + offset * 11 + (1 if group == "treatment" else 2)).uniform(.90, 1.10))
            base_conversion = .058 if zone_id == "ZONE-05" else .055
            intervention = .020 if group == "treatment" and period == "post" else 0
            conversion = clamp(base_conversion + intervention + rng.gauss(0, .004), .02, .12)
            pilot_rows.append({
                "date": current.isoformat(), "zone_id": zone_id, "group": group, "period": period,
                "intervention": "drink_pop_up_and_extended_hours" if group == "treatment" and period == "post" else "none",
                "effective_footfall": footfall, "orders": int(footfall * conversion), "conversion_rate": round(conversion, 5),
                "avg_ticket_cny": round(34 + (3 if intervention != "none" else 0) + rng.gauss(0, 1.8), 2),
                "data_mode": "simulated", "trial_status": "simulated_demo_only"
            })
    row_counts["park_pilot_daily.csv"] = write_csv(input_dir / "park_pilot_daily.csv", list(pilot_rows[0]), pilot_rows)

    dictionary = {
        "data_mode": "simulated",
        "spatial_note": "分区、名称和坐标均为虚构，不对应真实景区",
        "tables": {
            "park_zones.csv": "十二个虚构功能分区",
            "park_hourly_footfall.csv": "365 天分区逐小时客流、停留和拥挤度",
            "park_zone_od.csv": "每日完整分区 OD 矩阵",
            "park_segments.csv": "八类游客在分区和日期上的聚合画像，含复游率（repeat_visit_rate，本地客群更高，用于活跃度分析）",
            "park_shops.csv": "三十家模拟商铺与营业配置",
            "park_transactions.csv": "二十万笔模拟交易",
            "park_events.csv": "天气、节假日、活动和维护",
            "park_feedback.csv": "分区月度聚合反馈",
            "park_pilot_daily.csv": "明确标识为模拟的处理组与对照组试点"
        }
    }
    brief = {
        "case_id": "DG-PARK-DEMO-001",
        "title": "虚构景区十二分区客流与商铺布局优化",
        "data_mode": "simulated",
        "decision_request": "识别客流、停留、路径、商铺供给和交易之间的错配，形成保留、迁移、替换、试点四类建议和真实上线后的评估方案。",
        "analysis_period": {"start": "2025-01-01", "days": 365},
        "must_cover": [
            "分区与时段客流", "主要路径与流失", "长停留与拥堵区分", "游客与品类关联边界",
            "商铺供需和营业时间", "四类调整方案", "模拟试点 DID 与真实试点设计",
            "可解释预测、留出期回测与预测范围"
        ],
        "network_authorized": False,
        "release_scope": "internal_demo_artifacts_only",
        "external_distribution_authorized": False,
        "required_outputs": ["markdown", "html", "pdf", "publication_charts", "story_outline", "clean_delivery"],
        "prohibited_claims": ["模拟试点代表真实改造收益", "偏好标签直接导致消费", "排队停留等于消费意愿"]
    }
    write_json(root / "case.json", {"brief": brief, "data_dictionary": dictionary})
    truth = {
        "scenario": "scenic_park", "not_for_agent_input": True,
        "expected_patterns": [
            {"id": "PARK-T1", "pattern": "ZONE-03 核心景点持续高客流，但快速饮品和补给供给不足"},
            {"id": "PARK-T2", "pattern": "ZONE-01 纪念品商铺过度集中且同质化"},
            {"id": "PARK-T3", "pattern": "ZONE-05 家庭游客停留长，但缺少简餐与休息配套"},
            {"id": "PARK-T4", "pattern": "ZONE-11 离园高峰晚于现有商铺关门时间，存在营业时段错配"},
            {"id": "PARK-T5", "pattern": "ZONE-04 长停留主要受演出排队驱动，不能解释成高消费意愿"},
            {"id": "PARK-T6", "pattern": "偏好标签与高客单文创只有弱关联，不支持整体换店"},
            {"id": "PARK-T7", "pattern": "模拟试点中处理组后期转化改善，但只能用于展示 DID 流程"},
            {"id": "PARK-T8", "pattern": "ZONE-07 存在连续三天采集断点"}
        ]
    }
    write_json(acceptance_dir / "truth_ledger.json", truth)
    manifest = build_manifest(root, "scenic_park", seed, "park-1.0.0", row_counts)
    write_json(fixture_dir / "manifest.json", manifest)
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=Path("../cases"))
    parser.add_argument("--fixtures", type=Path, default=Path("tests/fixtures/cases"))
    parser.add_argument("--seed", type=int, default=20260909)
    args = parser.parse_args()
    manifest = generate(args.output, args.seed, args.fixtures)
    print(f"generated scenic-park: {sum(item['rows'] for item in manifest['files'])} rows")


if __name__ == "__main__":
    main()
