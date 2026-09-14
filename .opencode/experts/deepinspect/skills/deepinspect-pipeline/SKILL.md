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

依次：读取 `20-report.md` + `25-visual-report.json` + `22-references.json` → 填充 `<BASE>/templates/report.html.tpl` 的占位符 → 写出 `30-report.html`。成功输出 `HTML 报告完成：填充 N 个正文块...`。

### 2. `<BASE>/scripts/export-report-pdf.mjs` — 导出 A4 PDF

```bash
node <BASE>/scripts/export-report-pdf.mjs <WORKSPACE_DIR>/30-report.html <WORKSPACE_DIR>/35-report.pdf
```

通过 CDP 协议控制 Chromium 无头浏览器，等待图表渲染完成后打印 A4 PDF。依赖本机 Chrome/Edge/Chromium，缺失时用 `CHROME_PATH` 环境变量指定。

**降级策略**：Chromium snap 版本权限受限时，自动切换到 WeasyPrint（Python）。

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
