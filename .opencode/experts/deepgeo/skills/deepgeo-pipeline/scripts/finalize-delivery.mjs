#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, relative, resolve, sep } from 'node:path';

const args = process.argv.slice(2);
const positional = args.filter((item) => !item.startsWith('--'));
if (positional.length < 2) throw new Error('用法：node finalize-delivery.mjs <workspace> <output-dir> [--internal-preview] [--keep-workspace]');
const workspace = resolve(positional[0]);
const runId = basename(workspace);
const delivery = resolve(positional[1]);
const internalPreview = args.includes('--internal-preview');
const keepWorkspace = args.includes('--keep-workspace');

function assertInside(parent, target, label) {
  const rel = relative(parent, target);
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || resolve(parent, rel) !== target) throw new Error(`${label} 路径越界：${target}`);
}
function assertNotInside(parent, target, label) {
  const rel = relative(parent, target);
  if (rel && !rel.startsWith(`..${sep}`) && rel !== '..') throw new Error(`${label}不能位于 Workspace 内（Workspace 可能被清理）：${target}`);
}
assertNotInside(workspace, delivery, '交付目录');

async function json(path) { return JSON.parse(await readFile(path, 'utf8')); }
async function exists(path) { const info = await stat(path).catch(() => null); return Boolean(info?.isFile() && info.size > 0); }
const sha256 = async (path) => createHash('sha256').update(await readFile(path)).digest('hex');

const reportDir = resolve(workspace, '07-report');
const reportMd = resolve(reportDir, 'report.md');
const reportHtml = resolve(reportDir, 'report.html');
const reportPdf = resolve(reportDir, 'report.pdf');
const preflightPath = resolve(reportDir, 'preflight-quality.json');
const manifestPath = resolve(workspace, '06-visuals/chart-manifest.json');
for (const path of [reportMd, reportHtml, reportPdf, preflightPath, manifestPath]) {
  if (!(await exists(path))) throw new Error(`交付前缺少文件：${relative(workspace, path)}`);
}
const preflight = await json(preflightPath);
if (preflight.status !== 'passed' || Number(preflight.summary?.p0) !== 0) throw new Error('质量预检未通过，不能生成清洁交付目录');
const manifest = await json(manifestPath);
const charts = Array.isArray(manifest.publication) ? manifest.publication : [];
if (charts.length < 4 || charts.length > 8) throw new Error(`正式图表需要 4 至 8 张，当前 ${charts.length} 张，不能生成交付目录`);

const releasePath = resolve(workspace, '08-review/release-decision.json');
const release = await exists(releasePath) ? await json(releasePath) : null;
if (!internalPreview && (release?.decision !== 'pass' || Number(release?.p0_count) !== 0)) {
  throw new Error('独立审查尚未通过；如只需内部预览，请显式增加 --internal-preview');
}

await rm(delivery, { recursive: true, force: true });
await mkdir(resolve(delivery, 'assets'), { recursive: true });
await mkdir(resolve(delivery, '.deepgeo'), { recursive: true });

const copiedCharts = [];
for (const chart of charts) {
  const source = resolve(workspace, chart.file);
  assertInside(workspace, source, '图表');
  if (!(await exists(source))) throw new Error(`正式图表不存在：${chart.file}`);
  const target = resolve(delivery, 'assets', basename(source));
  await cp(source, target);
  copiedCharts.push({ id: chart.id, file: `assets/${basename(source)}`, sha256: await sha256(target) });
}

const sourceMarkdown = await readFile(reportMd, 'utf8');
const cleanMarkdown = sourceMarkdown.replace(/!\[([^\]]*)\]\((?:\.\.\/)?06-visuals\/publication\/([^)]+)\)/g, '![$1](assets/$2)');
await writeFile(resolve(delivery, 'report.md'), cleanMarkdown, 'utf8');

const sourceHtml = await readFile(reportHtml, 'utf8');
const cleanHtml = sourceHtml.replace(/src="(?:\.\.\/)?06-visuals\/publication\/([^"]+)"/g, 'src="assets/$1"');
await writeFile(resolve(delivery, 'report.html'), cleanHtml, 'utf8');
await cp(reportPdf, resolve(delivery, 'report.pdf'));

const tracePath = resolve(workspace, '00-control/execution-trace.json');
const trace = await exists(tracePath) ? await json(tracePath) : null;
const audit = {
  schema_version: 1,
  run_id: runId,
  delivery_scope: internalPreview ? 'internal_preview' : 'reviewed_release',
  data_mode: manifest.data_mode || 'unknown',
  generated_at: new Date().toISOString(),
  pipeline_status: trace?.status || 'not_available',
  experts_completed: [...new Set((trace?.events || []).filter((event) => event.event === 'completed').map((event) => event.agent))],
  preflight: { status: preflight.status, summary: preflight.summary },
  review: release ? { decision: release.decision, p0_count: release.p0_count } : { decision: 'not_available' },
  files: {
    'report.md': await sha256(resolve(delivery, 'report.md')),
    'report.html': await sha256(resolve(delivery, 'report.html')),
    'report.pdf': await sha256(resolve(delivery, 'report.pdf')),
    charts: copiedCharts,
  },
  note: '该隐藏文件仅保留最小运行与质量证明；技术台账、临时脚本、探索图和逐配方结果不属于用户交付。',
};
await writeFile(resolve(delivery, '.deepgeo/audit.json'), `${JSON.stringify(audit, null, 2)}\n`, 'utf8');

const visible = (await readdir(delivery)).filter((name) => name !== '.deepgeo');
if (JSON.stringify(visible.sort()) !== JSON.stringify(['assets', 'report.html', 'report.md', 'report.pdf'].sort())) throw new Error('交付目录包含未授权的可见文件');

if (!keepWorkspace && !internalPreview) await rm(workspace, { recursive: true });
process.stdout.write(`DeepGeo clean delivery: ${delivery}; visible=4; charts=${copiedCharts.length}; workspace=${keepWorkspace || internalPreview ? 'kept' : 'pruned'}\n`);
