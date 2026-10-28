#!/usr/bin/env node
// mstock 渲染薄入口：读取 30-visual-report.json（扁平 data 契约产物），
// 委托仓库级 report-render 引擎（backfillAndGate）回填正文占位符 + 校验组装图表 option，
// 再填入 mstock 自有模板（支持 progress_bar / mini_kpi_row 等额外 block 类型）。
// 用法：node render-report.mjs <workspace_dir>
// 前置：inject_meta.py 已注入 topic；本脚本取代旧 render_html.py（Python 版）。

import { access, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const workspace = resolve(process.argv[2] || '');
if (!process.argv[2]) throw new Error('用法：node render-report.mjs <workspace_dir>');

const scriptDir = resolve(fileURLToPath(new URL('.', import.meta.url)));
const templatesDir = resolve(scriptDir, '..', 'templates');
const readText = async (path) => (await readFile(path, 'utf8')).replace(/^\uFEFF/, '');
const exists = async (path) => stat(path).then(() => true, () => false);

const visualPath = resolve(workspace, '30-visual-report.json');
if (!(await exists(visualPath))) throw new Error('缺少 30-visual-report.json');
const reportPath = resolve(workspace, '20-comparison-report.md');
if (!(await exists(reportPath))) throw new Error('缺少 20-comparison-report.md');

const visual = JSON.parse(await readText(visualPath));
const markdown = await readText(reportPath);
const template = await readText(resolve(templatesDir, 'report.html.tpl'));

// ---------- 正文回填 + 图表闸门：委托仓库级 report-render 引擎 ----------
// 引擎能力：章号自动识别（中文序号/数字含前导零/无编号 H2）、after 锚点归位、
// 自适应粒度宽松回填（块数不齐时并入最后占位符，正文永不丢失，失配只警告不失败）。
const renderEngineCandidates = [
  resolve(scriptDir, '../../../../../skills/report-render/scripts/render-report.mjs'),
  resolve(scriptDir, '../../report-render/scripts/render-report.mjs'),
];
const renderEnginePath = (await Promise.all(renderEngineCandidates.map((candidate) => access(candidate).then(() => candidate, () => null)))).find(Boolean);
if (!renderEnginePath) throw new Error('缺少共享 report-render 引擎，请确认仓库级技能已部署');
const { backfillAndGate, copyLibFiles } = await import(pathToFileURL(renderEnginePath).href);
const renderSummary = await backfillAndGate(visual, markdown, {
  palette: ['#7c3aed', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#94a3b8'],
});
if (renderSummary.backfill.warnings.length) {
  process.stdout.write(`警告：${renderSummary.backfill.warnings.join('；')}\n`);
}
if (renderSummary.backfill.replacements) {
  process.stdout.write(`正文回填：${renderSummary.backfill.replacements} 个占位符，并入 ${renderSummary.backfill.mergedPieces} 块，剥离 ${renderSummary.backfill.strippedTables} 个表格段\n`);
}
process.stdout.write(`图表校验：${renderSummary.charts.kept}/${renderSummary.charts.total} 张通过`);
if (renderSummary.charts.dropped.length) {
  process.stdout.write(`，已丢弃 ${renderSummary.charts.dropped.length} 张：\n`);
  for (const dropped of renderSummary.charts.dropped) process.stdout.write(`  - 「${dropped.title}」：${dropped.errors.join('；')}\n`);
} else {
  process.stdout.write('\n');
}

// ---------- 填入 mstock 模板（支持 progress_bar / mini_kpi_row 等额外 block 类型） ----------
const safeJson = (value) => JSON.stringify(value).replace(/<\/script>/gi, '<\\/script>');
const html = template
  .replaceAll('__TITLE__', visual.title || '多股投研数据综合对比看板')
  .replace('__VISUAL_REPORT_JSON__', () => safeJson(visual))
  .replace('__REFERENCES_JSON__', '[]');

if (/__(?:TITLE|VISUAL_REPORT_JSON|REFERENCES_JSON|CH[一二三四五六七]\d+)__/.test(html)) {
  throw new Error('模板仍有未替换占位符');
}

const outputPath = resolve(workspace, '40-comparison-report.html');
await writeFile(outputPath, html, 'utf8');
await copyLibFiles(dirname(outputPath));
process.stdout.write(`HTML 报告完成：${outputPath}\n`);
