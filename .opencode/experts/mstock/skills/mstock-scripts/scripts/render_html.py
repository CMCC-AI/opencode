#!/usr/bin/env python3
"""Render 40-comparison-report.html from the template.

Backfills __CH{chapter}_{M}__ body placeholders in 30-visual-report.json with
narrative paragraphs from 20-comparison-report.md, then injects the JSON into
.opencode/templates/report.html.tpl.

Usage: python3 render_html.py <WORKSPACE_DIR>   (run from the project root)
"""
import json
import re
import sys
from pathlib import Path

CH_CLASS = "一二三四五六七"
TERMINATOR = re.compile(r"^(?:##\s*(?:引用来源|参考资料|参考文献)|[#*]+\s*免责声明|---\s*$)", re.M)
CHAPTER_TITLE = re.compile(rf"^##\s*[{CH_CLASS}][、.][^\n]*\n", re.M)
PLACEHOLDER = re.compile(rf"__CH([{CH_CLASS}])_(\d+)__")


def narrative(body: str):
    body = CHAPTER_TITLE.sub("", body)
    out = []
    for seg in re.split(r"\n{2,}", body):
        t = seg.strip()
        if not t:
            continue
        if re.search(r"^###\s*表", t, re.M):
            continue
        if re.search(r"^\|", t, re.M):
            continue
        out.append(t)
    return out


def json_escape(text: str):
    return text.replace("\\", "\\\\").replace('"', '\\"').replace("\r\n", "\\n").replace("\n", "\\n")


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    d = Path(sys.argv[1])
    # Prefer the template shipped next to this script (mstock/ dir layout);
    # fall back to a repo checkout (.opencode/templates/ under cwd).
    template = Path(__file__).resolve().parent.parent / "templates" / "report.html.tpl"
    if not template.is_file():
        template = Path(".opencode/templates/report.html.tpl")
    tpl = template.read_text(encoding="utf-8-sig")
    report_json = (d / "30-visual-report.json").read_text(encoding="utf-8-sig")

    md_path = d / "20-comparison-report.md"
    if md_path.is_file():
        md = md_path.read_text(encoding="utf-8-sig").replace("\r\n", "\n")
        chap_start = {}
        for n in CH_CLASS:
            m = re.search(rf"^##\s*{n}[、.]", md, re.M)
            if m:
                chap_start[n] = m.start()
        order = [n for n in CH_CLASS if n in chap_start]

        for i, n in enumerate(order):
            start = chap_start[n]
            end = chap_start[order[i + 1]] if i + 1 < len(order) else len(md)
            body = md[start:end]
            term = TERMINATOR.search(body)
            if term:
                body = body[: term.start()]
            segs = narrative(body)
            ms = sorted({int(m) for m in re.findall(rf"__CH{re.escape(n)}_(\d+)__", report_json)})
            for j, m in enumerate(ms):
                if j < len(segs):
                    last = j == len(ms) - 1 and len(segs) > len(ms)
                    fill = "\n\n".join(segs[j:]) if last else segs[j]
                else:
                    fill = ""
                report_json = report_json.replace(f"__CH{n}_{m}__", json_escape(fill))

    # Sweep any leftover placeholders so no bare tokens leak into the HTML.
    report_json = PLACEHOLDER.sub("", report_json)

    try:
        report = json.loads(report_json)
    except ValueError:
        report = {}
    title = report.get("title") or "多股投研数据综合对比看板"
    safe = report_json.replace("</script>", "<\\/script>")
    html = tpl.replace("__TITLE__", title).replace("__VISUAL_REPORT_JSON__", safe).replace("__REFERENCES_JSON__", "[]")

    out = d / "40-comparison-report.html"
    out.write_text(html, encoding="utf-8")
    print(f"HTML report: {out} ({out.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
