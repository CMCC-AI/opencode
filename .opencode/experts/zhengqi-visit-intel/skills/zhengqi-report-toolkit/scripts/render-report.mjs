#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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
// 自动包装：设计代理输出顶层平铺结构（旧格式）时归一为 report 结构
if (!visual.report && Array.isArray(visual.sections)) {
  visual.report = {
    title: visual.title,
    subtitle: visual.subtitle,
    topic: visual.topic,
    current_date: visual.current_date,
    hero_stats: visual.hero_stats,
    sections: visual.sections,
  };
}
if (!visual.report || !Array.isArray(visual.report.sections)) {
  throw new Error("25-visual-report.json 必须包含 report.sections");
}

const report = visual.report;
report.title = input.report_title || report.title || "谈参高拜报告";
report.subtitle = `谈参高拜报告 · ${input.analyst_company_name || "中国移动"}`;
report.current_date = input.current_date || report.current_date || "";
for (const key of ["prompt", "user_prompt", "raw_prompt", "query", "brief", "input", "topic"]) delete report[key];

// ---------- 正文占位符回填（设计代理不抄正文，防超长截断） ----------
// markdown block 只放 `__CH{N}_{M}__`（N=二级章节序号，M=章内第 M 个正文块）。
// 脚本按 `## ` 切章（参考文献章节自动剥离）、按 `### ` 子节切块（章引言并入首块，
// 三级标题保留在内容块内），表格段剥离（由 table block 承载）；块数多于占位符时并入最后一个。
// 旧产物（markdown block 直接带正文原文）原样兼容。
const reportMdPath = path.join(workspace, "20-report.md");
const reportMd = fs.existsSync(reportMdPath) ? readUtf8(reportMdPath) : "";
const placeholderPattern = /^__CH(\d+)_(\d+)__$/;
const allMarkdownBlocks = report.sections.flatMap((section) => (Array.isArray(section.blocks) ? section.blocks : [])).filter((block) => block && block.type === "markdown");
const placeholderBlocks = allMarkdownBlocks.filter((block) => placeholderPattern.test(String(block.content || "").trim()));
const rawTextBlocks = allMarkdownBlocks.filter((block) => String(block.content || "").trim() && !placeholderPattern.test(String(block.content || "").trim()));
if (placeholderBlocks.length && rawTextBlocks.length) {
  throw new Error("markdown block 混用了占位符与正文原文：report-visual-designer 只能输出 __CH{N}_{M}__ 占位符，正文由渲染脚本从 20-report.md 回填");
}

