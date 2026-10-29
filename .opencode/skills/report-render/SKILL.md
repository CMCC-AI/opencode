---
name: report-render
description: Render a markdown report into styled HTML and A4 PDF with ECharts charts. One input (markdown), zero config. Covers the full chain - the executing agent produces the visual JSON per the shared viz contract, then deterministic scripts backfill body text, validate and assemble charts, render HTML, and export PDF. Use for any expert-team report publishing or standalone markdown report rendering.
---

# 统一报告渲染（report-render）

输入只有 markdown，产出带图表的 HTML 与 A4 PDF。链条分两段：

- **LLM 段**（执行代理按 `references/viz-contract.md` 完成）：读 md → 产出 `<basename>.visual.json`（章节骨架 + 正文占位符 + 图表扁平数据 + 组件）
- **确定性段**（脚本，毫秒级）：占位符回填（正文零抄写）→ 图表校验组装（委托 chart-builder）→ 填充模板 → HTML → PDF（委托 report-pdf）

样式默认取 deepinsight 报告模板（图表 fallback 容错、SVG 打印渲染、中文正文字体、print CSS）。**绝对路径以 skill 工具加载本技能时返回的 Base directory 为准**（下文用 `<BASE>` 表示）。

## 代理执行流程（标准用法）

1. **读报告**：用 Read 工具读取输入 markdown
2. **产 JSON**：按 `<BASE>/references/viz-contract.md` 契约，把 `<basename>.visual.json` 写到 md 同目录（大报告可 spawn 子代理执行契约，契约文档同一份）
3. **渲染**：`node <BASE>/scripts/render-report.mjs <md 路径>` → 输出 `<basename>.html`
4. **导 PDF**：`node <BASE>/scripts/export-report-pdf.mjs <md 同目录>/<basename>.html`
5. **回报**：HTML/PDF 路径 + 渲染日志摘要（正文回填 / 图表校验 N/M / 参考文献 N 条）
6. 渲染日志出现图表丢弃或章节未覆盖警告时：只修正对应图表数据/占位符后重跑，正文块无需重做

## 纯终端用法（降级）

没有 visual JSON 时渲染脚本自动降级为纯文本模式（自动切章、无图表、含表格）：

```bash
node <BASE>/scripts/render-report.mjs report.md          # 产出 report.html（纯文本）
node <BASE>/scripts/export-report-pdf.mjs report.html    # 产出 report.pdf
```

适合快速把 md 转成带报告样式的 PDF；要图表必须走代理流程（先按契约产出 visual JSON）。

## 章号与回填规则（自动，无需配置）

- 章号自动识别：中文序号（一、二、…十）、数字（1、2、…）、未编号 H2 按文档顺序；「摘要」章对应 `__ABSTRACT__`
- 块粒度：有 `### ` 子节按子节切块，无子节按段落切块；表格段剥离（由 table block 承载）
- 宽松策略：占位符与块数不齐时并入最后一个占位符，正文永不丢失；失配只警告不失败
- 文末「参考文献」/「引用来源」章节自动剥离并解析为编号引用列表

## 专家团集成（薄壳模式）

各专家团的可视化子代理可退化为薄壳：代理文件只保留人设与团队差异（几行），行为完全由本技能契约定义。子代理需要 `skill` / `read` / `write` / `bash` 工具授权。团长 task prompt 只传 workspace 路径，不要另行描述图表或 JSON 结构（防止 schema 漂移）。

## 纪律

- 不要修改渲染脚本与模板来适配单个团队；差异走团队子代理的几行说明或未来的 config 覆盖
- 图表数据不合格会被整块丢弃并在日志报出原因——按原因修正，不要绕过校验
- PDF 阶段不重新调用模型写内容
