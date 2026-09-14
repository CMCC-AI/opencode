#!/usr/bin/env node

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const workspace = resolve(process.argv[2] || '');
if (!process.argv[2]) throw new Error('用法：node audit-consolidation.mjs <workspace_dir>');

const readText = async (file) => (await readFile(file, 'utf8')).replace(/^\uFEFF/, '');
const readJson = async (file) => JSON.parse(await readText(file));
const files = await readdir(workspace);
const consolidatedNames = files.filter((name) => /^06-consolidated-\d+\.json$/.test(name)).sort((a, b) =>
  Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]));
if (!consolidatedNames.length) throw new Error('缺少 06-consolidated-N.json');

const consolidatedName = consolidatedNames.at(-1);
const consolidated = await readJson(resolve(workspace, consolidatedName));
const registry = await readJson(resolve(workspace, '04-sources.json'));
const sources = Array.isArray(registry) ? registry : (registry.sources || []);
const knownSources = new Set(sources.map((item) => item.source_id).filter(Boolean));
const errors = [];
const warnings = [];

const arrays = ['common_issues', 'individual_issues', 'typical_issues', 'conflicts', 'needs_review'];
for (const key of arrays) {
  if (consolidated[key] != null && !Array.isArray(consolidated[key])) errors.push(`${key} 必须是数组`);
}

if (consolidated.incomplete !== false) errors.push('归并结果必须显式标记 incomplete=false');
const processNote = `${consolidated.rebuild_note || ''}\n${consolidated.summary || ''}`;
if (/截断|补全|回填|重建|orchestrator|编排代理/i.test(processNote)) {
  errors.push('检测到截断或编排代理手工补全痕迹；必须由同一归并节点完整重跑');
}

const common = consolidated.common_issues || [];
const individual = consolidated.individual_issues || [];
const typical = consolidated.typical_issues || [];
const uniqueIds = new Set();
for (const [kind, items, idKey] of [
  ['共性问题', common, 'group_id'], ['个性问题', individual, 'issue_id'], ['典型问题', typical, 'issue_id'],
]) {
  for (const item of items) {
    const id = item?.[idKey];
    if (!id) errors.push(`${kind}存在缺失 ${idKey} 的记录`);
    else if (uniqueIds.has(id)) errors.push(`内部编号重复：${id}`);
    else uniqueIds.add(id);
  }
}

function visitSources(value, trail = '') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => visitSources(item, `${trail}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (key === 'source_ids' && Array.isArray(child)) {
      for (const sourceId of child) {
        if (!knownSources.has(sourceId)) errors.push(`${trail || 'root'} 含未登记来源：${sourceId}`);
      }
    } else visitSources(child, trail ? `${trail}.${key}` : key);
  }
}
visitSources(consolidated);

for (const item of common) {
  const caseUnits = new Set((item.cases || []).map((entry) => entry?.unit).filter(Boolean));
  const affectedUnits = new Set((item.affected_units || []).filter(Boolean));
  if (Math.max(caseUnits.size, affectedUnits.size) < 2) {
    errors.push(`${item.group_id || item.title || '某共性问题'} 未覆盖至少两个独立单位，不得列为共性问题`);
  }
  if (!(item.cases || []).length) errors.push(`${item.group_id || item.title || '某共性问题'} 缺少逐单位事实 cases`);
}

const stats = consolidated.statistics || {};
const expectedCommon = stats.common_issue_count ?? stats.common_group_count;
if (expectedCommon != null && Number(expectedCommon) !== common.length) {
  errors.push(`共性问题统计 ${expectedCommon} 与数组 ${common.length} 不一致`);
}
if (stats.individual_issue_count != null && Number(stats.individual_issue_count) !== individual.length) {
  errors.push(`个性问题统计 ${stats.individual_issue_count} 与数组 ${individual.length} 不一致`);
}
if (stats.typical_issue_count != null && Number(stats.typical_issue_count) !== typical.length) {
  errors.push(`典型问题统计 ${stats.typical_issue_count} 与数组 ${typical.length} 不一致`);
}
if (stats.issue_count_by_unit && stats.issue_count != null) {
  const sum = Object.values(stats.issue_count_by_unit).reduce((total, value) => total + Number(value || 0), 0);
  if (sum !== Number(stats.issue_count)) errors.push(`各单位问题数合计 ${sum} 与总数 ${stats.issue_count} 不一致`);
}

const summary = String(consolidated.summary || '');
const summaryCommon = summary.match(/共性问题\s*(\d+)\s*项/);
if (summaryCommon && Number(summaryCommon[1]) !== common.length) {
  errors.push(`摘要声称共性问题 ${summaryCommon[1]} 项，实际为 ${common.length} 项`);
}
const summaryIndividual = summary.match(/(?:个性|典型)(?:\/个性|或个性)?问题\s*(\d+)\s*项/);
if (summaryIndividual && Number(summaryIndividual[1]) !== Math.max(individual.length, typical.length)) {
  warnings.push(`摘要中的个性/典型问题数量需人工复核：${summaryIndividual[1]} 项`);
}

const round = Number(consolidated.round || consolidatedName.match(/\d+/)?.[0] || 1);
const audit = {
  pass: errors.length === 0,
  source_file: consolidatedName,
  round,
  checked_at: new Date().toISOString(),
  counts: { common: common.length, individual: individual.length, typical: typical.length },
  errors,
  warnings,
  note: '该门只检查归并产物的完整性、来源闭环和计数一致性，不能替代成稿证据核验。',
};
await writeFile(resolve(workspace, `06-consolidation-audit-${round}.json`), `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
if (!audit.pass) throw new Error(`归并完整性检查未通过：${errors.join('；')}`);
process.stdout.write(`归并完整性检查通过：${common.length} 项共性问题，${individual.length} 项个性问题。\n`);
