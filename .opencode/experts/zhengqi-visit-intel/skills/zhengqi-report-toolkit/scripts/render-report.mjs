#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const workspaceArg = process.argv[2];
if (!workspaceArg) {
  console.error("用法：node render-report.mjs <workspace_dir>");
  process.exit(2);
}

const toolkitRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspace = path.resolve(process.cwd(), workspaceArg);
const visualPath = path.join(workspace, "25-visual-report.json");
const inputPath = path.join(workspace, "00-input.json");
const referencesPath = path.join(workspace, "22-references.json");
const outputPath = path.join(workspace, "30-report.html");
const templatePath = path.join(toolkitRoot, "templates", "report.html.tpl");
const printCssPath = path.join(toolkitRoot, "templates", "report-print.css");

function readUtf8(file) {
  return fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
}

function readJson(file) {
  return JSON.parse(readUtf8(file));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function safeJson(value) {
  return JSON.stringify(value).replaceAll("</script", "<\\/script");
}

function repairMarkdownTables(content) {
  const lines = String(content || "").replace(/\r\n/g, "\n").split("\n");
  const output = [];
  let repairs = 0;

  const separatorColumns = (line) => {
    const trimmed = line.trim();
    if (!/^\|(?:\s*:?-{3,}:?\s*\|){2,}$/.test(trimmed)) return 0;
    return (trimmed.match(/\|/g) || []).length - 1;
  };

  for (let i = 0; i < lines.length; i += 1) {
    let separatorOffset = 1;
    let columns = i + 1 < lines.length ? separatorColumns(lines[i + 1]) : 0;
    if (!columns && i + 2 < lines.length && !lines[i + 1].trim()) {
      columns = separatorColumns(lines[i + 2]);
      if (columns) separatorOffset = 2;
    }
    if (!columns) {
      output.push(lines[i]);
      continue;
    }

    const headerLine = lines[i];
    const pipePositions = [...headerLine.matchAll(/\|/g)].map((match) => match.index);
    if (pipePositions.length < columns + 1) {
      output.push(headerLine);
      continue;
    }

    const headerStart = pipePositions[pipePositions.length - (columns + 1)];
    const prefix = headerLine.slice(0, headerStart).trim();
    const header = headerLine.slice(headerStart).trim();
    if (prefix) output.push(prefix, "");
    output.push(header, lines[i + separatorOffset].trim());
    i += separatorOffset;
    repairs += prefix || separatorOffset > 1 ? 1 : 0;

    while (i + 1 < lines.length && lines[i + 1].trimStart().startsWith("|")) {
      const rowLine = lines[i + 1].trim();
      const rowPipes = [...rowLine.matchAll(/\|/g)].map((match) => match.index);
      if (rowPipes.length < columns + 1) break;
      const rowEnd = rowPipes[columns];
      const row = rowLine.slice(0, rowEnd + 1).trim();
      const tail = rowLine.slice(rowEnd + 1).trim();
      output.push(row);
      i += 1;
      if (tail) {
        output.push("", tail);
        repairs += 1;
        break;
      }
    }
    output.push("");
  }

  return { content: output.join("\n").replace(/\n{3,}/g, "\n\n").trim(), repairs };
}

const visual = readJson(visualPath);
const input = fs.existsSync(inputPath) ? readJson(inputPath) : {};
const references = fs.existsSync(referencesPath)
  ? readJson(referencesPath)
  : (Array.isArray(visual.references) ? visual.references : []);
if (!visual.report || !Array.isArray(visual.report.sections)) {
  throw new Error("25-visual-report.json 必须包含 report.sections");
}

const report = visual.report;
report.title = input.report_title || report.title || "谈参高拜报告";
report.subtitle = `谈参高拜报告 · ${input.analyst_company_name || "中国移动"}`;
report.current_date = input.current_date || report.current_date || "";
for (const key of ["prompt", "user_prompt", "raw_prompt", "query", "brief", "input", "topic"]) delete report[key];

let markdownTableRepairs = 0;
for (const section of report.sections) {
  for (const block of Array.isArray(section.blocks) ? section.blocks : []) {
    if (block?.type !== "markdown" || typeof block.content !== "string") continue;
    let content = block.content;
    for (let pass = 0; pass < 8; pass += 1) {
      const repaired = repairMarkdownTables(content);
      content = repaired.content;
      markdownTableRepairs += repaired.repairs;
      if (repaired.repairs === 0) break;
    }
    block.content = content;
  }
}

const promptValues = [input.prompt, input.user_prompt, input.raw_prompt, input.query]
  .filter((value) => typeof value === "string" && value.trim().length >= 30);
const reportText = JSON.stringify(report);
if (promptValues.some((value) => reportText.includes(value.trim()))) {
  throw new Error("可视化结构中残留用户原始提示词，已停止生成 HTML");
}

const visualArtifactRules = [
  ["无结果或空字段叙述", /字段(?:为空|未提供|缺失)|(?:暂未|尚未)(?:体现|提供|披露)|未找到|未检索到|没有检索到|未发现(?:有效|相关)?|未通过.{0,16}核验|无法核实|公开渠道.{0,12}(?:未见|没有)|没有公开可查/],
  ["研究过程叙述", /本次研究发现|本轮(?:检索|搜索|研究)|研究过程|检索过程|遍历.{0,20}(?:新闻|公告|网页|网站)/],
  ["职责声明", /本报告(?:不编造|不杜撰|不虚构|的数据.{0,8}(?:真实|可靠)|.{0,12}(?:均已核验|严格依据))|(?:数据|内容|事实)均已核验/],
  ["内部工作章节", /(?:待确认问题|待核实信息|待核实或存在冲突的信息|会后动作|会前准备|下次.{0,8}拜访|资料时点与来源说明)/],
  ["内部补录任务", /(?:由|请)客户经理.{0,30}(?:补充|导出|更新|核实)|写入内部档案|补齐.{0,20}(?:字段|档案)|下次拜访前更新证据/]
];
const visualArtifactProblems = visualArtifactRules
  .filter(([, pattern]) => pattern.test(reportText))
  .map(([name]) => name);
if (visualArtifactProblems.length) {
  throw new Error(`可视化结构含不适合正式交付的内容：${visualArtifactProblems.join("、")}`);
}

const title = report.title;
const template = readUtf8(templatePath);
const printCss = readUtf8(printCssPath);
for (const placeholder of ["__TITLE__", "__VISUAL_REPORT_JSON__", "__REFERENCES_JSON__", "__PRINT_CSS__"]) {
  if (!template.includes(placeholder)) throw new Error(`模板缺少占位符：${placeholder}`);
}

const html = template
  .replaceAll("__TITLE__", escapeHtml(title))
  .replace("__VISUAL_REPORT_JSON__", () => safeJson(report))
  .replace("__REFERENCES_JSON__", () => safeJson(references))
  .replace("__PRINT_CSS__", () => printCss);

if (/__(?:TITLE|VISUAL_REPORT_JSON|REFERENCES_JSON|PRINT_CSS)__/.test(html)) {
  throw new Error("HTML 仍有未替换占位符");
}
if (promptValues.some((value) => html.includes(value.trim()))) {
  throw new Error("HTML 中残留用户原始提示词，已停止交付");
}

visual.report = report;
visual.references = references;
fs.writeFileSync(visualPath, `${JSON.stringify(visual, null, 2)}\n`, "utf8");
fs.writeFileSync(outputPath, html, "utf8");
console.log(`已生成正式 HTML：${outputPath}`);
if (markdownTableRepairs) console.log(`已修复 ${markdownTableRepairs} 处可视化节点造成的 Markdown 表格换行损坏`);
