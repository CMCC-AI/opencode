---
name: report-pdf
description: Export HTML reports to PDF with deterministic CJK font loading, browser readiness checks, and embedded-font verification. Use for any expert-team HTML-to-PDF delivery.
---

# 统一 PDF 报告导出

使用 `scripts/export-report-pdf.mjs` 导出专家团生成的 HTML 报告。脚本通过 CDP pipe 兼容 Node.js 18+，会显式加载当前平台的中文字体、等待页面与字体完成渲染，并在打印前确认真实中文节点使用了该字体；验证失败时停止生成，避免交付方框字 PDF。

```bash
node scripts/export-report-pdf.mjs <input.html> [output.pdf]
```

可通过以下环境变量覆盖默认行为：

- `REPORT_PDF_FONT_REGULAR`：常规中文字体文件绝对路径。
- `REPORT_PDF_FONT_BOLD`：粗体中文字体文件绝对路径；省略时复用常规字体。
- `REPORT_PDF_FONT_FAMILY`：字体的系统 family 名称。
- `REPORT_PDF_HEADER_LABEL`、`REPORT_PDF_FOOTER_LABEL`：页眉页脚标签，只允许 ASCII；中文静态信息应放在报告正文中。
- `CHROME_PATH`：Chrome、Edge 或 Chromium 可执行文件路径。

已有专家团可保留自己的 `export-report-pdf.mjs` 入口，但入口只能配置文件名和品牌文字，渲染逻辑统一委托给本脚本。新增专家团不要复制 CDP 导出实现。

入口可通过 `pageChecks` 注册团队特有的导出前闸门：数组，每项 `{ name, expression }`；`expression` 为在页面上求值的 JS 表达式（通常是 IIFE，返回问题数组或字符串），在中文字体注入并验证之后、打印之前执行，返回非空结果即中止导出。适合正文污染检查、图表标签质量检查等业务校验。

PDF 导出成功不替代视觉验收。正式交付前仍需渲染全部页面，检查文字、图表、分页和页眉页脚。
