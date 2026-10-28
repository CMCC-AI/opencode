---
name: mstock-scripts
description: DeepTrading 多股对比中心的后处理脚本集（报告扫描、元数据注入、HTML 看板渲染、A4 PDF 导出、统计验收）。mstock 团长编排流程的阶段 0/4/5 依赖这些脚本。
---

# mstock 后处理脚本

本 skill 打包多股对比流程的 3 个 Python 3 脚本（纯标准库）和 3 个 Node 脚本（图表闸门渲染、PDF 导出、分片组装）与 HTML 模板。**脚本与模板的绝对路径以 skill 工具加载本 skill 时返回的 Base directory 为准**（下文用 `<BASE>` 表示），不要自行猜测或拼接路径。

运行方式：Linux/macOS 用 `python3`，Windows 用 `python`；Node 脚本用 `node`（需 Node.js 18+）。

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

### 3. `<BASE>/scripts/render-report.mjs` — 渲染 HTML 对比看板（薄入口）

```bash
node <BASE>/scripts/render-report.mjs <WORKSPACE_DIR>
```

读取 `30-visual-report.json` + `20-comparison-report.md` → 委托仓库级 `report-render` 引擎：正文占位符回填（章号自动识别中文序号/数字含前导零）+ 图表扁平 data 校验并组装 ECharts option（多股横评紫色系色板；坏图整块丢弃并在日志报出标题与原因）→ 填充 `<BASE>/templates/report.html.tpl`（支持 progress_bar / mini_kpi_row 等额外 block 类型）→ 写出 `40-comparison-report.html`。旧格式带正文/option 的产物原样兼容。

### 4. `<BASE>/scripts/assemble-parts.mjs` — viz 产物分片组装（防掐流，需要时执行）

```bash
node <BASE>/scripts/assemble-parts.mjs <分片目录> <目标> <N> title,subtitle,hero_stats,sections
```

ms-visualizer 产物超过 8KB 时分片写入，由主理人用本脚本解析式组装，禁止文本拼接。

### 5. `<BASE>/scripts/stats.py` — 统计验收

```bash
python3 <BASE>/scripts/stats.py <WORKSPACE_DIR>
```

统计本次对比的耗时、报告汉字数（去引用/URL/表格符号后计 `[\u4e00-\u9fa5]`）、章节数（一~七）、表格行数、标的数，写入 `50-stats.json` 并输出摘要（`标的数 / 耗时 / 报告字数 / 章节数`）。其中"汉字数 ≥2600"是流程硬性质量门，必须以本脚本输出为准。

### 6. `<BASE>/scripts/export-report-pdf.mjs` — 导出 A4 PDF

```bash
node <BASE>/scripts/export-report-pdf.mjs <WORKSPACE_DIR>/40-comparison-report.html <WORKSPACE_DIR>/45-comparison-report.pdf
```

薄入口，委托仓库级 `report-pdf` 技能的共享导出器：CDP 控制 Chrome/Edge/Chromium 无头浏览器、注入并验证中文字体、等待 ECharts 图表渲染完成后打印 A4 PDF。依赖本机 Chrome/Edge/Chromium，缺失时用 `CHROME_PATH` 环境变量指定；缺少可嵌入中文字体时用 `REPORT_PDF_FONT_REGULAR` / `REPORT_PDF_FONT_BOLD` 指定。

## 编码约定

所有 workspace 文件（`.md`/`.html`/`.json`）用 **UTF-8（无 BOM）** 写入。脚本读取时显式用 `utf-8-sig`（兼容历史 BOM 文件），写入用 `utf-8`，无需任何 BOM 处理。
