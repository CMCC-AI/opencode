#!/usr/bin/env node

import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const workspace = resolve(process.argv[2] || '');
if (!process.argv[2]) throw new Error('用法：node postprocess-report.mjs <workspace_dir>');
const readText = async (file) => (await readFile(file, 'utf8')).replace(/^\uFEFF/, '');
const readJson = async (file) => JSON.parse(await readText(file));
const exists = async (file) => stat(file).then(() => true, () => false);

const reportPath = resolve(workspace, '20-report.md');
const registryPath = resolve(workspace, '04-sources.json');
if (!(await exists(reportPath)) || !(await exists(registryPath))) throw new Error('缺少 20-report.md 或 04-sources.json');

const registry = await readJson(registryPath);
const localSources = Array.isArray(registry) ? registry : (registry.sources || []);
if (!localSources.length) throw new Error('04-sources.json 没有可编号的本地材料');

const typeCounts = new Map();
function localAlias(source, index) {
  const rawType = String(source.material_type || '').trim();
  let type = /巡察|巡视/.test(rawType) || /巡察|巡视/.test(String(source.title || '')) ? '巡察报告' : rawType;
  if (!type || /^(附件|文件|材料|其他)$/i.test(type)) type = '本地材料';
  type = type.replace(/[《》：:，,。\s]+/g, '').slice(0, 12) || '本地材料';
  const count = (typeCounts.get(type) || 0) + 1;
  typeCounts.set(type, count);
  return `${type} ${count}` || `本地材料 ${index + 1}`;
}

const referenceByKey = new Map();
const references = [];
localSources.forEach((source, index) => {
  const sourceId = String(source.source_id || '');
  if (!/^SRC-\d+$/.test(sourceId)) throw new Error(`无效本地来源编号：${sourceId || '(empty)'}`);
  const record = { n: index + 1, key: `local:${sourceId}`, kind: 'local', title: localAlias(source, index), url: '' };
  references.push(record);
  referenceByKey.set(record.key, record);
});

const webSources = new Map();
for (const name of (await readdir(workspace)).filter((item) => /^05-web-findings-\d+\.meta\.json$/.test(item)).sort()) {
  const meta = await readJson(resolve(workspace, name));
  const candidates = [
    ...(meta.source_records || []), ...(meta.high_quality_urls || []), ...(meta.new_urls_this_round || []),
    ...(meta.quantitative_facts || []).map((item) => ({ url: item.source_url, title: item.source_title })),
  ];
  for (const item of candidates) {
    const url = typeof item === 'string' ? item : item?.url;
    if (!/^https?:\/\//i.test(String(url || ''))) continue;
    const title = typeof item === 'string' ? '' : String(item.title || '').replace(/[\r\n]+/g, ' ').trim();
    if (!webSources.has(url) || (!webSources.get(url).title && title)) webSources.set(url, { title, url });
  }
}

let report = await readText(reportPath);
const priorReferencePath = resolve(workspace, '22-references.json');
const priorReferenceRecords = await exists(priorReferencePath) ? await readJson(priorReferencePath) : [];
const priorReferenceHeading = report.search(/^## 参考文献\s*$/m);
if (priorReferenceHeading >= 0) report = report.slice(0, priorReferenceHeading).replace(/\s+$/, '');

const citePattern = /<cite>([^<]+)<\/cite>/g;
const citedKeys = [...report.matchAll(citePattern)].map((match) => match[1].trim());
if (!citedKeys.length) {
  for (const prior of priorReferenceRecords.filter((item) => item?.kind === 'web' && /^https?:\/\//i.test(String(item.url || ''))).sort((a, b) => Number(a.n) - Number(b.n))) {
    if (referenceByKey.has(prior.url)) continue;
    const record = { n: references.length + 1, key: prior.url, kind: 'web', title: prior.title || prior.url, url: prior.url };
    references.push(record);
    referenceByKey.set(record.key, record);
  }
}
for (const key of citedKeys) {
  if (referenceByKey.has(key)) continue;
  if (!webSources.has(key)) throw new Error(`报告含未登记引用：${key}`);
  const source = webSources.get(key);
  const record = { n: references.length + 1, key, kind: 'web', title: source.title || key, url: key };
  references.push(record);
  referenceByKey.set(key, record);
}

report = report.replace(citePattern, (_, rawKey) => {
  const record = referenceByKey.get(rawKey.trim());
  return `<sup class="citation"><a class="ref" href="#ref-${record.n}" data-ref="${record.n}" title="参考文献 ${record.n}">[${record.n}]</a></sup>`;
});
const existingCitations = [...report.matchAll(/<sup class="citation"><a class="ref" href="#ref-(\d+)"/g)];
if (!existingCitations.length) throw new Error('报告没有任何可核验引用，禁止生成正式版');
const maxExisting = Math.max(...existingCitations.map((match) => Number(match[1])));
if (maxExisting > references.length) throw new Error(`正文引用编号达到 ${maxExisting}，但仅登记 ${references.length} 条来源`);

const lines = references.map((ref) => ref.kind === 'local'
  ? `<a id="ref-${ref.n}"></a>${ref.n}. ${ref.title}（本地材料）`
  : `<a id="ref-${ref.n}"></a>${ref.n}. [${ref.title.replace(/[\[\]]/g, '')}](${ref.url})`);
report = `${report}\n\n## 参考文献\n\n${lines.join('\n\n')}\n`;

const publicRecords = references.map(({ key, ...record }) => record);
await writeFile(reportPath, report, 'utf8');
await writeFile(resolve(workspace, '22-references.json'), `${JSON.stringify(publicRecords, null, 2)}\n`, 'utf8');
process.stdout.write(`引用后处理完成：本地材料 ${localSources.length} 条优先编号，外部来源 ${publicRecords.filter((r) => r.kind === 'web').length} 条。\n`);
