---
name: mstock-scripts
description: DeepTrading 多股对比中心的后处理脚本集（报告扫描、元数据注入、HTML 看板渲染、统计验收）。mstock 团长编排流程的阶段 0/4/5 依赖这些脚本。
---

# mstock 后处理脚本

本 skill 打包多股对比流程的 4 个 Python 3 脚本（纯标准库）与 HTML 模板。**脚本与模板的绝对路径以 skill 工具加载本 skill 时返回的 Base directory 为准**（下文用 `<BASE>` 表示），不要自行猜测或拼接路径。

运行方式：Linux/macOS 用 `python3`，Windows 用 `python`。

## 脚本清单

### 1. `<BASE>/scripts/scan_reports.py` — 扫描可用个股报告

```bash
python3 <BASE>/scripts/scan_reports.py
```

扫描三个来源（互为补充）：`../deeptrading-oc/tmp/trading-workspace`（仓库布局）、`tmp/trading-workspace`（当前会话）、`~/Documents/DeepInsight`（历史会话根，缺失时从 cwd 向上推导兜底）。递归查找 `30-final-report.md`，从同目录 `00-input.json` 提取公司/代码/日期（json 缺失时从报告首行标题回退提取）。

输出（stdout，UTF-8 JSON）：`{"found": true, "count": N, "reports": [{dir, company, ticker, trade_date, size_kb, mtime}, ...]}`；无报告时 `found: false`。

### 2. `<BASE>/scripts/inject_meta.py` — 注入看板元数据

```bash
python3 <BASE>/scripts/inject_meta.py <WORKSPACE_DIR>
```

读 workspace 的 `00-input.json` 与 `01-sources.json`，把各标的 `company_name` 用 ` vs ` 拼成 `topic`、取 `current_date`，写入 `30-visual-report.json`。成功输出 `Injected topic: <标的列表>`。

### 3. `<BASE>/scripts/render_html.py` — 渲染 HTML 对比看板

```bash
python3 <BASE>/scripts/render_html.py <WORKSPACE_DIR>
```

依次：定位模板（自动取 `<BASE>/templates/report.html.tpl`，与脚本同部署）→ 从 `20-comparison-report.md` 按七章切分回填 `30-visual-report.json` 里的 `__CH{章}_{M}__` 占位符（剔除章标题/表题块/表格行块，段落按序填充，多余并入最后一个占位符）→ 清扫残留 token → 注入模板的 `__TITLE__` / `__VISUAL_REPORT_JSON__` / `__REFERENCES_JSON__`（对比报告用空数组）→ 写出 `40-comparison-report.html`。成功输出 `HTML report: <路径> (<大小> bytes)`。

### 4. `<BASE>/scripts/stats.py` — 统计验收

```bash
python3 <BASE>/scripts/stats.py <WORKSPACE_DIR>
```

统计本次对比的耗时、报告汉字数（去引用/URL/表格符号后计 `[\u4e00-\u9fa5]`）、章节数（一~七）、表格行数、标的数，写入 `50-stats.json` 并输出摘要（`标的数 / 耗时 / 报告字数 / 章节数`）。其中"汉字数 ≥2600"是流程硬性质量门，必须以本脚本输出为准。

## 编码约定

所有 workspace 文件（`.md`/`.html`/`.json`）用 **UTF-8（无 BOM）** 写入。脚本读取时显式用 `utf-8-sig`（兼容历史 BOM 文件），写入用 `utf-8`，无需任何 BOM 处理。
