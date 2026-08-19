# Workspace 文件契约

编号化工作目录是团队协作的单一事实载体。主理人负责创建、落盘与转交；成员按本契约读取指定文件、回传指定产出。

## 目录布局

```text
tmp/zhengqi-visit-intel-workspace/<run-id>/
  00-input.json               # 标准化输入
  01-sensitive.json           # 输入安全检查结果（sensitive-check-officer 产出）
  02-source-registry.json     # 内部来源注册表（主理人产出）
  02-brief-data.json          # brief.data 数值权威清单（主理人产出）
  03-internal-materials.md    # 可读内部材料汇总（主理人产出）
  03-plan.json                # 研究规划（research-query-planner 产出）
  04-internal-findings.md     # 内部事实底稿（internal-intel-researcher 产出）
  04-internal-findings.meta.json
  05-web-findings-N.md        # 第 N 轮公开研究（public-web-researcher 产出）
  05-web-findings-N.meta.json
  06-intelligence-N.json      # 第 N 轮融合结果（intelligence-synthesizer 产出）
  07-reflection-N.json        # 第 N 轮反思（research-reflection-analyst 产出）
  10-outline.json             # 拜访导向大纲（outline-architect 产出）
  20-report.md                # 正式报告（report-chief-writer 产出；含 <cite> 或 [N]）
  21-evidence-review-N.json   # 第 N 轮证据核验（evidence-verify-officer 产出）
  22-citation-audit.json      # 引用审计（finalize-citations.mjs 产出）
  22-references.json          # 最终参考文献（finalize-citations.mjs 产出）
  23-presentation-audit.json  # 成品表达检查（lint-report.mjs 产出）
  25-visual-report.json       # 可视化结构（report-visual-designer 产出）
  30-report.html              # 正式 HTML（render-report.mjs 产出）
  35-report.pdf               # 正式 PDF（export-report-pdf.mjs 产出）
  40-stats.json               # 结构验收统计（validate-run.mjs 产出）
```

## 00-input.json（标准化输入）

```json
{
  "report_title": "某企业-谈参高拜报告",
  "customer_company_name": "示例公司",
  "analyst_company_name": "中国移动",
  "report_type": "executive_visit",
  "target_word_count": 8000,
  "minimum_word_count": 7200,
  "current_date": "YYYY-MM-DD",
  "max_rounds": 3,
  "outline": [],
  "internal_data_files": [],
  "attachments": [],
  "knowledge_base_ids": [],
  "knowledge_base_content_available": false,
  "reference_policy": {"minimum_total": 15, "minimum_public": 12}
}
```

用户侧推荐输入（主理人负责转换为 00-input.json）：

```json
{
  "report_title": "某企业-谈参高拜报告",
  "analyst_company_name": "中国移动",
  "report_type": "executive_visit",
  "outline": [],
  "portal_data": {},
  "internal_data_files": ["./customer-export.json", "./visit-history.md"],
  "attachments": [],
  "knowledgeBaseId": []
}
```

旧字段 `file_content`、`outline[].data`、`knowledgeBaseId` 继续兼容。只有知识库 ID、没有导出正文时该知识库标记为不可用，不得伪造内容。

## 02-source-registry.json（来源注册表）

```json
{
  "sources": [
    {
      "source_id": "SRC-001",
      "kind": "portal_export",
      "title": "客户门户导出",
      "path_or_field": "portal_data",
      "updated_at": null,
      "read_status": "read",
      "sensitivity": "internal",
      "notes": ""
    }
  ]
}
```

- `read_status` 只能是 `read | unavailable | failed | empty`；不存在或未读取的来源不能标 `read`。
- kind 常用值：portal_export / file_content / local_file / attachment / outline_data / knowledge_base。

## 02-brief-data.json（数值权威清单）

递归遍历 outline 及 children，每条 data 原样写入；record 的 key/value 原样复制，禁止换算、取整、补零或规范化小数位：

```json
{
  "total_data_items": 1,
  "data_items": [
    {
      "id": "D-001",
      "section_title": "合作情况",
      "section_path": "outline[1]",
      "source_id": "SRC-003",
      "record": {"收入": "127329万元", "期间": "2025年"}
    }
  ]
}
```

