#!/usr/bin/env node
import { readFile, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, relative, resolve, sep } from 'node:path';

const workspaceArg = process.argv[2];
if (!workspaceArg) throw new Error('用法：node quality-preflight.mjs <workspace>');

const workspace = resolve(workspaceArg);
const outputPath = resolve(workspace, '07-report/preflight-quality.json');
const findings = [];
const checked = [];

function add(severity, code, message, locations = []) {
  findings.push({ severity, code, message, locations });
}

function assertInside(target) {
  const rel = relative(workspace, target);
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || resolve(workspace, rel) !== target) {
    throw new Error(`路径越界：${target}`);
  }
}

async function exists(path) {
  const info = await stat(path).catch(() => null);
  return Boolean(info?.isFile() && info.size > 0);
}

async function json(relativePath) {
  const path = resolve(workspace, relativePath);
  assertInside(path);
  checked.push(relativePath);
  return JSON.parse(await readFile(path, 'utf8'));
}

function csvRows(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines.shift().split(',');
  return lines.map((line) => {
    const cells = line.split(',');
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? '']));
  });
}

function walkStrings(value, path = '$', result = []) {
  if (typeof value === 'string') result.push({ path, value });
  else if (Array.isArray(value)) value.forEach((item, index) => walkStrings(item, `${path}[${index}]`, result));
  else if (value && typeof value === 'object') Object.entries(value).forEach(([key, item]) => walkStrings(item, `${path}.${key}`, result));
  return result;
}

function metricFromRegistry(registry, metricId) {
  const metrics = Array.isArray(registry?.metrics) ? registry.metrics : [];
  return metrics.find((item) => item.metric_id === metricId || item.name === metricId);
}

