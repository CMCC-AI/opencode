---
name: geo-analytics
description: DeepGeo 共享数据分析规范——recipe 选择、批量执行、缓存与校验纪律、图表与证据等级约束。当 DeepGeo 专家需要从已登记的结构化数据产生统计指标、模型结果或图表时使用，不属于某一个专家。
---

# Geo Analytics

## 适用范围

当 DeepGeo 专家需要从已登记的结构化数据产生统计指标、模型结果或图表时使用。该 Skill 是共享能力，不属于某一个专家。

## 工作流程

1. 读取 `data-contract.json`、`quality-report.json` 和本次工作包。
2. 只选择能回答决策问题的 recipe，每个工作包默认不超过四个；优先用一次批量运行回答多个相邻问题。
3. 通过确定性引擎执行（专家团布局：`python3 -m analytics.deepgeo.cli`，`PYTHONPATH` 指向 `deepgeo-pipeline` Skill 目录；若环境注册了 `geo-analysis` 工具则优先使用），不在提示词中手算核心数值。
4. 把逐配方输出暂存到 `.scratch/<domain>/`，检查运行状态、输入哈希、参数和警告。
5. 把准入指标、发现和最多三张图表候选合并进本领域唯一的 `analysis-result.json`；报告阶段再把实际采用的图登记到 chart manifest。
6. 每条发现标注 observed、association、inference、hypothesis、model_based_projection 或 trial_supported。

## 共同约束

- 不修改案例源数据，也不把整份源数据复制进 Workspace；
- 不把缺失自动填零；
- 不为了结论好看删除异常；
- 活动、天气、闭店和采集断点必须分开处理；
- 相同缓存键优先复用；
- 一次读入契约与所需特征视图、一次批量分析、一次集中校验；不得用多轮 shell 搜索代替结构化读取，也不得为已有 recipe 重写临时计算脚本；
- 图表标题写业务发现，单位、范围、样本和数据模式必须完整；
- 失败、超时或低样本量进入 warnings，不得伪装成功；
- 模拟数据精度不能被称为真实上线效果。

详细 recipe、证据等级和预算见 `references/`。
