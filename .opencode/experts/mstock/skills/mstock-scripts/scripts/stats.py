#!/usr/bin/env python3
"""Write 50-stats.json with run statistics for a comparison workspace.

Usage: python3 stats.py <WORKSPACE_DIR>
"""
import json
import re
import sys
from datetime import datetime
from pathlib import Path


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    d = Path(sys.argv[1])

    def read(name):
        return json.loads((d / name).read_text(encoding="utf-8-sig"))

    # 1. Duration (creation time is not portable; 00-input.json is written first)
    start = (d / "00-input.json").stat().st_mtime
    files = [p for p in d.iterdir() if p.is_file()]
    end = max(p.stat().st_mtime for p in files)
    duration_sec = int(round(end - start))
    duration_min = round(duration_sec / 60, 1)

    # 2. Chinese character count of the comparison report
    md = (d / "20-comparison-report.md").read_text(encoding="utf-8-sig")
    clean = re.sub(r"\[\d+\]", "", md)
    clean = re.sub(r"https?://[^)\s]+", "", clean)
    clean = re.sub(r"[#|>`*_\-\[\]()]", " ", clean)
    chinese_chars = len(re.findall(r"[\u4e00-\u9fa5]", clean))

    # 3. Chapter count
    section_count = sum(1 for ch in ("一、", "二、", "三、", "四、", "五、", "六、", "七、") if ch in md)

    # 4. Table rows (rough: lines starting with |)
    table_count = len(re.findall(r"^\|", md, re.M))

    # 5. Targets
    sources = read("01-sources.json")
    inp = read("00-input.json")
    names = [r["company_name"] for r in sources["reports"]]

    stats = {
        "workspace": d.name,
        "targets": " vs ".join(names),
        "target_count": len(names),
        "comparison_date": inp["current_date"],
        "duration_seconds": duration_sec,
        "duration_minutes": duration_min,
        "comparison_report_chinese_chars": chinese_chars,
        "chapter_count": section_count,
        "table_count": table_count,
    }
    (d / "50-stats.json").write_text(json.dumps(stats, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Stats written to {d / '50-stats.json'}")
    print(f"  标的数:      {stats['target_count']}")
    print(f"  耗时:        {duration_min} 分钟")
    print(f"  报告字数:    {chinese_chars} 汉字")
    print(f"  章节数:      {section_count} / 7")


if __name__ == "__main__":
    main()
