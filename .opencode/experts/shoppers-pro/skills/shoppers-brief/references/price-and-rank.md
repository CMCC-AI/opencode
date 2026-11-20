# 比价与归一排序方法（price & rank）

> **何时加载**：Phase 4 比价线开工前必读。读 `20-candidates.json`；产出 `40-ranked.json`。与口碑线并行（见 SKILL.md Phase 4）。
> **契约关系**：`40-ranked.json` 里每个商品的 `id` 必须原样沿用 `20-candidates.json` 的 id——口碑线并行用同一组 id 采口碑，Phase 5 靠 id 把口碑挂回最终卡片。**绝不重新编号。**

## 工作流

1. 读 `<run>/00-input.json`（brief 简报 / current_date 当前日期）。
2. 读 `<run>/20-candidates.json`（候选商品列表：id / title / brand / model / summary 入选理由 / offers 初步链接与估价）。
3. **多平台比价取证**（**同一消息并行发起多次检索**，不要串行）：
   - 每款候选搜：「`<型号>` 京东 价格」「`<型号>` 拼多多 百亿补贴」「`<型号>` 什么值得买 好价」「`<品牌>` 官网 价格」等，抓各平台真实价与更优链接。
   - 对有官网购买页的候选（Apple/华为/小米等）用 `webfetch` 抓官网价——最可靠的 `observed` 锚点。
4. 按「归一化与排序」规则完成核价、去重、推荐指数与分组。
5. 把排序结果写入 `<run>/40-ranked.json`。

## 核价规则（observed / estimated 分层）

- **observed**：价格来自你这次检索/webfetch 的真实证据（搜索结果明码标价、官网页价格）。尽量同时带回 url。
- **estimated**：证据确认不了的，沿用或修正 20-candidates 的初步估价。**绝不把估算价伪装成观测价。**
- 平台价常识：拼多多（百亿补贴）/抖音常更低；京东自营略高但物流售后更稳；淘宝/天猫居中。抓不到更低平台价时不要硬编一个「低价」。
- 每款保留 2~4 个平台 offer；比价有新发现的更好直链就替换 20-candidates 里的旧链接。

## 链接铁律（每条 offer 必须能点开）

1. **每条 offer 必须有非空 `url`**：直链（`item.jd.com/xxx`、官网购买页）优先，抓不到就搜索入口，`linkType` 如实标注。
2. **品牌官网用 `platform: "other"`**，并在 `priceStatus` 写明平台名（如 `"Apple官网"`）。
3. **搜索入口模板**（拿不到直链时套用，把 `<型号>` 换成商品型号/标题）：
   - 京东：`https://search.jd.com/Search?keyword=<型号>`
   - 天猫/淘宝：`https://s.taobao.com/search?q=<型号>`
   - 拼多多：`https://mobile.yangkeduo.com/search_result.html?search_key=<型号>`

## 归一化与排序

1. **id 沿用（最重要）**：`40-ranked.json` 里每个商品的 `id` 必须原样沿用 `20-candidates.json` 的 id——口碑线正在并行用同一组 id 采口碑，Phase 5 合流靠 id 把口碑挂回最终卡片。剔除的款直接不出现；合并同款时沿用主款 id。**绝不重新编号。**
2. **归一**：同款不同配置去重（保留最贴合用户预算的配置）；offers 按平台去重。
3. **推荐指数与分组**（对**当前用户**的匹配度，不是商品永久评分）：
   - `recommendationIndex` 0~100：以 brief 的使用者/场景/预算贴合度为主，价格与渠道确定性为辅；≥85 且无明显硬伤才给高分。
   - `recommendationLabel`：≥85 强烈推荐；75~84 推荐；60~74 可考虑；<60 备选。
   - `groups`：`最适合`（前 2~3 款）、`性价比`、`更多候选`（其余），每组含 `name` + `productIds`。

## 输出契约

`<run>/40-ranked.json`：按下方结构写入（排序后的推荐卡片 + 分组）：

```json
{
  "products": [ "...候选字段 + 核价后的 offers + recommendationIndex/recommendationLabel..." ],
  "groups": [ {"name": "最适合", "productIds": ["p1"]} ]
}
```

## 纪律

- **先核价再排序**：价格 status 标注必须先于推荐指数计算。
- 多次检索要在**同一消息并行**发起，不要串行。
- **id 必须沿用 20-candidates 的原 id**，绝不重新编号。
- 不要修改 `00-input.json` / `20-candidates.json`。
