#!/usr/bin/env node

import { access, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const workspace = resolve(process.argv[2] || '');
if (!process.argv[2]) throw new Error('用法：node render-report.mjs <workspace_dir>');

const scriptDir = resolve(fileURLToPath(new URL('.', import.meta.url)));
const templatesDir = resolve(scriptDir, '..', 'templates');

const readText = async (path) => (await readFile(path, 'utf8')).replace(/^\uFEFF/, '');
const exists = async (path) => stat(path).then(() => true, () => false);

const visualPath = resolve(workspace, '35-visual-report.json');
if (!(await exists(visualPath))) throw new Error('缺少 35-visual-report.json');

const visual = JSON.parse(await readText(visualPath));
const template = await readText(resolve(templatesDir, 'report.html.tpl'));

// 读取总报告（参考文献解析与正文占位符回填共用）
const reportPath = resolve(workspace, '30-final-report.md');
const md = (await exists(reportPath)) ? await readText(reportPath) : '';
const refHeading = md.match(/^[ \t]*##[ \t]*引用来源[ \t]*$/m);
const reportBody = refHeading ? md.slice(0, refHeading.index) : md;

// ---------- 正文占位符回填（防止 dt-viz 抄写正文导致超长截断与 [N] 丢失） ----------
// 新契约：markdown block 只放 `__CH{N}_{M}__`（N=章序号按文档顺序，M=章内第 M 个正文块）。
// 脚本按 `## ` 标题切章、按空行切段（剥离表格段——表格由 table block 承载），按顺序回填；
// 段落数多于占位符时并入最后一个，占位符多于段落时填空，正文永不丢失。
// 旧产物（markdown block 直接带正文原文）原样兼容。
const placeholderPattern = /^__CH(\d+)_(\d+)__$/;
const allMarkdownBlocks = (visual.sections || []).flatMap((s) => (Array.isArray(s.blocks) ? s.blocks : [])).filter((b) => b && b.type === 'markdown');
const placeholderBlocks = allMarkdownBlocks.filter((b) => placeholderPattern.test(String(b.content || '').trim()));
const rawTextBlocks = allMarkdownBlocks.filter((b) => String(b.content || '').trim() && !placeholderPattern.test(String(b.content || '').trim()));
if (placeholderBlocks.length && rawTextBlocks.length) {
  throw new Error('35-visual-report.json 的 markdown block 混用了占位符与正文原文：dt-viz 只能输出 __CH{N}_{M}__ 占位符，正文由渲染脚本从 30-final-report.md 回填');
}

if (placeholderBlocks.length) {
  if (!md) throw new Error('占位符回填需要 30-final-report.md');
  const h2Matches = [...reportBody.matchAll(/^##[ \t]+(.+)$/gm)];
  if (!h2Matches.length) throw new Error('30-final-report.md 没有二级章节标题，无法回填占位符');
  const chapters = h2Matches.map((match, index) => {
    const heading = match[1].trim();
    const start = match.index + match[0].length;
    const end = h2Matches[index + 1]?.index ?? reportBody.length;
    const chapterBody = reportBody.slice(start, end).trim();
    // 段落切分 + 表格段剥离（表格必须已由 table block 承载，重复渲染会破坏排版）
    const segments = chapterBody.split(/\n{2,}/).map((segment) => segment.trim()).filter(Boolean);
    const tableSegments = segments.filter((segment) => /^\|/m.test(segment));
    const pieces = segments.filter((segment) => !/^\|/m.test(segment));
    const explicitNumber = heading.match(/^(\d+)[、.．\s]/)?.[1];
    return { number: explicitNumber || String(index + 1), heading, pieces, tablesStripped: tableSegments.length };
  });
  const chapterNumbers = new Set(chapters.map((c) => c.number));

  const slotsByChapter = new Map();
  for (const block of placeholderBlocks) {
    const match = String(block.content || '').trim().match(placeholderPattern);
    const key = match[1];
    if (!slotsByChapter.has(key)) slotsByChapter.set(key, []);
    slotsByChapter.get(key).push({ block, m: Number(match[2]) });
  }
  for (const key of slotsByChapter.keys()) {
    if (!chapterNumbers.has(key)) throw new Error(`占位符 __CH${key}_M__ 引用了不存在的章节（报告共 ${chapters.length} 章）`);
  }

  let filledSlots = 0;
  let mergedParagraphs = 0;
  let strippedTables = 0;
  for (const chapter of chapters) {
    const slots = (slotsByChapter.get(chapter.number) || []).sort((a, b) => a.m - b.m);
    if (!slots.length) throw new Error(`第 ${chapter.number} 章「${chapter.heading}」没有 markdown 占位符：每章至少 1 个，正文不能被组件替代`);
    for (const slot of slots) slot.block.content = '';
    for (const [i, piece] of chapter.pieces.entries()) {
      const slot = slots[Math.min(i, slots.length - 1)];
      slot.block.content = slot.block.content ? `${slot.block.content}\n\n${piece}` : piece;
    }
    if (chapter.pieces.length > slots.length) mergedParagraphs += chapter.pieces.length - slots.length;
    filledSlots += slots.length;
    strippedTables += chapter.tablesStripped;
  }
  process.stdout.write(`正文回填：${filledSlots} 个占位符，并入 ${mergedParagraphs} 段，剥离 ${strippedTables} 个表格段（表格由 table block 承载）\n`);
}

// 从 30-final-report.md 末尾「## 引用来源」章节解析参考文献（先跑 finalize-report.mjs 生成）
// 行格式：`N. [标题](URL)` 或 `N. <URL>`
const references = [];
if (md && refHeading) {
  const refSection = md.slice(refHeading.index);
  const linePattern = /^[ \t]*(\d+)\.[ \t]+(?:\[([^\]]*)\]\(([^)\s]+)\)|<([^>\s]+)>)/gm;
  for (const m of refSection.matchAll(linePattern)) {
    const n = Number(m[1]);
    const title = m[2] || '';
    const url = m[3] || m[4] || '';
    references.push({ n, title, url });
  }
  // 引用闸门：条目必须有真实标题、每个编号必须在正文有 [N] 标记、不得残留 <cite> 中间格式
  const badTitles = references.filter((r) => !r.title.trim() || /^https?:\/\//i.test(r.title.trim()));
  if (badTitles.length) throw new Error(`参考文献缺少真实标题（第 ${badTitles.map((r) => r.n).join('、')} 条）：请补齐 25-sources.json 后重跑 finalize-report.mjs`);
  const citedNumbers = new Set([...reportBody.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])));
  const uncited = references.filter((r) => !citedNumbers.has(r.n));
  if (references.length && uncited.length) throw new Error(`参考文献在正文没有对应的 [N] 引用标记（第 ${uncited.map((r) => r.n).join('、')} 条）`);
  if (!references.length && /<cite>/.test(md)) throw new Error('正文仍是 <cite> 中间格式，请先执行 finalize-report.mjs');
}

// viz 闸门：可视化正文必须保留 [N] 引用标记，不允许组件替代正文散文
// （占位符模式下正文由脚本从 md 原文回填，[N] 自动保留；此闸门主要防组件丢失标记）
const vizSections = visual.sections || [];
const markdownBlocks = vizSections.flatMap((s) => s.blocks || []).filter((b) => b.type === 'markdown');
if (references.length) {
  const vizText = JSON.stringify(vizSections);
  const vizCited = new Set([...vizText.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])));
  const vizMissing = references.filter((r) => !vizCited.has(r.n));
  if (!markdownBlocks.length) throw new Error('35-visual-report.json 没有任何 markdown 正文块：dt-viz 不得用组件替代正文，须为每章输出 __CH{N}_{M}__ 占位符（脚本自动回填正文）后重跑');
  if (vizMissing.length) throw new Error(`可视化正文缺少引用标记（第 ${vizMissing.map((r) => r.n).join('、')} 条）：正文回填自动保留 [N]，请检查 table/chart 等组件是否遗漏了原表内的标记`);
}

