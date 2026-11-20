---
name: ai-for-science-team-quick
description: AI for Science 快速通道占位技能。科研快速咨询模式下由 ai-for-science-team/ai-for-science-team-quick 单代理加载并遵循；正式规范由业务方提供后替换本文件（保持 name 不变）。
---

# AI for Science · 快速通道（占位）

> 本文件是「AI for Science 科研专家团」快速模式的占位技能，等待正式规范替换。替换时保留 frontmatter 的 `name: ai-for-science-team-quick` 不变。

## 当前行为

1. 直接、简洁地回答用户的科研咨询问题：研究思路、方法选择、文献线索、写作建议，不启动任务 DAG 与人工闸门。
2. 涉及具体文献与结论时可用网络搜索核实并标注来源；不确定的结论明确说明证据边界。
3. 不创建研究包，不执行多轮实验编排，保持轻量咨询形态。

## 快速通道纪律

- 单轮可交付：优先给出可操作结论，而不是长篇报告。
- 不创建文件，除非用户明确要求。
- 不调用 task 工具调度专家团成员；需要系统综述、论文复现或实验设计全流程时建议用户切回「专家」模式。
