#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const workspace = resolve(process.argv[2] || '');
if (!process.argv[2]) throw new Error('用法：node validate-run.mjs <workspace>');
const required = [
  '00-control/execution-trace.json', '01-brief/decision-brief.json', '01-brief/run-plan.json',
  '02-data/data-contract.json', '02-data/data-mode.json', '02-data/quality-report.json',
  '04-models/model-run.json', '05-decisions/claim-ledger.json', '05-decisions/story-outline.json', '06-visuals/chart-manifest.json',
  '07-report/report.md', '07-report/preflight-quality.json', '07-report/report.html', '07-report/report.pdf',
  '08-review/independent-review.json', '08-review/release-decision.json'
];
for (const relative of required) {
  const info = await stat(resolve(workspace, relative)).catch(() => null);
  if (!info?.isFile() || info.size === 0) throw new Error(`缺少必需产物：${relative}`);
}
const mode = JSON.parse(await readFile(resolve(workspace, '02-data/data-mode.json'), 'utf8'));
const release = JSON.parse(await readFile(resolve(workspace, '08-review/release-decision.json'), 'utf8'));
const preflight = JSON.parse(await readFile(resolve(workspace, '07-report/preflight-quality.json'), 'utf8'));
const manifest = JSON.parse(await readFile(resolve(workspace, '06-visuals/chart-manifest.json'), 'utf8'));
const report = await readFile(resolve(workspace, '07-report/report.md'), 'utf8');
const html = await readFile(resolve(workspace, '07-report/report.html'), 'utf8');
const pdf = await readFile(resolve(workspace, '07-report/report.pdf'));
if (!['simulated', 'real', 'mixed'].includes(mode.data_mode)) throw new Error('data_mode 不合法');
if (release.decision !== 'pass' || release.p0_count !== 0) throw new Error('独立审查未达到正式发布条件');
const publicationCharts = Number(preflight.summary?.publication_charts);
if (preflight.status !== 'passed' || Number(preflight.summary?.p0) !== 0 || publicationCharts < 4 || publicationCharts > 8) throw new Error('图表与报告确定性预检未通过');
if (mode.data_mode === 'simulated' && (!report.includes('模拟数据') || !html.includes('模拟数据，仅用于产品演示'))) throw new Error('模拟数据标识未覆盖 Markdown 与 HTML');
const charts = Array.isArray(manifest.publication) ? manifest.publication : [];
const htmlFigureCount = (html.match(/<figure><img /g) || []).length;
if (htmlFigureCount !== charts.length) throw new Error(`最终 HTML 图表数量 ${htmlFigureCount} 与 manifest ${charts.length} 不一致`);
for (const chart of charts) {
  const filename = chart.file.split('/').pop();
  if (!filename || !html.includes(filename)) throw new Error(`最终 HTML 没有引用正式图表：${chart.id || chart.file}`);
}
if (pdf.subarray(0, 5).toString('ascii') !== '%PDF-' || !pdf.includes(Buffer.from('/Type /Page'))) throw new Error('最终 PDF 不是可识别的有效页文档');
if (/个人轨迹|设备级轨迹/.test(report)) throw new Error('报告疑似包含禁止的个人轨迹表述');
execFileSync(process.execPath, [resolve(import.meta.dirname, 'pipeline-state.mjs'), 'validate', workspace], { stdio: 'inherit' });
process.stdout.write(`DeepGeo run validated: ${workspace}\n`);