if (placeholderBlocks.length) {
  if (!reportMd) throw new Error("占位符回填需要 20-report.md");
  const body = reportMd.split(/^##\s*参考文献\s*$/m)[0];
  const h2Matches = [...body.matchAll(/^##[ \t]+(.+)$/gm)];
  if (!h2Matches.length) throw new Error("20-report.md 没有二级章节标题，无法回填占位符");
  const chapters = [];
  for (let index = 0; index < h2Matches.length; index += 1) {
    const heading = h2Matches[index][1].trim();
    const start = h2Matches[index].index + h2Matches[index][0].length;
    const end = h2Matches[index + 1]?.index ?? body.length;
    const chapterBody = body.slice(start, end).trim();
    const explicitNumber = heading.match(/^(\d+)[、.．\s]/)?.[1];
    const h3Matches = [...chapterBody.matchAll(/^###[ \t]+(.+)$/gm)];
    const rawPieces = [];
    if (!h3Matches.length) {
      rawPieces.push(chapterBody);
    } else {
      const intro = chapterBody.slice(0, h3Matches[0].index).trim();
      for (let sub = 0; sub < h3Matches.length; sub += 1) {
        const pieceStart = h3Matches[sub].index;
        const pieceEnd = h3Matches[sub + 1]?.index ?? chapterBody.length;
        const piece = chapterBody.slice(pieceStart, pieceEnd).trim();
        rawPieces.push(sub === 0 && intro ? `${intro}\n\n${piece}` : piece);
      }
    }
    const segmentsOf = (piece) => piece.split(/\n{2,}/).map((segment) => segment.trim()).filter(Boolean);
    const tableSegments = rawPieces.flatMap((piece) => segmentsOf(piece)).filter((segment) => /^\|/m.test(segment));
    const pieces = rawPieces
      .map((piece) => segmentsOf(piece).filter((segment) => !/^\|/m.test(segment)).join("\n\n"))
      .filter((piece) => piece.trim());
    chapters.push({ number: String(explicitNumber || chapters.length + 1), heading, pieces, tablesStripped: tableSegments.length });
  }
  const chapterNumbers = new Set(chapters.map((chapter) => chapter.number));

  const slotsByChapter = new Map();
  for (const block of placeholderBlocks) {
    const match = String(block.content || "").trim().match(placeholderPattern);
    const key = match[1];
    if (!slotsByChapter.has(key)) slotsByChapter.set(key, []);
    slotsByChapter.get(key).push({ block, m: Number(match[2]) });
  }
  for (const key of slotsByChapter.keys()) {
    if (!chapterNumbers.has(key)) throw new Error(`占位符 __CH${key}_M__ 引用了不存在的章节（报告共 ${chapters.length} 章）`);
  }
  let filledSlots = 0;
  let mergedPieces = 0;
  let strippedTables = 0;
  for (const chapter of chapters) {
    const slots = (slotsByChapter.get(chapter.number) || []).sort((a, b) => a.m - b.m);
    if (!slots.length) throw new Error(`第 ${chapter.number} 章「${chapter.heading}」没有 markdown 占位符：每章至少 1 个，正文不能被组件替代`);
    for (const slot of slots) slot.block.content = "";
    for (const [i, piece] of chapter.pieces.entries()) {
      const slot = slots[Math.min(i, slots.length - 1)];
      slot.block.content = slot.block.content ? `${slot.block.content}\n\n${piece}` : piece;
    }
    if (chapter.pieces.length > slots.length) mergedPieces += chapter.pieces.length - slots.length;
    filledSlots += slots.length;
    strippedTables += chapter.tablesStripped;
  }
  console.log(`正文回填：${filledSlots} 个占位符，并入 ${mergedPieces} 块，剥离 ${strippedTables} 个表格段（表格由 table block 承载）`);
}

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

// 图表闸门：chart block 由 report-visual-designer 提供扁平 data，统一委托仓库级 chart-builder 技能校验并组装
// ECharts option（色板固定为中国移动蓝系）。校验失败的图表整块丢弃（日志报出标题与原因，渲染不中断）；
// 仍自带 option 的旧格式 block 原样保留，兼容历史产物。
const chartScriptDir = path.dirname(fileURLToPath(import.meta.url));
const chartBuilderCandidates = [
  path.resolve(chartScriptDir, "../../../../../skills/chart-builder/scripts/build-charts.mjs"),
  path.resolve(chartScriptDir, "../../chart-builder/scripts/build-charts.mjs"),
];
const chartBuilderPath = chartBuilderCandidates.find((candidate) => fs.existsSync(candidate));
if (!chartBuilderPath) throw new Error("缺少共享 chart-builder 脚本，请确认仓库级技能已部署");
const { injectChartOptions } = await import(pathToFileURL(chartBuilderPath).href);
const chartSummary = injectChartOptions(report.sections, {
  palette: ["#0066CC", "#2F8FE5", "#66B3F2", "#91A9C6", "#4F8055", "#B8873B", "#A33A32"],
});
let chartSummaryText = `图表校验：${chartSummary.kept}/${chartSummary.total} 张通过`;
if (chartSummary.dropped.length) {
  chartSummaryText += `，已丢弃 ${chartSummary.dropped.length} 张：\n` + chartSummary.dropped
    .map((dropped) => `  - 「${dropped.title}」：${dropped.errors.join("；")}`)
    .join("\n");
  console.log(chartSummaryText);
} else {
  console.log(chartSummaryText);
}
if (chartSummary.total && !chartSummary.kept) {
  console.log("警告：全部图表被丢弃，应退回 report-visual-designer 按契约重做图表数据");
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