function rounded(value, precision) {
  const factor = 10 ** precision;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

async function validateAssertion(chart, assertion, index) {
  const prefix = `${chart.id || chart.file}.assertion_checks[${index}]`;
  const required = ['source', 'metric_id', 'direction', 'claimed'];
  const missing = required.filter((key) => assertion?.[key] === undefined);
  if (missing.length) {
    add('P0', 'VIS_ASSERTION_CONTRACT', `${prefix} 缺少字段：${missing.join(', ')}`, [chart.file]);
    return;
  }
  if (!['min', 'max'].includes(assertion.direction) || !Array.isArray(assertion.claimed) || !assertion.claimed.length) {
    add('P0', 'VIS_ASSERTION_CONTRACT', `${prefix} 的 direction/claimed 不合法`, [chart.file]);
    return;
  }
  const registry = await json(assertion.source);
  const metric = metricFromRegistry(registry, assertion.metric_id);
  if (!metric?.values || typeof metric.values !== 'object') {
    add('P0', 'VIS_ASSERTION_SOURCE', `${prefix} 找不到带 values 的指标 ${assertion.metric_id}`, [assertion.source, chart.file]);
    return;
  }
  const precision = Number.isInteger(assertion.precision) ? assertion.precision : 6;
  const entries = Object.entries(metric.values).filter(([, value]) => Number.isFinite(Number(value)));
  const target = assertion.direction === 'min'
    ? Math.min(...entries.map(([, value]) => rounded(value, precision)))
    : Math.max(...entries.map(([, value]) => rounded(value, precision)));
  const actual = entries.filter(([, value]) => rounded(value, precision) === target).map(([key]) => key).sort();
  const claimed = [...new Set(assertion.claimed)].sort();
  if (JSON.stringify(actual) !== JSON.stringify(claimed)) {
    add('P0', 'VIS_ASSERTION_MISMATCH', `${prefix} 声称 ${claimed.join('/')} 为${assertion.direction === 'min' ? '最小' : '最大'}值，但按展示精度 ${precision} 位应为 ${actual.join('/')}`, [assertion.source, chart.file]);
  }
}

const reportPath = resolve(workspace, '07-report/report.md');
const manifestPath = resolve(workspace, '06-visuals/chart-manifest.json');
const report = await readFile(reportPath, 'utf8');
const manifest = await json('06-visuals/chart-manifest.json');
checked.push('07-report/report.md');
const charts = Array.isArray(manifest.publication) ? manifest.publication : [];

// 交付报告不是运行台账。这里把最容易让普通读者失去耐心的结构性问题前置拦截，
// 让独立审查专注于语义和决策风险，而不是再次承担编辑工作。
const reportLines = report.split(/\r?\n/);
const bulletLines = reportLines.filter((line) => /^\s*(?:[-*+] |\d+[.)]\s)/.test(line));
const contentLines = reportLines.filter((line) => line.trim() && !/^\s*(?:#|>|```|\||!\[)/.test(line));
const proseParagraphs = report
  .split(/\n\s*\n/)
  .map((item) => item.replace(/^\s*>\s?/gm, '').trim())
  .filter((item) => item && !/^(?:#|```|\||!\[|[-*+] |\d+[.)]\s)/.test(item) && item.replace(/\s/g, '').length >= 60);
const tableSeparators = reportLines.filter((line) => /^\s*\|?\s*:?-{3,}/.test(line)).length;
const reportForLeakScan = report.replace(/!\[[^\]]*\]\([^)]+\)/g, '');
const internalLeaks = [
  { code: 'READ_INTERNAL_ID', pattern: /\b(?:CL|AN|ISSUE|AS|RISK|V|F)-?\d{1,3}\b|W-(?:DEFAULT|AUD|SYN)/g, label: '内部主张、运行或规则编号' },
  { code: 'READ_INTERNAL_PATH', pattern: /(?:00-control|01-brief|02-data|03-analysis|04-models|05-decisions|06-visuals|07-report|08-review)\/[\w./-]+/g, label: 'Workspace 文件路径' },
  { code: 'READ_ENGINE_JARGON', pattern: /\b(?:data_mode|recipe|artifact|metric_id|source_run)\s*=/gi, label: '引擎字段或配方术语' },
];
for (const rule of internalLeaks) {
  const matches = [...reportForLeakScan.matchAll(rule.pattern)].map((match) => match[0]);
  if (matches.length) add('P0', rule.code, `交付正文暴露${rule.label}：${[...new Set(matches)].slice(0, 8).join('、')}`, ['07-report/report.md']);
}
if (bulletLines.length > 12 || (contentLines.length && bulletLines.length / contentLines.length > 0.2)) {
  add('P0', 'READ_BULLET_OVERLOAD', `报告包含 ${bulletLines.length} 行列表，占正文内容行 ${Math.round(100 * bulletLines.length / Math.max(1, contentLines.length))}%；核心分析应改为连贯段落`, ['07-report/report.md']);
}
if (proseParagraphs.length < 5) add('P0', 'READ_TOO_LITTLE_PROSE', `报告只有 ${proseParagraphs.length} 个完整叙事段落；不能用表格、列表和指标代替解释`, ['07-report/report.md']);
if (tableSeparators > 6) add('P0', 'READ_TABLE_OVERLOAD', `报告包含约 ${tableSeparators} 张表格；请只保留直接帮助比较与行动的少量表格`, ['07-report/report.md']);
else if (tableSeparators > 4) add('P1', 'READ_TABLE_DENSE', `报告包含约 ${tableSeparators} 张表格，建议进一步合并`, ['07-report/report.md']);
if (/^#{1,4}\s+(?:数据与方法|原始指标值|指标体系|分析运行|数据质量与假设台账)/m.test(report)) {
  add('P0', 'READ_LEDGER_AS_CHAPTER', '交付报告仍把方法、原始指标或内部台账作为正文主章节；请改写为读者问题和业务故事', ['07-report/report.md']);
}

if (charts.length < 4) add('P0', 'VIS_TOO_FEW', `正式报告需要 4 至 8 张决策相关图表，当前只有 ${charts.length} 张`, ['06-visuals/chart-manifest.json']);
if (charts.length > 8) add('P0', 'VIS_TOO_MANY', `正式图表 ${charts.length} 张，超过 8 张；请保留真正推动叙事和决策的图表`, ['06-visuals/chart-manifest.json']);

const imageRefs = [...report.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((match) => match[1]);
if (!imageRefs.length) add('P0', 'VIS_NOT_EMBEDDED', 'report.md 没有嵌入任何图表', ['07-report/report.md']);

for (const chart of charts) {
  const required = ['id', 'file', 'title', 'subtitle', 'source_artifact', 'unit', 'period', 'sample', 'data_mode'];
  const missing = required.filter((key) => !chart[key]);
  if (missing.length) add('P0', 'VIS_METADATA', `${chart.id || chart.file || '未知图表'} 缺少元数据：${missing.join(', ')}`, ['06-visuals/chart-manifest.json']);
  if (!chart.file) continue;
  const chartPath = resolve(workspace, chart.file);
  assertInside(chartPath);
  if (!(await exists(chartPath))) {
    add('P0', 'VIS_FILE_MISSING', `正式图表不存在或为空：${chart.file}`, [chart.file]);
    continue;
  }
  checked.push(chart.file);
  const expectedRef = relative(dirname(reportPath), chartPath).split(sep).join('/');
  const normalizedRef = expectedRef.startsWith('.') ? expectedRef : `./${expectedRef}`;
  const referenced = imageRefs.some((item) => resolve(dirname(reportPath), item) === chartPath);
  if (!referenced) add('P0', 'VIS_NOT_EMBEDDED', `图表已生成但未被 report.md 引用：${chart.file}（应使用 ${normalizedRef}）`, ['07-report/report.md', chart.file]);
  const svg = await readFile(chartPath, 'utf8');
  if (!/<svg\b/.test(svg) || !/<(?:rect|path|polyline|circle|line)\b/.test(svg)) add('P0', 'VIS_EMPTY', `图表缺少可见图形元素：${chart.file}`, [chart.file]);
  const dimensions = svg.match(/<svg[^>]*\bwidth="(\d+)"[^>]*\bheight="(\d+)"/);
  if (!dimensions || Number(dimensions[1]) < 480 || Number(dimensions[2]) < 300) add('P1', 'VIS_SIZE', `图表画布过小或无法识别尺寸：${chart.file}`, [chart.file]);
  if (chart.data_mode === 'simulated' && !svg.includes('模拟数据，仅用于产品演示')) add('P0', 'VIS_SIMULATION_LABEL', `模拟图表缺少显著标识：${chart.file}`, [chart.file]);
  const textLines = [...svg.matchAll(/<text\b[^>]*>(.*?)<\/text>/g)].map((match) => match[1].replace(/&amp;/g, '&'));
  if (chart.title && textLines[0] !== chart.title) add('P0', 'VIS_TITLE_DRIFT', `manifest 标题与 SVG 首行标题不一致：${chart.id}`, ['06-visuals/chart-manifest.json', chart.file]);
  if (chart.subtitle && textLines[1] !== chart.subtitle) add('P0', 'VIS_SUBTITLE_DRIFT', `manifest 副标题与 SVG 第二行不一致：${chart.id}`, ['06-visuals/chart-manifest.json', chart.file]);
  const hasSuperlative = /最高|最低|最短|最长|唯一|第一|垫底|居首|领先/.test(chart.title || '');
  const assertions = Array.isArray(chart.assertion_checks) ? chart.assertion_checks : [];
  if (hasSuperlative && !assertions.length) add('P0', 'VIS_ASSERTION_MISSING', `${chart.id} 标题含排序或唯一性断言，但没有 assertion_checks 机器复核依据`, ['06-visuals/chart-manifest.json', chart.file]);
  for (let index = 0; index < assertions.length; index += 1) await validateAssertion(chart, assertions[index], index);
}

for (const imageRef of imageRefs) {
  const target = resolve(dirname(reportPath), imageRef);
  assertInside(target);
  if (!(await exists(target))) add('P0', 'VIS_BROKEN_REFERENCE', `report.md 引用的图表不存在：${imageRef}`, ['07-report/report.md']);
}

const financePath = resolve(workspace, '05-decisions/finance-boundary-summary.csv');
if (await exists(financePath)) {
  checked.push('05-decisions/finance-boundary-summary.csv');
  const rows = csvRows(await readFile(financePath, 'utf8'));
  const base = rows.filter((row) => String(row.scenario || row.scenario_name || '').toLowerCase() === 'base');
  const positiveProfit = base.filter((row) => Number(row.monthly_operating_profit_cny) > 0);
  const accountingPaybacks = base.filter((row) => Number(row.payback_accounting_months) > 0);
  const decisionFiles = ['05-decisions/business-options.json', '05-decisions/option-matrix.json', '05-decisions/claim-ledger.json'];
  for (const relativePath of decisionFiles) {
    const path = resolve(workspace, relativePath);
    if (!(await exists(path))) continue;
    const payload = await json(relativePath);
    for (const item of walkStrings(payload)) {
      if (positiveProfit.length > 1 && /唯一.{0,12}(?:会计|基准).{0,12}盈利|基准.{0,8}唯一.{0,8}盈利/.test(item.value)) {
        add('P0', 'FIN_UNIQUE_PROFIT', `基准情景有 ${positiveProfit.length} 个点月度营业利润为正，不能表述为“唯一会计/基准盈利”`, [`${relativePath}${item.path}`]);
      }
      if (accountingPaybacks.length > 1 && /基准.{0,12}仅.{0,12}会计回收|仅.{0,12}有会计回收/.test(item.value)) {
        add('P0', 'FIN_PAYBACK_LABEL', `基准情景有 ${accountingPaybacks.length} 个点存在有限会计回收期；若表达预测期内回收，必须明确期限与现金流/会计口径`, [`${relativePath}${item.path}`]);
      }
    }
  }
}

const p0 = findings.filter((item) => item.severity === 'P0');
const artifactHashes = {};
for (const relativePath of [...new Set(checked)]) {
  const path = resolve(workspace, relativePath);
  if (await exists(path)) artifactHashes[relativePath] = createHash('sha256').update(await readFile(path)).digest('hex');
}
const result = {
  schema_version: 1,
  run_id: workspace.split(sep).at(-1),
  check: 'deterministic_preflight',
  status: p0.length ? 'failed' : 'passed',
  checked_at: new Date().toISOString(),
  summary: { publication_charts: charts.length, report_image_references: imageRefs.length, p0: p0.length, p1: findings.filter((item) => item.severity === 'P1').length },
  checked_artifacts: [...new Set(checked)],
  artifact_hashes: artifactHashes,
  findings,
  policy: '一次输出全部机器可判定问题；P0 必须在 report_editing 同一 Task 内一次性修复，P1 进入改进清单且不触发返工。',
};
await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
process.stdout.write(`DeepGeo preflight: ${result.status}; charts=${charts.length}; p0=${p0.length}; p1=${result.summary.p1}\n`);
if (p0.length) {
  for (const finding of p0) process.stderr.write(`[${finding.code}] ${finding.message}\n`);
  process.exitCode = 2;
}
