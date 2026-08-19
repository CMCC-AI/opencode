#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const workspaceArg = process.argv[2];
if (!workspaceArg) {
  console.error("用法：node lint-report.mjs <workspace_dir>");
  process.exit(2);
}

const workspace = path.resolve(process.cwd(), workspaceArg);
const reportPath = path.join(workspace, "20-report.md");
const auditPath = path.join(workspace, "23-presentation-audit.json");
const inputPath = path.join(workspace, "00-input.json");
const report = fs.readFileSync(reportPath, "utf8").replace(/^\uFEFF/, "");
const input = fs.existsSync(inputPath) ? JSON.parse(fs.readFileSync(inputPath, "utf8").replace(/^\uFEFF/, "")) : {};
const body = report.split(/^## 参考文献\s*$/m)[0];
const visible = body.replace(/<cite>[^<]+<\/cite>/g, "").replace(/https?:\/\/\S+/g, "");

const rules = [
  ["internal_process_terms", /\b(?:brief|prompt|workspace|worker|portal_data|internal_data|critical_fact_matrix|approved_for_report)\b|用户\s*brief|用户提示词|证据矩阵|置信度代码/gi],
  ["self_congratulation", /(?:数字|数值|数据).{0,6}(?:逐字)?保真|保真校验|校验通过|零误差(?:校验)?/g],
  ["empty_or_absent_language", /字段(?:为空|未提供|缺失)|资料(?:为空|未提供)|(?:暂未|尚未)(?:体现|提供|披露)|未找到|没有找到|未检索到|没有检索到|未发现(?:有效|相关)?|未通过.{0,16}核验|无法核实|公开渠道.{0,12}(?:未见|没有)|没有公开可查/g],
  ["research_process_language", /本次研究发现|本轮(?:检索|搜索|研究)|研究过程(?:中)?|检索过程(?:中)?|搜索过程(?:中)?|经过(?:广泛)?检索发现|遍历.{0,20}(?:新闻|公告|网页|网站)|模型(?:分析|判断|认为)/g],
  ["responsibility_declaration", /本报告(?:不编造|不杜撰|不虚构|的数据.{0,8}(?:真实|可靠)|.{0,12}(?:均已核验|严格依据))|(?:数据|内容|事实)均已核验|真实性声明/g],
  ["internal_action_sections", /^#{2,6}\s+.*(?:待确认|待核实|会后动作|会前准备|下次.{0,8}拜访|资料时点与来源|来源说明).*$/gm],
  ["source_explanation_columns", /资料时点\s*(?:[\/／与和]|及)\s*来源|资料时点说明/g],
  ["internal_followup_tasks", /(?:由|请)客户经理.{0,30}(?:补充|导出|更新|核实)|写入内部档案|补齐.{0,20}(?:字段|档案)|下次拜访前更新证据/g],
  ["internal_artifacts", /SRC-\d+|\b(?:JSON|NULL|TRUE|FALSE)\b|\.(?:json|jsonl|csv|xlsx?)\b/gi],
  ["japanese_quotes", /[「」『』]/g],
  ["english_process_tokens", /\b(?:internal|external|verified|unverified|single_source|conflicting|stale|missing|high|medium|low|unknown|draft|source_id|fact_id)\b/gi]
];

const findings = {};
for (const [name, pattern] of rules) {
  findings[name] = [...visible.matchAll(pattern)].map((match) => match[0]);
}

const longLabelLines = visible.split(/\r?\n/).filter((line) => /^(?:\*\*)?[\u4e00-\u9fff]{2,10}(?:\*\*)?[：:]\s*.{30,}$/.test(line.trim()));
const bulletLines = visible.split(/\r?\n/).filter((line) => /^\s*[-*+]\s+/.test(line)).length;
const paragraphs = visible.split(/\n\s*\n/).filter((part) => part.trim() && !/^#{1,6}\s/.test(part.trim()) && !/^\|/.test(part.trim())).length;
const styleProblems = [];
if (longLabelLines.length > 3) styleProblems.push(`“短标签：长解释”行数为 ${longLabelLines.length}，超过允许上限 3`);
if (bulletLines > 30 || (paragraphs > 0 && bulletLines > paragraphs)) styleProblems.push(`项目符号 ${bulletLines} 行，完整段落 ${paragraphs} 段，项目符号使用过多`);

const promptLeakage = [];
for (const key of ["prompt", "user_prompt", "raw_prompt", "query"]) {
  const value = typeof input[key] === "string" ? input[key].trim() : "";
  if (value.length >= 30 && report.includes(value)) promptLeakage.push(key);
}

const allMatches = Object.values(findings).flat();
const audit = {
  pass: allMatches.length === 0 && styleProblems.length === 0 && promptLeakage.length === 0,
  findings,
  style_problems: styleProblems,
  prompt_leakage_fields: promptLeakage,
  bullet_line_count: bulletLines,
  paragraph_count: paragraphs,
  note: "该检查只负责拦截明显的过程语言和内部术语，不能替代人工成品审阅。"
};
fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");

if (!audit.pass) {
  console.error(`成品表达检查未通过：发现 ${allMatches.length} 个禁用表达，${styleProblems.length} 个结构问题，${promptLeakage.length} 个提示词泄漏`);
  process.exit(1);
}
console.log("成品表达检查通过");
