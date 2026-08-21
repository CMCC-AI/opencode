#!/usr/bin/env python3
"""Inject topic / current_date metadata into 30-visual-report.json.

Usage: python3 inject_meta.py <WORKSPACE_DIR>
"""
import json
import sys
from pathlib import Path


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    d = Path(sys.argv[1])

    def read(name):
        return json.loads((d / name).read_text(encoding="utf-8-sig"))

    inp = read("00-input.json")
    sources = read("01-sources.json")
    visual_path = d / "30-visual-report.json"
    visual = read("30-visual-report.json")
    visual["topic"] = " vs ".join(r["company_name"] for r in sources["reports"])
    visual["current_date"] = inp["current_date"]
    visual_path.write_text(json.dumps(visual, ensure_ascii=False, indent=2), encoding="utf-8")
    print("Injected topic:", visual["topic"])


if __name__ == "__main__":
    main()
