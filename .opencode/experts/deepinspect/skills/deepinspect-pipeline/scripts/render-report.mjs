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

// ---------- 正文回填 + 图表闸门：委托仓库级 report-render 引擎（与独立技能同一实现） ----------
// 引擎能力：章号自动识别（中文序号/数字含前导零/无编号 H2）、after 锚点归位、自适应粒度宽松
// 回填（块数不齐时并入最后一个占位符，正文永不丢失，失配只警告不失败——此前 18 个失配
// 占位符曾导致整条 HTML/PDF 链路降级交付）、图表扁平 data 校验并组装 ECharts option
// （蓝灰色系色板；坏图整块丢弃并报原因）。旧格式带正文/option 的产物原样兼容。
const renderEngineCandidates = [
  resolve(scriptDir, '../../../../../skills/report-render/scripts/render-report.mjs'),
  resolve(scriptDir, '../../report-render/scripts/render-report.mjs'),
];
const renderEnginePath = (await Promise.all(renderEngineCandidates.map((candidate) => access(candidate).then(() => candidate, () => null)))).find(Boolean);
if (!renderEnginePath) throw new Error('缺少共享 report-render 引擎，请确认仓库级技能已部署');
const { backfillAndGate, copyLibFiles } = await import(pathToFileURL(renderEnginePath).href);
const renderSummary = await backfillAndGate(visual, markdown, {
  palette: ['#4b6685', '#6485b3', '#8fa8c7', '#b3c5dc', '#d3deeb'],
});
const replacements = renderSummary.backfill.replacements;
const mergedPieces = renderSummary.backfill.mergedPieces;
const hasAnchors = (visual.sections || []).some((section) =>
  (section.blocks || []).some((block) => block.type !== 'markdown' && block.after));
if (renderSummary.backfill.warnings.length) {
  process.stdout.write(`警告：${renderSummary.backfill.warnings.join('；')}\n`);
}
if (replacements) {
  process.stdout.write(`正文回填：${replacements} 个占位符，并入 ${mergedPieces} 块\n`);
}

const removedCards = 0;
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

// 兼容旧 visual JSON：它没有 after，常把组件堆在正文前。旧产物只做"正文优先"归位；
// 新产物的 after 锚点归位已由引擎完成，这里只处理 layout_version < 2 的旧产物。
let reorderedSections = 0;
if (!hasAnchors && Number(visual.layout_version || 0) < 2) {
  for (const section of visual.sections || []) {
    const prose = (section.blocks || []).filter((block) => block.type === 'markdown');
    const decorations = (section.blocks || []).filter((block) => block.type !== 'markdown');
    if (prose.length && decorations.length) {
      section.blocks = [prose[0], ...decorations, ...prose.slice(1)];
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
await copyLibFiles(workspace);
process.stdout.write(`HTML 报告完成：填充 ${replacements} 个正文块，移除 ${removedCards} 个网页卡片，去重 ${deduplicatedTables} 个表格，调整 ${reorderedSections} 个旧版章节。\n`);
