---
name: chart-builder
description: Validate flat chart data from LLMs and assemble deterministic ECharts options. Use in any expert-team report pipeline (generate-time self-check or render-time gate) so invalid charts are dropped with reasons instead of breaking HTML/PDF rendering.
---

# 统一图表校验与组装（chart-builder）

大模型只产出**扁平图表数据**（类型 + 维度 + 数值），ECharts option 由本技能的确定性脚本组装：样式、配色、坐标轴全部固化，模型无法触碰，也就写不出会导致渲染报错的 option。校验失败返回空结果并给出具体原因，由调用方决定丢弃或让生成方重试。

## 契约

输入为图表对象数组（或形如 `{"charts": [...]}` 的对象）：

```json
[
  {
    "id": "chart_1",
    "type": "bar",
    "title": "近五年营业总收入（亿元）",
    "unit": "亿元",
    "categories": ["2021", "2022", "2023", "2024", "2025"],
    "series": [{ "name": "营业总收入", "values": [1094.6, 1275.5, 1505.6, 1708.9, 1856.2] }]
  }
]
```

校验规则（违反即 `ok: false`，错误原因写入 `errors`）：

- 通用：`title` 非空；`values` 全部是 JSON 数字（字符串/null/NaN 均非法）；一张图一个 `unit`，不同单位不得混入同一图
- `bar` / `line`：`categories` 至少 3 项；每个 `series.values` 长度必须等于 `categories` 长度
- `pie`：只允许 1 个 series（多维对比改用 bar/radar）；`categories` 为扇区名；数值全部大于 0；`unit` 为 `%` 时合计必须等于 100（±0.5）；扇区超过 5 个时占比 <4% 的自动合并为「其他」
- `scatter`：`series[].values` 为 `[x, y]` 数对数组（各为数字），至少 2 对；可选 `x_name` 标注横轴含义
- `radar`：`categories`（维度名）至少 3 项；每个 `series.values` 长度等于维度数；series 最多 6 个；可选 `max` 统一覆盖刻度上限（缺省按数据自动推算）
- `gauge`：恰好 1 个 series、1 个数值；默认上限 100，可用 `max` 覆盖
- `candlestick`：`categories`（交易日）至少 5 项；`series[0]` 是 K 线，`values` 为 `[open, close, low, high]` 数组（high ≥ max(open,close)、low ≤ min(open,close)）；其余 series 是均线（最多 4 条），数值或 null（数据不足的均线点），长度须与交易日一致；配色固定 A 股红涨绿跌

## CLI

生成阶段自查自纠（数组模式，有失败时退出码 1）：

```bash
node <BASE>/scripts/build-charts.mjs <charts.json | -> [--palette "#a,#b,..."]
```

stdout 输出结果 JSON（`results[].ok / option / errors`、`okCount / failCount`），stderr 输出人类可读摘要。子代理生成图表数据后可先跑一次，按 `errors` 修正后重试。

渲染阶段就地处理（`--visual` 模式，坏图表丢弃但退出码恒为 0，管道不中断）：

```bash
node <BASE>/scripts/build-charts.mjs --visual <visual-report.json> [--palette "#a,#b,..."]
```

就地把 visual-report JSON（支持顶层 `sections` 或 `report.sections`）里 chart block 的扁平 `data` 校验、组装 option 并写回；校验失败的图表整块丢弃并在日志报出标题与原因。

`--palette` 覆盖默认色板（逗号分隔十六进制色值）；各团队传入自己的视觉规范即可，模型无法触碰颜色。

## 渲染集成（两种方式）

方式一（Node 渲染脚本，推荐）：按 `export-report-pdf.mjs` 的委托模式动态 import，相对层级按自身脚本位置调整：

```js
const candidates = [
  resolve(scriptDir, '../../../../../skills/chart-builder/scripts/build-charts.mjs'),
];
const { injectChartOptions } = await import(pathToFileURL(found).href);
const summary = injectChartOptions(sections, { palette: ['#your', '#brand', '#colors'] });
// summary: { total, kept, dropped: [{title, errors}] } —— dropped 打进渲染日志
```

方式二（Python/其他栈渲染管线）：渲染前跑一次 `--visual` CLI（mstock 即此方案），或加一个薄 Node 入口脚本委托本技能。

- 图表 block 携带扁平 `data`：通过则注入组装好的 `option`，失败则整块丢弃并在日志报出标题与原因
- 旧格式 block（自带 `option`）原样保留，兼容历史产物
- 丢弃不抛错：渲染永远不被坏图表阻断，但必须在日志中可见，供团长决定是否责令重做

已接入的专家团（参考实现）：

| 专家团 | 接入方式 | 色板 |
|---|---|---|
| deeptrading | render-report.mjs 动态 import | 默认色板 |
| deepinspect | render-report.mjs 动态 import | 蓝灰色系 `#4b6685...` |
| deepinsight | render-report.mjs 动态 import（pipeline-state.mjs 同步校验扁平 data） | 默认色板 |
| zhengqi-visit-intel | render-report.mjs 动态 import（`report.sections`） | 中国移动蓝 `#0066CC...` |
| mstock | `scripts/build-charts.mjs` 薄入口（渲染 HTML 前执行） | 多股横评紫 `#7c3aed...` |

deepgeo 不需要本技能（自研确定性 SVG 图表引擎）；trading-agent 用 Chart.js 内联模板，不在此链路。
