#!/usr/bin/env node

import { access, readFile, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const workspace = resolve(process.argv[2] || '');
if (!process.argv[2]) throw new Error('用法：node render-report.mjs <workspace_dir>');
const scriptDir = resolve(fileURLToPath(new URL('.', import.meta.url)));
const opencodeRoot = resolve(scriptDir, '..');
const readText = async (file) => (await readFile(file, 'utf8')).replace(/^\uFEFF/, '');
const readJson = async (file) => JSON.parse(await readText(file));
const exists = async (file) => stat(file).then(() => true, () => false);

const reportPath = resolve(workspace, '20-report.md');
const visualPath = resolve(workspace, '25-visual-report.json');
if (!(await exists(reportPath)) || !(await exists(visualPath))) throw new Error('缺少 20-report.md 或 25-visual-report.json');
const markdown = await readText(reportPath);
const visual = await readJson(visualPath);
const input = await readJson(resolve(workspace, '00-input.json'));
const references = await readJson(resolve(workspace, '22-references.json'));
const body = markdown.split(/^## 参考文献\s*$/m)[0].trim();

// ---------- 章节切分（章号识别中文序号「一、二、…」与 ASCII 数字） ----------
// 代理按章标题的中文序号编占位符；未编号 H2（通报引言、摘要等）在序号被显式编号占用时不参与
// CH 匹配（摘要走 __ABSTRACT__；空引言只会产生未覆盖警告，不阻塞渲染）。
const CHINESE_DIGITS = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const headingNumber = (heading) => {
  const ascii = heading.match(/^(\d+)[、.．\s]/)?.[1];
  if (ascii) return ascii;
  const chinese = heading.match(/^([一二三四五六七八九十]{1,3})[、.．\s]/)?.[1];
  if (!chinese) return null;
  if (chinese === '十') return '10';
  if (chinese.length === 2 && chinese[0] === '十') return String(10 + (CHINESE_DIGITS[chinese[1]] || 0));
  if (chinese.length === 2 && chinese[1] === '十') return String((CHINESE_DIGITS[chinese[0]] || 0) * 10);
  if (chinese.length === 3 && chinese[1] === '十') return String((CHINESE_DIGITS[chinese[0]] || 0) * 10 + (CHINESE_DIGITS[chinese[2]] || 0));
  return CHINESE_DIGITS[chinese] != null ? String(CHINESE_DIGITS[chinese]) : null;
};
const h2Matches = [...body.matchAll(/^##\s+(.+)$/gm)];
const explicitNumbers = new Set(h2Matches.map((match) => headingNumber(match[1].trim())).filter(Boolean));
const chapters = [];
for (let chapterIndex = 0; chapterIndex < h2Matches.length; chapterIndex += 1) {
  const heading = h2Matches[chapterIndex][1].trim();
  const start = h2Matches[chapterIndex].index + h2Matches[chapterIndex][0].length;
  const end = h2Matches[chapterIndex + 1]?.index ?? body.length;
  const chapterBody = body.slice(start, end).trim();
  const explicit = headingNumber(heading);
  const number = explicit || (explicitNumbers.has(String(chapterIndex + 1)) ? `x${chapterIndex + 1}` : String(chapterIndex + 1));
  const h3Matches = [...chapterBody.matchAll(/^###\s+(.+)$/gm)];
  const isSeparator = (segment) => /^-{3,}$|^\*{3,}$|^_{3,}$/.test(segment.trim());
  const pieces = [];
  if (!h3Matches.length) {
    // 无子节：按段落切分（跳过分隔线），代理发出的多个占位符可分段承载
    for (const paragraph of chapterBody.split(/\n{2,}/).map((segment) => segment.trim()).filter(Boolean)) {
      if (!isSeparator(paragraph)) pieces.push(paragraph);
    }
  } else {
    const intro = chapterBody.slice(0, h3Matches[0].index).trim();
    for (let sub = 0; sub < h3Matches.length; sub += 1) {
      const piece = chapterBody.slice(h3Matches[sub].index, h3Matches[sub + 1]?.index ?? chapterBody.length).trim();
      pieces.push(sub === 0 && intro ? `${intro}\n\n${piece}` : piece);
    }
  }
  chapters.push({ number, heading, body: chapterBody, pieces });
}
const abstractChapter = chapters.find((chapter) => chapter.heading === '摘要');

let replacements = 0;
let mergedPieces = 0;
const hasAnchors = (visual.sections || []).some((section) =>
  (section.blocks || []).some((block) => block.type !== 'markdown' && block.after));
const normalizeAnchor = (value) => String(value || '').trim().replace(/^__|__$/g, '');
const anchorByFilledContent = new Map();
for (const chapter of chapters) {
  anchorByFilledContent.set(chapter.body, `CH${chapter.number}_1`);
  for (const [i, piece] of chapter.pieces.entries()) anchorByFilledContent.set(piece, `CH${chapter.number}_${i + 1}`);
}
if (abstractChapter) anchorByFilledContent.set(abstractChapter.body, 'ABSTRACT');
const markdownAnchor = (block) => normalizeAnchor(block.anchor || (/^__(?:ABSTRACT|CH\d+_\d+)__$/.test(String(block.content || '').trim())
  ? block.content
  : anchorByFilledContent.get(String(block.content || ''))));

for (const section of visual.sections || []) {
  const blocks = section.blocks || [];
  const markdownKeys = new Set(blocks.filter((block) => block.type === 'markdown')
    .map(markdownAnchor)
    .filter((key) => /^(?:ABSTRACT|CH\d+_\d+)$/.test(key)));
  const anchored = new Map();
  const base = [];
  for (const block of blocks) {
    const target = normalizeAnchor(block.after);
    if (block.type !== 'markdown' && target && markdownKeys.has(target)) {
      if (!anchored.has(target)) anchored.set(target, []);
      const cleanBlock = { ...block, after: target };
      anchored.get(target).push(cleanBlock);
    } else {
      if (block.type !== 'markdown' && Number(visual.layout_version || 0) >= 2 && !target) {
        throw new Error(`新版可视化组件缺少 after 正文锚点：${block.chart?.title || block.title || block.type}`);
      }
      const cleanBlock = block.type === 'markdown'
        ? { ...block, anchor: markdownAnchor(block) }
        : { ...block };
      base.push(cleanBlock);
    }
  }
  section.blocks = base.flatMap((block) => {
    const key = block.type === 'markdown' ? markdownAnchor(block) : '';
    return key && anchored.has(key) ? [block, ...anchored.get(key)] : [block];
  });
}

// 宽松回填：按章号匹配占位符。占位符多于章内块数时多余的填空；少于时剩余块并入最后一个占位符，
// 正文永不丢失；未匹配章节的占位符置空并警告。渲染不因占位符失配而失败（此前 18 个失配占位符
// 曾导致整个 HTML/PDF 降级交付）。
const abstractBlocks = [];
const slotsByChapter = new Map();
for (const section of visual.sections || []) {
  for (const block of Array.isArray(section.blocks) ? section.blocks : []) {
    if (block.type !== 'markdown') continue;
    const text = String(block.content || '').trim();
    if (text === '__ABSTRACT__') { abstractBlocks.push(block); continue; }
    const match = text.match(/^__CH(\d+)_(\d+)__$/);
    if (match) {
      if (!slotsByChapter.has(match[1])) slotsByChapter.set(match[1], []);
      slotsByChapter.get(match[1]).push({ block, m: Number(match[2]) });
    }
  }
}
// 旧格式产物（markdown 直接带正文原文）不走回填与覆盖检查，保持旧行为
const placeholderMode = abstractBlocks.length > 0 || [...slotsByChapter.values()].some((slots) => slots.length > 0);
if (placeholderMode) {
  const backfillWarnings = [];
  for (const block of abstractBlocks) {
    if (abstractChapter) {
      block.content = abstractChapter.body;
      replacements += 1;
    } else {
      block.content = '';
      backfillWarnings.push('__ABSTRACT__ 未匹配到「摘要」章节，已置空');
    }
  }
  const coveredNumbers = new Set(abstractChapter && abstractBlocks.length ? [abstractChapter.number] : []);
  for (const chapter of chapters) {
    const slots = (slotsByChapter.get(chapter.number) || []).sort((a, b) => a.m - b.m);
    slotsByChapter.delete(chapter.number);
    if (!slots.length) continue;
    coveredNumbers.add(chapter.number);
    for (const slot of slots) slot.block.content = '';
    for (const [i, piece] of chapter.pieces.entries()) {
      const slot = slots[Math.min(i, slots.length - 1)];
      slot.block.content = slot.block.content ? `${slot.block.content}\n\n${piece}` : piece;
    }
    if (chapter.pieces.length > slots.length) mergedPieces += chapter.pieces.length - slots.length;
    replacements += slots.length;
  }
  for (const chapter of chapters) {
    if (!coveredNumbers.has(chapter.number) && chapter.pieces.length > 0) {
      backfillWarnings.push(`第 ${chapter.number} 章「${chapter.heading}」未被占位符覆盖，该章正文未进入 HTML`);
    }
  }
  for (const [key, slots] of slotsByChapter) {
    for (const slot of slots) slot.block.content = '';
    backfillWarnings.push(`占位符 __CH${key}_M__ 未匹配到任何章节（报告章号：${[...coveredNumbers].join('、')}），已置空`);
  }
  if (backfillWarnings.length) process.stdout.write(`警告：${backfillWarnings.join('；')}\n`);
  process.stdout.write(`正文回填：${replacements} 个占位符，并入 ${mergedPieces} 块\n`);
}

let removedCards = 0;
let deduplicatedTables = 0;
for (const section of visual.sections || []) {
  const prose = (section.blocks || []).filter((block) => block.type === 'markdown').map((block) => String(block.content || ''));
  section.blocks = (section.blocks || []).filter((block) => {
    if (['stat_grid', 'chip_list'].includes(block.type)) { removedCards += 1; return false; }
    if (block.type !== 'table' || !Array.isArray(block.rows) || block.rows.length < 2) return true;
    const rowKeys = block.rows.map((row) => String(row?.[0] || '').trim()).filter((value) => value.length >= 2).slice(0, 8);
    const duplicate = rowKeys.length >= 2 && prose.some((content) => {
      const hits = rowKeys.filter((key) => content.includes(key)).length;
      return /^\s*\|.+\|\s*$/m.test(content) && hits >= Math.max(2, Math.ceil(rowKeys.length * 0.6));
    });
    if (duplicate) deduplicatedTables += 1;
    return !duplicate;
  });
}

// 兼容旧 visual JSON：它没有 after，常把组件堆在正文前。旧产物只做“正文优先”归位；
// 新产物必须使用 after，因而不依赖模型输出数组的偶然顺序。
let reorderedSections = 0;
if (!hasAnchors && Number(visual.layout_version || 0) < 2) {
  for (const section of visual.sections || []) {
    const prose = (section.blocks || []).filter((block) => block.type === 'markdown');
    const decorations = (section.blocks || []).filter((block) => block.type !== 'markdown');
    if (prose.length && decorations.length) {
      const anchor = markdownAnchor(prose[0]);
      section.blocks = [prose[0], ...decorations.map((block) => ({ ...block, after: anchor })), ...prose.slice(1)];
      reorderedSections += 1;
    }
  }
}

visual.layout_version = 2;
delete visual.topic;
delete visual.query;
delete visual.prompt;
delete visual.user_prompt;
delete visual.raw_prompt;
visual.hero_stats = [];
visual.current_date = input.current_date || visual.current_date || '';
if (!visual.title) visual.title = '巡察综合情况报告';
if (!(visual.sections || []).some((section) => (section.blocks || []).some((block) => block.type === 'markdown' && String(block.content || '').trim()))) {
  throw new Error('25-visual-report.json 没有可渲染的正文');
}

const promptValues = [input.topic, input.prompt, input.user_prompt, input.raw_prompt, input.query]
  .filter((value) => typeof value === 'string' && value.trim().length >= 20);
const visibleVisual = JSON.stringify(visual);
if (promptValues.some((value) => visibleVisual.includes(value.trim()))) throw new Error('可视化结构中残留用户原始 query/prompt');

// 图表闸门：chart block 由 viz-specialist 提供扁平 data，统一委托仓库级 chart-builder 技能校验并组装 ECharts option
// （色板用正式报告蓝灰色系）。校验失败的图表整块丢弃（日志报出标题与原因，渲染不中断）；
// 仍自带 option 的旧格式 block 原样保留，兼容历史产物。
const chartBuilderCandidates = [
  resolve(scriptDir, '../../../../../skills/chart-builder/scripts/build-charts.mjs'),
  resolve(scriptDir, '../../chart-builder/scripts/build-charts.mjs'),
];
const chartBuilderPath = (await Promise.all(chartBuilderCandidates.map((candidate) => access(candidate).then(() => candidate, () => null)))).find(Boolean);
if (!chartBuilderPath) throw new Error('缺少共享 chart-builder 脚本，请确认仓库级技能已部署');
const { injectChartOptions } = await import(pathToFileURL(chartBuilderPath).href);
const chartSummary = injectChartOptions(visual.sections || [], {
  palette: ['#4b6685', '#6485b3', '#8fa8c7', '#b3c5dc', '#d3deeb'],
});
process.stdout.write(`图表校验：${chartSummary.kept}/${chartSummary.total} 张通过`);
if (chartSummary.dropped.length) {
  process.stdout.write(`，已丢弃 ${chartSummary.dropped.length} 张：\n`);
  for (const dropped of chartSummary.dropped) process.stdout.write(`  - 「${dropped.title}」：${dropped.errors.join('；')}\n`);
} else {
  process.stdout.write('\n');
}
if (chartSummary.total && !chartSummary.kept) {
  process.stdout.write('警告：全部图表被丢弃，应退回 viz-specialist 按契约重做图表数据\n');
}

const template = await readText(resolve(opencodeRoot, 'templates/report.html.tpl'));
const printCss = await readText(resolve(opencodeRoot, 'templates/report-print.css'));
const safeJson = (value) => JSON.stringify(value).replace(/<\/script>/gi, '<\\/script>');
const safeTitle = String(visual.title).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const html = template
  .replaceAll('__TITLE__', safeTitle)
  .replace('__VISUAL_REPORT_JSON__', () => safeJson(visual))
  .replace('__REFERENCES_JSON__', () => safeJson(references))
  .replace('__PRINT_CSS__', () => printCss);
if (/__(?:TITLE|VISUAL_REPORT_JSON|REFERENCES_JSON|PRINT_CSS|ABSTRACT|CH\d+_\d+)__/.test(html)) throw new Error('HTML 模板仍有未替换占位符');
if (promptValues.some((value) => html.includes(value.trim()))) throw new Error('HTML 中残留用户原始 query/prompt');

await writeFile(visualPath, `${JSON.stringify(visual, null, 2)}\n`, 'utf8');
await writeFile(resolve(workspace, '30-report.html'), html, 'utf8');
process.stdout.write(`HTML 报告完成：填充 ${replacements} 个正文块，移除 ${removedCards} 个网页卡片，去重 ${deduplicatedTables} 个表格，调整 ${reorderedSections} 个旧版章节。\n`);
