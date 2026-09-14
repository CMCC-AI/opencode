#!/usr/bin/env node

import { readFile, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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
const h2Matches = [...body.matchAll(/^##\s+(.+)$/gm)];
const contentMap = new Map();

for (let chapterIndex = 0; chapterIndex < h2Matches.length; chapterIndex += 1) {
  const heading = h2Matches[chapterIndex][1].trim();
  const start = h2Matches[chapterIndex].index + h2Matches[chapterIndex][0].length;
  const end = h2Matches[chapterIndex + 1]?.index ?? body.length;
  const chapterBody = body.slice(start, end).trim();
  const explicitNumber = heading.match(/^(\d+)/)?.[1];
  const chapterNumber = explicitNumber || String(chapterIndex + 1);
  if (heading === '摘要') contentMap.set('__ABSTRACT__', chapterBody);
  const h3Matches = [...chapterBody.matchAll(/^###\s+(.+)$/gm)];
  if (!h3Matches.length) {
    contentMap.set(`__CH${chapterNumber}_1__`, chapterBody);
    continue;
  }
  const intro = chapterBody.slice(0, h3Matches[0].index).trim();
  for (let subIndex = 0; subIndex < h3Matches.length; subIndex += 1) {
    const subStart = h3Matches[subIndex].index;
    const subEnd = h3Matches[subIndex + 1]?.index ?? chapterBody.length;
    const subsection = chapterBody.slice(subStart, subEnd).trim();
    contentMap.set(`__CH${chapterNumber}_${subIndex + 1}__`, subIndex === 0 && intro ? `${intro}\n\n${subsection}` : subsection);
  }
}

let replacements = 0;
const unresolved = [];
const hasAnchors = (visual.sections || []).some((section) =>
  (section.blocks || []).some((block) => block.type !== 'markdown' && block.after));
const normalizeAnchor = (value) => String(value || '').trim().replace(/^__|__$/g, '');
const anchorByFilledContent = new Map([...contentMap.entries()].map(([key, value]) => [value, normalizeAnchor(key)]));
const markdownAnchor = (block) => normalizeAnchor(block.anchor || (/^__(?:ABSTRACT|CH\d+_\d+)__$/.test(String(block.content || '').trim())
  ? block.content : anchorByFilledContent.get(String(block.content || ''))));

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

for (const section of visual.sections || []) {
  for (const block of section.blocks || []) {
    if (block.type !== 'markdown') continue;
    const key = normalizeAnchor(block.anchor || block.content);
    if (!/^(?:ABSTRACT|CH\d+_\d+)$/.test(key)) continue;
    const placeholder = `__${key}__`;
    if (!contentMap.has(placeholder)) unresolved.push(placeholder);
    else { block.anchor = key; block.content = contentMap.get(placeholder); replacements += 1; }
  }
}
if (unresolved.length) throw new Error(`无法填充正文占位符：${[...new Set(unresolved)].join(', ')}`);

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