## 04-internal-findings.meta.json（内部研究元数据）

关键字段：

- `critical_facts[]`：fact_id（IF-0001 起）、category、subject、predicate、value、source_ids、source_excerpt、observed_at、status（verified_internal | single_source | conflicting | stale | missing）、confidence（high | medium | low）。
- `cooperation_facts[]`、`opportunity_records[]`、`conflicts[]`、`missing_critical_information[]`。
- `coverage`：enterprise_profile / leadership / cooperation / opportunities，取值 sufficient | partial | insufficient。

## 05-web-findings-N.meta.json（公开研究元数据）

关键字段：

- `source_records[]`：title、url、publisher、source_tier（1～5）、published_at、event_date、fetched_successfully、supports[]。
- `verified_facts[]`：category、subject、predicate、value、source_urls[]、as_of、verification_status。
- `recent_events[]`、`public_mobile_cooperation[]`、`opportunity_context[]`、`conflicts[]`、`unverified_leads[]`。
- `independent_usable_source_count`：剔除同一通稿转载后的独立有效来源数。

## 06-intelligence-N.json（融合结果）

关键字段：

- `critical_fact_matrix[]`：field、internal_value、internal_source_ids、public_value、public_sources、resolution（corroborated | conflict）、approved_for_report（boolean）、display_value、as_of。
- `leadership_items_requiring_confirmation[]`、`recent_events[]`、`cooperation_baseline[]`。
- `opportunity_hypotheses[]`：opportunity_id、external_change、internal_baseline、mobile_capability、evidence_source_ids、evidence_urls、evidence_strength、customer_relevance（1-5）、mobile_fit（1-5）、urgency（1-5）、recommended_talking_point、questions_to_validate[]。
- `conflicts[]`、`reportable_facts[]`、`prohibited_or_unverified_claims[]`、`remaining_gaps[]`。

领导层准入硬规则：现任领导需一个当前有效权威公开来源，或两个独立一致且有明确更新时间的内部来源；approved_for_report=true 才能进入成品。

## 07-reflection-N.json（反思结果）

关键字段：round_assessed、is_sufficient、coverage（八维）、verified_leadership_count、leadership_gaps、internal_gaps、public_gaps、conflicts、opportunity_gaps、reference_sufficiency、follow_up_queries（脱敏）、internal_follow_up_questions、next_action（internal_research | web_research | resynthesize | outline）、reason。

## 10-outline.json（大纲）

章节树：section_number、section_title、target_words、evidence_requirements、draft_content、subsections。最后一章固定为"企业基本信息与领导层关键人物"，其人物证据要求为 `critical_fact_matrix.approved_for_report=true`。

## 21-evidence-review-N.json（核验结果）

关键字段：pass、summary、critical_errors[] / major_errors[] / minor_errors[]（error_id、category、report_excerpt、issue、required_action）、leadership_audit、numeric_audit、citation_audit、internal_data_utilization、data_insight_audit、presentation_audit、required_revisions[]。

## 25-visual-report.json（可视化结构）

顶层 `{"report": {...}, "references": [...]}`：

- report：title、subtitle、topic、current_date、hero_stats[]、sections[]。
- sections[].blocks[] 四种类型：markdown（content）/ chart（id、type、title、description、option 为 ECharts 配置）/ table（title、columns、rows）/ stat_grid（title、items[]）。
- 图表数值必须与 02-brief-data.json 逐字符一致；参考文献章节从 sections 移出进入顶层 references。

## 阶段间传递规则

1. 每个成员只读取契约中"必须读取"清单列出的文件，不得越权读取后续阶段产物。
2. 成员产出先回传主理人，由主理人按契约文件名落盘，再调度下一阶段。
3. 修订（revision_mode）只改核验清单指出的问题；修订后必须重新核验，形成新的 21-evidence-review-N。
4. 公开研究员调度 prompt 中只允许出现公开公司名、脱敏查询、轮次与当前日期。
