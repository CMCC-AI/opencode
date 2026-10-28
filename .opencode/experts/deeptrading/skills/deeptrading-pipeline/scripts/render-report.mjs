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

// ---------- 正文回填 + 图表闸门：委托仓库级 report-render 引擎（与独立技能同一实现） ----------
// 引擎能力：章号自动识别（中文序号/数字含前导零/无编号 H2）、自适应粒度宽松回填（正文永不丢失，
// 失配只警告不失败、[N] 引用标记自动保留）、图表扁平 data 校验并组装 ECharts option（坏图整块
// 丢弃并报原因）。dt-viz 只产占位符与扁平 data；旧格式带正文/option 的产物原样兼容。
const renderEngineCandidates = [
  resolve(scriptDir, '../../../../../skills/report-render/scripts/render-report.mjs'),
  resolve(scriptDir, '../../report-render/scripts/render-report.mjs'),
];
const renderEnginePath = (await Promise.all(renderEngineCandidates.map((candidate) => access(candidate).then(() => candidate, () => null)))).find(Boolean);
if (!renderEnginePath) throw new Error('缺少共享 report-render 引擎，请确认仓库级技能已部署');
const { backfillAndGate, copyLibFiles } = await import(pathToFileURL(renderEnginePath).href);
const renderSummary = await backfillAndGate(visual, md);
if (renderSummary.backfill.warnings.length) {
  process.stdout.write(`警告：${renderSummary.backfill.warnings.join('；')}\n`);
}
if (renderSummary.backfill.replacements) {
  process.stdout.write(`正文回填：${renderSummary.backfill.replacements} 个占位符，并入 ${renderSummary.backfill.mergedPieces} 块，剥离 ${renderSummary.backfill.strippedTables} 个表格段（表格由 table block 承载）\n`);
}
process.stdout.write(`图表校验：${renderSummary.charts.kept}/${renderSummary.charts.total} 张通过`);
if (renderSummary.charts.dropped.length) {
  process.stdout.write(`，已丢弃 ${renderSummary.charts.dropped.length} 张：\n`);
  for (const dropped of renderSummary.charts.dropped) process.stdout.write(`  - 「${dropped.title}」：${dropped.errors.join('；')}\n`);
} else {
  process.stdout.write('\n');
}
if (renderSummary.charts.total && !renderSummary.charts.kept) {
  process.stdout.write('警告：全部图表被丢弃，应责令 dt-viz 按契约重做图表数据后重渲染\n');
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

const html = template
  .replaceAll('__TITLE__', visual.title || '深度研究报告')
  .replace('__VISUAL_REPORT_JSON__', () => safeJson(visual))
  .replace('__REFERENCES_JSON__', () => safeJson(references));

if (/__(?:TITLE|VISUAL_REPORT_JSON|REFERENCES_JSON)__/.test(html)) {
  throw new Error('HTML 模板仍有未替换占位符');
}

const outputPath = resolve(workspace, '40-report.html');
await writeFile(outputPath, html, 'utf8');
await copyLibFiles(dirname(outputPath));
process.stdout.write(`HTML 报告完成：${outputPath}\n`);
process.stdout.write(`参考文献：${references.length} 条\n`);
