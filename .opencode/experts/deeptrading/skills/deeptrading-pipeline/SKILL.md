---
name: deeptrading-pipeline
description: DeepTrading A股投研专家团 后处理脚本集（HTML 渲染、PDF 导出）。团长编排流程的 Phase 6/7 依赖这些脚本。
---

# DeepTrading 后处理脚本集

本 skill 打包 3 个 Node.js 脚本与 HTML 模板。**脚本与模板的绝对路径以 skill 工具加载本 skill 时返回的 Base directory 为准**（下文用 `<BASE>` 表示），不要自行猜测或拼接路径。

## 脚本清单

### 0. `<BASE>/scripts/finalize-report.mjs` — 引用编号后处理（Phase 5 之后、dt-viz 之前执行）

```bash
node <BASE>/scripts/finalize-report.mjs <WORKSPACE_DIR>
```

把 `30-final-report.md` 里所有 `<cite>URL</cite>` 按首次出现顺序替换为 `[1]`、`[2]`...，并在文末追加「## 引用来源」章节（`N. [标题](URL)`）。标题优先取 `25-sources.json` 登记的来源元数据，缺失时用域名+路径兜底并在输出中告警。正文既无 `<cite>` 也无引用来源章节时直接报错，不允许无引用交付。幂等，重复执行不会产生重复章节。成功输出 `引用后处理完成：<N> 个独立 URL 已编号`。

### 1. `<BASE>/scripts/render-report.mjs` — 渲染 HTML 报告

```bash
node <BASE>/scripts/render-report.mjs <WORKSPACE_DIR>
```

依次：读取 `35-visual-report.json` 与 `30-final-report.md` → **正文占位符回填**（markdown block 只放 `__CH{N}_{M}__`，脚本按 `## ` 章节切分、段落切分并回填；表格段剥离由 table block 承载；段落数多于占位符时并入最后一个，正文永不丢失，`[N]` 引用标记自动保留；旧格式带正文的产物原样兼容）→ 从 `30-final-report.md` 末尾「## 引用来源」章节解析参考文献 → **引用闸门校验**（每条必须有真实标题且非裸 URL；每个编号必须在正文有 `[N]` 标记；正文不得残留 `<cite>` 中间格式；违反即报错中止）→ **图表闸门**（chart block 携带 dt-viz 的扁平 `data`，委托仓库级 `chart-builder` 技能校验并组装 ECharts option：通过则注入 option，不合格则整块丢弃并在输出日志报出标题与原因，渲染不中断；仍自带 `option` 的旧格式 block 原样保留）→ 填充 `<BASE>/templates/report.html.tpl` 的占位符（`__TITLE__` / `__VISUAL_REPORT_JSON__` / `__REFERENCES_JSON__`）→ 写出 `40-report.html`。成功输出 `正文回填：N 个占位符…`、`图表校验：N/M 张通过`、`HTML 报告完成：<路径>` 与参考文献条数；出现图表丢弃时主理人应责令 dt-viz 按契约重做图表数据后重渲染。

### 2. `<BASE>/scripts/export-report-pdf.mjs` — 导出 A4 PDF

```bash
node <BASE>/scripts/export-report-pdf.mjs <WORKSPACE_DIR>/40-report.html <WORKSPACE_DIR>/45-report.pdf
```

委托仓库级 `report-pdf` 技能，通过 CDP 控制 Chromium 无头浏览器，显式加载并校验中文字体，等待图表渲染完成后打印 A4 PDF。依赖本机 Chrome/Edge/Chromium，缺失时用 `CHROME_PATH` 环境变量指定；缺少中文字体时会停止导出并给出安装或环境变量提示。

## 文件编码

所有 workspace 文件（`.md`/`.html`/`.json`）用 **UTF-8（无 BOM）** 写入。脚本读取时显式用 `utf-8` 编码。

## 渲染纪律

- 链路为 `30-final-report.md + 25-sources.json → finalize-report.mjs（<cite>→[N]+引用来源）→ 35-visual-report.json → 40-report.html → 45-report.pdf`
- **必须先跑 finalize-report.mjs 再渲染**，否则 HTML/PDF 的参考文献区为空
- PDF 阶段不重新调用模型写内容
- HTML 渲染失败 → 不阻塞 markdown 报告交付
