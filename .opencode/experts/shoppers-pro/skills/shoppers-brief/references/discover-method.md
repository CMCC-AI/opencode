# 候选发现方法（discover）

> **何时加载**：Phase 3 发现候选前必读。前置：`00-input.json` + `02-evidence.md` 已就绪；本环节产出 `20-candidates.json`。
> **契约关系**：候选 `id`（p1、p2…）从这里一路贯通到 50-final.json——比价沿用、口碑对齐、合流全靠它，**一经写出不可变更**。本环节只发现候选，**不比价、不排序**——核价与推荐指数是 Phase 4 比价线的活，口碑是 Phase 4 口碑线的活。

## 工作流

1. 读 `<run>/00-input.json`（messages 对话 / brief 简报 / current_date 当前日期）。
2. 读 `<run>/02-evidence.md`（Phase 1 已抓的真实在售证据，权威锚点）。
3. **自己联网检索、webfetch 抓正文补充核实**：基于 brief 的品类/品牌/预算，**同一消息并行发起多次调用**，抓当前在售型号、初步价格与**可点击购买链接**。证据里已有的型号直接采纳；证据不足的方向补搜。**搜型号的同时把链接一起抓回来**：每个平台都尽量拿到商品直链（京东 `item.jd.com`、官网购买页），拿不到直链再用搜索入口兜底（见下方「链接铁律」）。若 brief 里有 `referenceLinks`（用户给的链接），同款必须入列并围绕它找同类替代。
4. 按「输出契约」整理出 6~8 款候选，写入 `<run>/20-candidates.json`。

## 选品铁律（最重要）

1. **在售 + 时效**：
   - 只推荐【`current_date` 已正式上市、可在京东/天猫买到现货】的型号。严禁推荐尚未发布/已发布未开售/已停产下架的产品。
   - 用 `current_date` 对照品类上市节奏推理：如 iPhone 每年 9 月发布并随即上市，若 `current_date` 是某年 7 月，则该年新一代未上市——"最新在售款"是去年 9 月那一代。
   - 不确定是否已上市时，宁可推荐确定在售的上一代，绝不赌未发售的新一代。
   - **优先以 `02-evidence.md` 里的真实证据为准**——证据是刚抓的真实网页，权威性高于训练记忆；证据里明确提到的新款（哪怕超出训练知识）必须可以入选。
2. **用户指定优先**：若 `brief.candidates` 或对话里用户明确点名型号（如"iPhone 17 Pro"），必须以它为核心推荐（它本身 + 同系列不同配置 + 直接替代款），不要用代次判断覆盖用户的选择。
3. **真实商品**：必须是真实品牌 + 真实型号，绝不编造不存在的型号。
4. **覆盖不同定位**：6~8 款，覆盖"最适合 / 性价比 / 特色选择"。
5. **围绕用户场景**：针对 brief 的使用者/场景/预算挑（如"养猫家庭的扫地机"重点看毛发防缠绕/避障宠物/自清洁/大吸力）。
6. **价格符合实际**：不同平台价通常不同——拼多多(百亿补贴)/抖音常更低，京东自营常略高但物流售后更稳，淘宝/天猫居中。

## 链接铁律（每条 offer 必须能点开）

用户最终要能点链接下单，所以**链接和初步价同样重要——没链接的 offer 等于没用**。

1. **每条 offer 必须有非空 `url`**。优先级：商品直链（`item.jd.com/xxx`、品牌官网购买页）> 平台搜索入口。能抓直链就抓直链；抓不到必须填搜索入口并标 `linkType: "search"`，绝不允许空字符串或 null。
2. **品牌官网用 `platform: "other"`**：Apple Store / 华为商城 / 小米商城 不在 jd/pdd/taobao 枚举里，统一归 `"other"`，并在 `priceStatus` 写明平台名（如 `"Apple官网"`）。
3. **搜索入口模板**（拿不到直链时套用，把 `<型号>` 换成商品型号/标题）：
   - 京东：`https://search.jd.com/Search?keyword=<型号>`
   - 天猫/淘宝：`https://s.taobao.com/search?q=<型号>`
   - 拼多多：`https://mobile.yangkeduo.com/search_result.html?search_key=<型号>`
4. **诚实标注 `linkType`**：直链/官网购买页写 `product`，搜索入口写 `search`，不要把搜索入口伪装成商品直链。

## 初步参考价

给每条 offer 一个初步参考价，标 `status: "estimated"`（Phase 4 比价线会逐一核价）；在搜索/官网页里看到明确标价的，可标 `status: "observed"`。不需要穷尽每个平台——每款 2~4 个平台即可，**把链接抓齐比把价格估准更重要**。

## 输出契约

`<run>/20-candidates.json`（UTF-8）：

```json
{
  "products": [
    {
      "id": "p1",
      "title": "Apple iPhone 17 Pro 256GB",
      "brand": "Apple",
      "model": "iPhone 17 Pro",
      "category": "phone",
      "summary": "一句针对当前用户的入选理由",
      "offers": [
        {"platform": "jd", "url": "https://item.jd.com/100211127645.html", "linkType": "product", "price": {"value": 8999, "currency": "CNY", "status": "estimated"}},
        {"platform": "other", "url": "https://www.apple.com.cn/shop/buy-iphone/iphone-17-pro", "linkType": "product", "priceStatus": "Apple官网", "price": {"value": 8999, "currency": "CNY", "status": "observed"}}
      ]
    }
  ]
}
```

> **id 规则**：`id` 用 `p1`、`p2`… 简单稳定编号——后续比价排序、口碑采集、卡片合流全靠这个 id 对齐，**一经写出不可变更**。

## 纪律

- 多次检索要在**同一消息并行**发起，不要串行。
- 不比价、不排序、不写推荐指数——那是 Phase 4 的活。
- 不要修改 `00-input.json` / `02-evidence.md`。
