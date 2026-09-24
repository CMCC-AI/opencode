from __future__ import annotations

import argparse
import json
from pathlib import Path

from .engine import run_recipe, write_svg_bar


def main() -> None:
    parser = argparse.ArgumentParser(description="DeepGeo deterministic analytics CLI")
    sub = parser.add_subparsers(dest="command", required=True)
    run = sub.add_parser("run")
    run.add_argument("--recipe", required=True)
    run.add_argument("--input", action="append", type=Path, required=True)
    run.add_argument("--params", default="{}")
    run.add_argument("--producer", default="unknown")
    run.add_argument("--output", type=Path, required=True)
    chart = sub.add_parser("chart")
    chart.add_argument("--labels", required=True, help="JSON string array")
    chart.add_argument("--values", required=True, help="JSON number array")
    chart.add_argument("--title", required=True)
    chart.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    if args.command == "run":
        result = run_recipe(args.recipe, args.input, json.loads(args.params), args.producer)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({"status": "success", "output": str(args.output), "duration_ms": result["duration_ms"]}, ensure_ascii=False))
    else:
        write_svg_bar(args.output, json.loads(args.labels), [float(v) for v in json.loads(args.values)], args.title)
        print(json.dumps({"status": "success", "output": str(args.output)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