const safeJson = (value) => JSON.stringify(value).replace(/<\/script>/gi, '<\\/script>');

// 图表闸门：chart block 由 dt-viz 提供扁平 data，统一委托仓库级 chart-builder 技能校验并组装 ECharts option。
// 校验失败的图表整块丢弃（日志报出标题与原因，渲染不中断），保证 40-report.html 内嵌的都是结构合法的 option；
// 仍自带 option 的旧格式 block 原样保留，兼容历史产物。
const chartBuilderCandidates = [
  resolve(scriptDir, '../../../../../skills/chart-builder/scripts/build-charts.mjs'),
  resolve(scriptDir, '../../chart-builder/scripts/build-charts.mjs'),
];
const chartBuilderPath = (await Promise.all(chartBuilderCandidates.map((candidate) => access(candidate).then(() => candidate, () => null)))).find(Boolean);
if (!chartBuilderPath) throw new Error('缺少共享 chart-builder 脚本，请确认仓库级技能已部署');
const { injectChartOptions } = await import(pathToFileURL(chartBuilderPath).href);

const chartSummary = injectChartOptions(vizSections);
process.stdout.write(`图表校验：${chartSummary.kept}/${chartSummary.total} 张通过`);
if (chartSummary.dropped.length) {
  process.stdout.write(`，已丢弃 ${chartSummary.dropped.length} 张：\n`);
  for (const d of chartSummary.dropped) process.stdout.write(`  - 「${d.title}」：${d.errors.join('；')}\n`);
} else {
  process.stdout.write('\n');
}
if (chartSummary.total && !chartSummary.kept) {
  process.stdout.write('警告：全部图表被丢弃，应责令 dt-viz 按契约重做图表数据后重渲染\n');
}

const html = template
  .replaceAll('__TITLE__', visual.title || '深度研究报告')
  .replace('__VISUAL_REPORT_JSON__', () => safeJson(visual))
  .replace('__REFERENCES_JSON__', () => safeJson(references));

if (/__(?:TITLE|VISUAL_REPORT_JSON|REFERENCES_JSON)__/.test(html)) {
  throw new Error('HTML 模板仍有未替换占位符');
}

const outputPath = resolve(workspace, '40-report.html');
await writeFile(outputPath, html, 'utf8');
process.stdout.write(`HTML 报告完成：${outputPath}\n`);
process.stdout.write(`参考文献：${references.length} 条\n`);
