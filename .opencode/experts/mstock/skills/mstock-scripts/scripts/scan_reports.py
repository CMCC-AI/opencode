#!/usr/bin/env python3
"""Scan all three report sources and emit a JSON inventory to stdout.

Sources:
  1. ../deeptrading-oc/tmp/trading-workspace  (repo checkout layout)
  2. tmp/trading-workspace                    (current conversation)
  3. ~/Documents/DeepInsight                  (conversation history root;
     fallback: derive from cwd pattern <root>/<YYYY-MM-DD>/conversation-*)
"""
import json
import re
import sys
from datetime import datetime
from pathlib import Path

TITLE_RE = re.compile(r"^#*\s*(.+?)[（(]([0-9A-Za-z.]+)")


def walk_reports(root: Path, max_depth: int = 5):
    out = []
    stack = [(root, 0)]
    while stack:
        cur, depth = stack.pop()
        if (cur / "30-final-report.md").is_file():
            out.append(cur)
        if depth >= max_depth:
            continue
        try:
            children = sorted(cur.iterdir())
        except OSError:
            continue
        for child in children:
            if child.is_dir():
                stack.append((child, depth + 1))
    return out


def main():
    dirs = []
    for rel in ("../deeptrading-oc/tmp/trading-workspace", "tmp/trading-workspace"):
        p = Path(rel)
        if p.is_dir():
            dirs += [d for d in p.iterdir() if d.is_dir()]

    hist = Path.home() / "Documents" / "DeepInsight"
    if not hist.is_dir():
        parent = Path.cwd().parent
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", parent.name):
            hist = parent.parent
    if hist.is_dir():
        dirs += walk_reports(hist)

    results = []
    for d in sorted({d.resolve() for d in dirs}):
        report = d / "30-final-report.md"
        if not report.is_file():
            continue
        company = ticker = trade_date = ""
        meta = d / "00-input.json"
        if meta.is_file():
            try:
                data = json.loads(meta.read_text(encoding="utf-8-sig"))
                company = str(data.get("company_name") or "")
                ticker = str(data.get("ticker") or "")
                trade_date = str(data.get("trade_date") or "")
            except (OSError, ValueError):
                pass
        if not company and not ticker:
            try:
                first = report.read_text(encoding="utf-8-sig").splitlines()[0]
                m = TITLE_RE.match(first)
                if m:
                    company, ticker = m.group(1), m.group(2)
            except (OSError, IndexError):
                pass
        st = report.stat()
        results.append(
            {
                "dir": str(d),
                "company": company,
                "ticker": ticker,
                "trade_date": trade_date,
                "size_kb": round(st.st_size / 1024, 1),
                "mtime": datetime.fromtimestamp(st.st_mtime).strftime("%Y-%m-%d %H:%M"),
            }
        )

    payload = {"found": bool(results), "count": len(results), "reports": results}
    sys.stdout.reconfigure(encoding="utf-8")
    print(json.dumps(payload, ensure_ascii=False))


if __name__ == "__main__":
    main()
