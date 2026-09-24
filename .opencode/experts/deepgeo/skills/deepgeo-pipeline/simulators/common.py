from __future__ import annotations

import csv
import hashlib
import json
import math
import random
from datetime import date, timedelta
from pathlib import Path
from typing import Iterable, Sequence


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def daterange(start: date, days: int) -> Iterable[date]:
    for offset in range(days):
        yield start + timedelta(days=offset)


def seasonal(day_index: int, period: int = 365, amplitude: float = 0.15, phase: float = 0.0) -> float:
    return 1.0 + amplitude * math.sin((2 * math.pi * day_index / period) + phase)


def weighted_choice(rng: random.Random, items: Sequence, weights: Sequence[float]):
    total = sum(weights)
    point = rng.random() * total
    cumulative = 0.0
    for item, weight in zip(items, weights):
        cumulative += weight
        if point <= cumulative:
            return item
    return items[-1]


def write_csv(path: Path, fieldnames: list[str], rows: Iterable[dict]) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    count = 0
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)
            count += 1
    return count


def write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def build_manifest(root: Path, scenario: str, seed: int, version: str, row_counts: dict[str, int]) -> dict:
    files = []
    for path in sorted(root.glob("*.csv")):
        files.append({
            "path": str(path.relative_to(root)),
            "bytes": path.stat().st_size,
            "sha256": sha256(path),
            "rows": row_counts.get(path.name, 0),
            "data_mode": "simulated",
        })
    return {
        "scenario": scenario,
        "dataset_version": version,
        "generator_version": "1.0.0",
        "seed": seed,
        "data_mode": "simulated",
        "contains_personal_trajectories": False,
        "files": files,
    }
