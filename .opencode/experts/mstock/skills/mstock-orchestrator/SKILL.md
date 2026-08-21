---
name: mstock-orchestrator
description: DeepTrading 多股对比中心 团长编排与验收指引——输入聚合策略、阶段调度顺序、质量验收门控、HTML 渲染流程。
---

# 团长编排 Playbook

本 playbook 服务于 `mstock` 编排代理（团长），提供阶段调度的快速参考。

## 输入聚合策略

### 路径识别

从用户输入中提取路径的模式：
- 包含 `trading-workspace` 的目录 → deeptrading-oc workspace，读 `30-final-report.md` + `00-input.json`
- 以 `.md` 结尾 → 直接读 markdown
- 以 `.pdf` 结尾 → 用 `read` 工具读取
- 无路径的文本 → 原样作为 content

### 标准化结构

每份报告标准化为：
```json
{
  "id": <序号>,
  "title": "<从报告第一行或文件名提取>",
  "ticker": "<从 00-input.json 或标题提取>",
  "company_name": "<从 00-input.json 或标题提取>",
  "source_type": "deeptrading_workspace | markdown_file | pdf_file | raw_text",
  "source_path": "<原始路径>",
  "content": "<报告全文或前 12000 字符>"
}
```

### 最少输入

- ≥2 份有效报告。少于 2 份 → 不自动搜索，先 question 弹窗引导：`查看历史会话中可对比的股票`（选中才执行 0.2 扫描并列标的补选）/ `先生成新的个股报告` / `我继续补充报告`。
- 扫描来源：① `..\deeptrading-oc\tmp\trading-workspace` 与 ② 当前会话 `tmp\trading-workspace`（mstock 项目路径）；③ 历史会话 `<Documents>\DeepInsight\`（deeptrading 对话报告落盘处，cwd 推导兜底，跨机器/服务器部署无需改路径）。

## 阶段调度顺序（严格）

```
阶段 0：聚合（团长做）     → 00-input.json + 01-sources.json
阶段 1：ms-comparator      → 10-comparison-matrix.md
阶段 2：ms-report-writer   → 20-comparison-report.md
阶段 3：ms-visualizer      → 30-visual-report.json
阶段 4：HTML 渲染（团长做）  → 40-comparison-report.html
阶段 5：统计与交付（团长做） → 50-stats.json
```

**严格顺序，不可跳步**。每个阶段失败重试 1 次，连续 2 次失败则终止。

## 质量验收门控

| 阶段 | 验收点 | 不达标处理 |
|------|--------|-----------|
| 0 | reports ≥2，每份 content 非空 | question 弹窗引导（查历史/新生成/补充），选"查历史"才扫描 |
| 1 | 矩阵覆盖全部标的+维度 | 重跑 ms-comparator |
| 2 | 七章齐全、≥2600汉字、第七章含**明确投资建议** | 重跑 ms-report-writer（expand:true） |
| 3 | JSON 可解析、sections=7、chart≥4 | 重跑 ms-visualizer |
| 4 | HTML 开头 `<!DOCTYPE html>`、含合法 JSON | 检查模板渲染脚本 |
| 5 | stats.json 写入成功 | 手动补写 |

## Task 调用模板

### ms-comparator
```
Task(subagent_type="ms-comparator",
     description="多股横向对比分析",
     prompt="workspace_dir: tmp/comparison-workspace/<run-id>/\ncomparison_dimensions: 基本面,估值,技术面,舆情,主要风险")
```

### ms-report-writer
```
Task(subagent_type="ms-report-writer",
     description="七章对比总报告",
     prompt="workspace_dir: tmp/comparison-workspace/<run-id>/\ntarget_hanzi: 2600")
```

### ms-visualizer
```
Task(subagent_type="ms-visualizer",
     description="横评可视化看板",
     prompt="workspace_dir: tmp/comparison-workspace/<run-id>/")
```

## description 字段必须用中文

`description` 是子会话在 TUI 里显示的标题，必须用中文。

## 失败处理优先级

1. **不阻塞交付**：markdown 对比报告是最核心交付物，HTML 失败不阻塞 markdown 交付
2. **重试 1 次**：每个 worker 失败后重试 1 次（prompt 不变），连续 2 次失败才终止
3. **降级**：visualizer 失败 → 降级单 section；HTML 失败 → 省略 HTML 行
