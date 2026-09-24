---
name: deepinspect-pipeline
description: AI+巡查 后处理脚本集（引用后处理、HTML 渲染、PDF 导出、质量验证）。团长编排流程的 Phase 8b 依赖这些脚本。
---

# AI+巡查 后处理脚本集

本 skill 打包 6 个 Node.js 脚本与 HTML 模板。**脚本与模板的绝对路径以 skill 工具加载本 skill 时返回的 Base directory 为准**（下文用 `<BASE>` 表示），不要自行猜测或拼接路径。

## 脚本清单

### 1. `<BASE>/scripts/render-report.mjs` — 渲染 HTML 报告

```bash
node <BASE>/scripts/render-report.mjs <WORKSPACE_DIR>
```

依次：读取 `20-report.md` + `25-visual-report.json` + `22-references.json` → 填充正文占位符（章号识别中文序号「一、二、…」与数字；无子节的章按段落切分；占位符与章内块数不一致时剩余正文并入最后一个占位符，失配只警告不失败，正文永不丢失）与 after 锚点归位 → **图表闸门**（chart block 携带 viz-specialist 的扁平 `data`，委托仓库级 `chart-builder` 技能校验并组装 ECharts option，蓝灰色系色板：通过则注入 option，不合格则整块丢弃并在输出日志报出标题与原因，渲染不中断；仍自带 `option` 的旧格式 block 原样保留）→ 填充 `<BASE>/templates/report.html.tpl` 的占位符 → 写出 `30-report.html`（并把注入 option 后的可视化 JSON 写回 `25-visual-report.json`）。成功输出 `正文回填：N 个占位符…`、`图表校验：N/M 张通过`、`HTML 报告完成：填充 N 个正文块...`；出现丢弃或未覆盖警告时主理人应退回 viz-specialist 重做对应部分后重渲染。

### 2. `<BASE>/scripts/export-report-pdf.mjs` — 导出 A4 PDF

```bash
node <BASE>/scripts/export-report-pdf.mjs <WORKSPACE_DIR>/30-report.html <WORKSPACE_DIR>/35-report.pdf
```

薄入口，委托仓库级 `report-pdf` 技能的共享导出器：CDP 控制 Chrome/Edge/Chromium 无头浏览器、注入并验证中文字体、执行 pageChecks（正文污染、图表清晰度）通过后打印 A4 PDF。依赖本机 Chrome/Edge/Chromium，缺失时用 `CHROME_PATH` 环境变量指定。

**降级策略**：导出失败（含 pageChecks 未通过）时，修复报告或图表本身后重试一次；仍失败则停止生成正式 PDF，保留 HTML 交付。严禁改用 WeasyPrint、浏览器命令行或其他工具自行导出 PDF；为通过检查而删除图表同样违规，无图交付必须显式告知用户并等待确认。

### 3. `<BASE>/scripts/validate-run.mjs` — 质量验证

```bash
node <BASE>/scripts/validate-run.mjs <WORKSPACE_DIR>
```

校验核验通过、引用门槛、Markdown/HTML/PDF 同步、A4 样式与 PDF 有效性，产出 `40-stats.json`。

### 4. `<BASE>/scripts/lint-report.mjs` — 报告清洁检查

```bash
node <BASE>/scripts/lint-report.mjs <WORKSPACE_DIR>
```

扫描内部编号残留（COMMON-001、R001 等）、内部字段名、未渲染的 Markdown 语法。

### 5. `<BASE>/scripts/postprocess-report.mjs` — 引用后处理

```bash
node <BASE>/scripts/postprocess-report.mjs <WORKSPACE_DIR>
```

将 `<cite>URL</cite>` 转换为 `[1]`、`[2]`... + 末尾"引用来源"章节，产出 `22-references.json`。

### 6. `<BASE>/scripts/audit-consolidation.mjs` — 归并审计

```bash
node <BASE>/scripts/audit-consolidation.mjs <WORKSPACE_DIR>
```

审计问题归并的完整性、冲突检测、统计一致性。

## 文件编码

所有 workspace 文件（`.md`/`.html`/`.json`）用 **UTF-8（无 BOM）** 写入。脚本读取时显式用 `utf-8` 编码。

## 渲染纪律

- 链路为 `20-report.md → 25-visual-report.json → 30-report.html → 35-report.pdf`
- PDF 阶段不重新调用模型写内容
- HTML 渲染失败 → 不阻塞 markdown 报告交付
- 连续两次 PDF 失败则停止生成正式 PDF，保留 HTML 交付
