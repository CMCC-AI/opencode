# 分析配方目录与调用

## 1. CLI 调用方式（核心数值只准这样算，禁止对话估算）

分析包位于本技能 `analytics/`（自包含，纯 Python 标准库，需 Python ≥3.11）。在**本技能目录**作为 PYTHONPATH 前提下：

```
# 运行配方（--input 可重复传多张表；--params 为 JSON 字符串）
python -m analytics.deepgeo.cli run --recipe <配方名> --input <表1.csv> [--input <表2.csv> ...] [--params '{"key":1}'] --producer deepgeo-brief --output <结果.json>

# 快速柱状图（SVG，供探索用）
python -m analytics.deepgeo.cli chart --labels '["A","B"]' --values '[1,2]' --title "标题" --output <图.svg>
```

Windows 下 PYTHONPATH 写法（PowerShell，在技能目录 `<skill>` 下）：

```powershell
$env:PYTHONPATH = "<skill 目录绝对路径>"; python -m analytics.deepgeo.cli run ...
```

**Windows 实操坑（PowerShell 5.1）**：
- `--params` 的 JSON 内层双引号必须写成 `\"`：`--params '{\"group_field\":\"nearest_site_id\"}'`，否则双引号被剥导致 JSON 解析失败；
- 中间矩阵 CSV（如评分输入）不要用 `Export-Csv`（带 BOM+全引号，会使首列键变 `\ufeffsite_id`）；用 `[IO.File]::WriteAllLines(..., $lines)` 写无 BOM 行数组；
- 需要按数据实际列名传 `--params` 字段（如 `commercial.diversity` 默认 `zone_id/category`，POI 表需传 `nearest_site_id/poi_type`）。

输出 JSON 统一含 `status / duration_ms / metrics / tables / charts / warnings`。**status 非 success 或 warnings 非空时，如实登记，不伪装成功**。原始输出全部落 `.scratch/`；每领域收敛后把准入指标摘进 `20-analysis.md`。

## 2. 十五个配方

| Recipe | 输入 | 输出 | 用途 |
|---|---|---|---|
| `quality.profile` | 任意 CSV | 行列、空值、唯一性、数值范围 | 数据契约阶段 |
| `temporal.pattern` | 时间+对象+指标 | 小时/星期汇总、峰谷 | 客流/经营节律 |
| `temporal.anomaly` | 时间+对象+指标+质量标记 | IQR 高异常、缺失与质量问题 | 隔离活动/异常日 |
| `mobility.dwell` | 驻留与客流 | 有效客流、停留分布 | 区分经过 vs 留下 |
| `mobility.od` | 来源+目的地+距离 | 来源覆盖与方式构成 | 可达性与腹地 |
| `audience.mix` | 对象+时段+客群 | 构成与目标客群 | 客群匹配 |
| `audience.association` | 分类变量与结果 | 交叉表、Cramér's V | 关联（≠因果） |
| `commercial.diversity` | 区域+业态+数量 | Shannon 熵与 HHI | 业态协同/同质化 |
| `commercial.supply_gap` | 需求+供给 | 四象限与缺口指数 | 供需错配 |
| `decision.score` | 候选指标 | 标准化、得分、排名 | 综合评分 |
| `decision.stability` | 指标与基准权重 | 权重扰动和排名频率 | 排名稳健性 |
| `finance.scenario` | 成本与经营情景参数 | 月客流、收入、经营利润、盈亏平衡客流 | 财务情景 |
| `finance.monte_carlo` | 基准参数与波动范围 | 亏损概率和利润分位数 | 风险量化 |
| `pilot.did` | 处理+对照+前后期 | DID 估计与趋势 | 试点评估（仅真实试点数据） |
| `forecast.baseline` | 日期+对象+待预测指标 | 三基线留出误差、胜出方法、逐日预测与上下范围 | 短期推演 |

`forecast.baseline` 解释纪律：报告不能只抛 MAE/WAPE 缩写，要说"平均每天大约差多少、误差约占实际量多少"，未来写成范围。

## 3. 场景默认组合（单领域首轮 ≤4 个配方）

**选址评估型**：`temporal.pattern` → `mobility.dwell` → `audience.mix` → `mobility.od`（位置/客群线）；`commercial.diversity`（商业线）；`decision.score` + `decision.stability` + `finance.scenario` + `finance.monte_carlo`（模型线）；历史足够时 `forecast.baseline`。

**场所运营型**：`temporal.pattern` → `temporal.anomaly` → `mobility.dwell`/`mobility.od`；`commercial.supply_gap` + `commercial.diversity`；`audience.association`（弱关联结论按证据等级压低）；真实试点数据才有 `pilot.did`。

## 4. 运行预算

- 同一配方技术失败最多重试一次，再失败记 warnings 并降级；
- 相同输入不再重跑（结果就在 .scratch 里，读回来用）；
- 只有会改变推荐或风险结论的实质缺口才补第二轮；
- 超过预算的深度分析属于 deepgeo 专家团的领地，本技能如实声明边界。

## 5. 证据等级（每条核心发现必须标注其一）

- `observed`：数据与确定性统计直接支持——可写"数据显示"；
- `association`：统计关联——"与……相关/呈现关联"，不得写因果；
- `inference`：结合业务机制但未验证——"可能/提示"；
- `hypothesis`：需现场踏勘或试点确认——候选假设；
- `model_based_projection`：模型推演的未来范围——"按当前规律推演"，必须附回测误差与失效条件；
- `trial_supported`：真实且适当设计的试点支持——模拟试点禁用此级。

证据等级不因重复分析自动升级；正文据此选择"是/可能是/建议验证"三档措辞。
