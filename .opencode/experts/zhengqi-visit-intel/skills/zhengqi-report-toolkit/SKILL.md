---
name: zhengqi-report-toolkit
description: Deterministic report toolkit for the Zhengqi visit intelligence team. Manages numbered workspace files, citation finalization, formal-language linting, China Mobile blue-tone HTML rendering, PDF export and structural validation for executive visit decision reports.
---

# 谈参高拜报告工具链

本 skill 为「政企拜访智囊团」提供确定性的报告后处理工具链。它不调用模型、不生成内容，只负责：引用编号与参考文献生成、成品表达清洁检查、HTML 渲染、PDF 导出与结构验收。所有命令幂等可重复，失败即停止并输出审计文件，不会静默修改报告。

## 何时使用

- 报告写作完成、需要把 `<cite>` 中间引用转换为 `[N]` 编号与参考文献章节时；
- 交付前需要拦截过程语言、内部术语、空值叙述、提示词泄漏时；
- 需要把可视化 JSON 渲染为中国移动蓝色系 A4 版式 HTML/PDF 时。

## Workspace 文件契约

编号化工作目录结构与各阶段输入输出契约见 `references/workspace-contract.md`。**调度团队成员前必须先读该契约**，按契约传递文件路径与任务变量。

## 命令一览

以下 `<workspace_dir>` 均为编号化工作目录（内含 00～40 号文件），工具链位于本 skill 的 `scripts/` 目录：

```bash
# 1. 成品表达清洁门（写作后、核验前运行；未通过先定向修订再重跑）
node scripts/lint-report.mjs <workspace_dir>
# 产出 23-presentation-audit.json；连续两次失败则停止生成正式 PDF

# 2. 确定性引用后处理（证据核验通过后运行）
node scripts/finalize-citations.mjs <workspace_dir>
# <cite> → [N]，追加 ## 参考文献；未知来源会失败并写 22-citation-audit.json，不修改报告

# 3. HTML 渲染（可视化 JSON 就绪后运行）
node scripts/render-report.mjs <workspace_dir>
# 用 templates/report.html.tpl + report-print.css 生成 30-report.html

# 4. PDF 导出（HTML 成功后运行；需要 Chrome/Edge/Chromium，可用 CHROME_PATH 指定）
node scripts/export-report-pdf.mjs <workspace_dir>/30-report.html <workspace_dir>/35-report.pdf

# 5. 结构验收（交付前运行）
node scripts/validate-run.mjs <workspace_dir>
# 校验核验通过、引用门槛、Markdown/HTML/PDF 同步、A4 样式与 PDF 有效性，产出 40-stats.json
```

## 引用与参考文献门槛

- 写作期使用 `<cite>internal:SRC-001</cite>` 与 `<cite>https://真实URL</cite>`；由 finalize-citations.mjs 确定性编号，模型不得自行发明 `[N]`。
- 已读取内部材料少于 10 条时，公开来源不少于 12 条；达到 10 条时不少于 6 条；参考文献总量不少于 15 条；重复转载不得凑数。
- 内部参考文献使用适合正式阅读的中文名称，不得暴露文件扩展名、内部编号或机器路径。

## 渲染与 PDF 纪律

- 链路为 `20-report.md → 25-visual-report.json → 30-report.html → 35-report.pdf`，PDF 阶段不重新调用模型写内容。
- 打印样式使用 A4 与中国移动蓝色体系（#0066cc）；封面、目录、正文、表格、图表、参考文献及页眉页脚构成完整正式报告。
- `validate-run.mjs` 通过只是结构验收；正式交付前必须把 PDF 所有页面渲染成图片逐页检查（无文字截断、元素重叠、空白异常、孤行标题、图表缺失、分页失衡）。

## 注意事项

- 脚本要求 Node.js 18+（使用了原生 fetch 与 WebSocket）；export-report-pdf.mjs 依赖本机 Chrome/Edge/Chromium，缺失时用 `CHROME_PATH` 环境变量指定。
- 真实敏感客户材料不得提交到 Git；端到端测试使用虚构材料。
