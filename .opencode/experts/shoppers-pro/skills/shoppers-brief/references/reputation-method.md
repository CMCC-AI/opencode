# 真实口碑采集方法（reputation）

> **何时加载**：Phase 4 口碑线开工前必读（与比价线同消息并行发起检索）。读 `20-candidates.json`；产出 `30-reputation.json`。
> **契约关系**：`items[].id` 必须与 `20-candidates.json` 的 `products[].id` 完全对齐——Phase 5 靠 id 把口碑挂回最终卡片。

## 任务

对每款候选商品，**联网采集真实口碑证据**（测评媒体 + 电商评价页 + 论坛长评），抽取**共性槽点 / 共性好评 / 长期反馈 / 品类通病**，结构化写入 `<run>/30-reputation.json`。这是卡片文案与决策报告的**事实依据**，不是润色——润色是 Phase 5 的活。

> 为什么需要这一步：不联网采集时，卡片的 tradeoff 只能凭训练记忆写——它不知道某机型 2024 改进批次已经修了早期主板问题，也不知道某美妆爆出过假货风波。这一步就是把模型记忆替换成真实网页证据，让卡片标注的「口碑」名副其实。失败时诚实标 `model_memory`，绝不伪装成联网核实过。

## 工作流

1. 读 `<run>/00-input.json`（brief 简报 / current_date 当前日期）。
2. 读 `<run>/20-candidates.json`（候选商品列表，含 id）。**你与比价线并行执行**——`40-ranked.json` 此刻尚未产生，不要等待、也不要去读它。
3. 对 products 里**每一款**商品（通常 6~8 款），按下方「采集策略」联网取证：
   - **同一消息并行发起多次检索**，不要串行。
   - 每款先做摘要级取证；其中你判断**用户最可能购买 / 口碑争议最大**的 2~3 款，追加 1~2 次 `webfetch` 抓最权威的测评页 / 长评，提取细节——排序还没出来，深挖对象由你按 brief 的预算/场景自行判断，`webfetch` 总量控制在 6 次以内。
4. 对每款商品，基于抓到的网页证据 + 品类常识，结构化输出 Reputation（格式见下）。
5. 写入 `<run>/30-reputation.json`。

## 采集策略（数据源分层，按权威度优先）

> 与价格的「真实观测价覆盖估算价」思路一致：高权威来源的数据覆盖低权威来源，并体现在 `dataSource` 字段里。

### A. 测评媒体（高客单价 / 技术性品类必查）
手机/笔记本/耳机/家电等带硬件参数的品类，搜：
- `<型号> 测评 <当前年份>` —— 抓极客湾 / 小白测评 / 中关村在线 / 爱范儿 / 实验室数据
- `<型号> 续航 / 发热 / 性能 实测` —— 抓具体场景跑分
- `<型号> 对比 <同档竞品>` —— 抓横向评测里的相对短板

### B. 电商评价页（量化评分 + 词云的权威来源）
- `<型号> 京东 评价 缺点` / `<型号> 天猫 评价`
- `<型号> 好评率 差评` —— 抓评分汇总页
- 抓到的「4.8 星 / 97% 好评 / 1.2 万评价」直接填 `rating` 字段
- **注意**：没有电商官方评价 API，评分从网页摘要里抽取，标 `dataSource: "web_observed"`，不要标 `official_api`（该档位保留给未来官方 API 接入）。

### C. 论坛长评（共性问题的金矿）
- `<型号> 缺点 长期` —— 抓知乎高赞回答 / 小红书真实笔记
- `<型号> 论坛 问题` —— 抓贴吧 / 酷安 / 机圈论坛（手机数码）
- `<型号> 售后 / 维修 / 退货` —— 抓售后体验反馈
- 重点抽**多人反复提到**的共性问题（如「发热」「阴阳屏」「主板虚焊」「连不上 5G」），区分共性问题与个体差异。

### D. 品类通病 / 避坑（来自品类常识）
不需要联网，由品类常识补充：
- 手机：散热差导致降频、入门机存储小、系统广告
- 笔记本：板载内存不可升级、屏幕色域缩水
- 家电：某型号异响 / 漏水 / 售后网点少
- 美妆：假货风险、肤质错配
- 写入 `categoryIssues`。

### E. LLM 兜底（最弱来源，必须诚实标注）
网页没抓到任何口碑证据时（冷门型号 / 新品 / 联网失败），才用训练记忆填，**必须**：
- `dataSource: "model_memory"`
- `confidence: 0.2~0.3`
- 在 `commonComplaints` / `commonPraises` 里只写有把握的、公认的，不要编造。

## 输出契约

`<run>/30-reputation.json`（UTF-8）：

```json
{
  "current_date": "<从 00-input.json 透传>",
  "items": [
    {
      "id": "<与 20-candidates.json 的 products[].id 对齐>",
      "title": "<商品标题，便于核对>",
      "reputation": {
        "rating": {
          "score": 4.7,
          "count": 12000,
          "goodRate": 0.97,
          "platform": "jd",
          "observedAt": "2026-08-05"
        },
        "commonPraises": ["续航撑全天", "拍照清晰", "发热控制比上代好"],
        "commonComplaints": ["长时间游戏降频", "屏幕边缘轻微发黄（个体差异）"],
        "longTermNotes": "用 3 个月后电池健康度衰减约 5%；2024 年 6 月固件更新修复了早期 Wi-Fi 断流问题。",
        "categoryIssues": ["板载内存不可升级，买时就要定够"],
        "dataSource": "web_observed",
        "confidence": 0.8,
        "sources": [
          {"title": "极客湾 iPhone 17 Pro 深度测评", "url": "https://...", "type": "review"},
          {"title": "知乎：iPhone 17 Pro 用半年体验", "url": "https://...", "type": "forum"}
        ]
      }
    }
  ],
  "coverage": {
    "total": 6,
    "webObserved": 4,
    "mixed": 1,
    "modelMemory": 1,
    "failed": 0
  }
}
```

字段说明：
- `items[].id` 必须与 `20-candidates.json` 的 `products[].id` 完全对齐——比价线归一时沿用同一组 id，Phase 5 靠 id 把口碑挂回最终卡片。
- `dataSource` 取值与含义：
  - `official_api`：电商官方评价 API（**未接入，现阶段不要用**）。
  - `web_observed`：抓到 ≥2 条真实网页证据，且证据间基本一致。
  - `mixed`：抓到 1 条网页证据 + 部分模型记忆补充。
  - `model_memory`：完全没抓到证据，纯模型记忆。
- `confidence` 与 dataSource 对应：official_api 0.9+，web_observed 0.7~0.85，mixed 0.5~0.65，model_memory 0.2~0.3。
- `sources` 必须是真实抓到的网页（url 真实可访问），不要凭模型记忆编 URL。model_memory 时 sources 留空数组。

## 纪律

- **不要编造 URL**：sources 里的每条都必须是检索/webfetch 真实返回的链接。
- **不要把刷量 / 营销内容当口碑**：看到「全网首发」「震惊」这类营销号标题直接忽略，只采信真实用户长评与专业测评。
- **每款的 commonComplaints 至少要有 1 条**（即使是 model_memory 也要写「公开渠道未见明显共性槽点」之类的诚实说明），让 Phase 5 有内容可写。
- 检索多次调用要在**同一消息并行**发起——本环节是延迟大头。
- 不要修改 `00-input.json` / `20-candidates.json`。
