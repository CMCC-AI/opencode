#!/usr/bin/env node

import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { basename, isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const workspace = resolve(process.argv[2] || '');
if (!process.argv[2]) throw new Error('用法：node postprocess-report.mjs <workspace_dir>');

const readText = async (path) => (await readFile(path, 'utf8')).replace(/^\uFEFF/, '');
const readJson = async (path) => JSON.parse(await readText(path));
const exists = async (path) => stat(path).then(() => true, () => false);
const referenceHeadingPattern = /^(?:#{1,6}\s+)?(?:\*\*|__)?\s*参考文献\s*(?:\*\*|__)?\s*$/m;
const stripReferenceAppendix = (value) => {
  const match = referenceHeadingPattern.exec(value);
  return match ? value.slice(0, match.index).replace(/\s+$/, '') : value;
};
const cleanInline = (value) => String(value || '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
const siteFromUrl = (url) => {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
};
const supportedEngines = new Set([
  'search_bocha_bocha_search',
  'search_tencent_tencent_search',
  'search_doubao_doubao_search',
  'websearch',
]);
const assertVerifiedSource = (source, fileName) => {
  const url = cleanInline(source?.url);
  const title = cleanInline(source?.title);
  const site = cleanInline(source?.site);
  const excerpt = cleanInline(source?.excerpt);
  const query = cleanInline(source?.query);
  const engine = cleanInline(source?.engine);
  if (!/^https?:\/\//i.test(url)) throw new Error(`${fileName} 的 verified_sources 含无效 URL`);
  if (title.length < 4 || /^https?:\/\//i.test(title) || title === site) throw new Error(`${fileName} 的来源 ${url} 缺少原始页面真实标题`);
  if (!site) throw new Error(`${fileName} 的来源 ${url} 缺少发布机构或站点`);
  if (excerpt.length < 20) throw new Error(`${fileName} 的来源 ${url} 缺少可核验的内容摘录`);
  if (!query) throw new Error(`${fileName} 的来源 ${url} 缺少原始查询`);
  if (!supportedEngines.has(engine)) throw new Error(`${fileName} 的来源 ${url} 使用了未登记搜索引擎：${engine || '(empty)'}`);
  if (!['verified_original', 'search_payload_admitted'].includes(source.verification_status)) throw new Error(`${fileName} 的来源 ${url} 缺少合法证据层级`);
  if (source.verification_status === 'verified_original' && source.evidence_scope !== 'full_claim_support') throw new Error(`${fileName} 的原页核验来源 ${url} 缺少 full_claim_support`);
  if (source.verification_status === 'search_payload_admitted' && (source.evidence_scope !== 'contextual_only' || cleanInline(source.admission_reason).length < 8)) {
    throw new Error(`${fileName} 的搜索结果直用来源 ${url} 缺少 contextual_only 或明确准入理由`);
  }
};
const assertQualifiedReference = (source, fileName) => {
  const url = cleanInline(source?.url);
  const title = cleanInline(source?.title);
  const site = cleanInline(source?.site);
  const excerpt = cleanInline(source?.excerpt);
  const query = cleanInline(source?.query);
  const engine = cleanInline(source?.engine);
  if (!/^https?:\/\//i.test(url)) throw new Error(`${fileName} 的 qualified_reference_sources 含无效 URL`);
  if (title.length < 4 || /^https?:\/\//i.test(title)) throw new Error(`${fileName} 的延伸参考 ${url} 缺少真实标题`);
  if (!site) throw new Error(`${fileName} 的延伸参考 ${url} 缺少发布机构或站点`);
  if (excerpt.length < 20) throw new Error(`${fileName} 的延伸参考 ${url} 缺少足以判断相关性的摘要`);
  if (!query) throw new Error(`${fileName} 的延伸参考 ${url} 缺少原始查询`);
  if (!supportedEngines.has(engine)) throw new Error(`${fileName} 的延伸参考 ${url} 使用了未登记搜索引擎：${engine || '(empty)'}`);
  if (cleanInline(source.selection_reason).length < 8) throw new Error(`${fileName} 的延伸参考 ${url} 缺少入选理由`);
  if (source.qualification_status !== 'qualified_reference' || source.citation_eligibility !== 'bibliography_only') {
    throw new Error(`${fileName} 的延伸参考 ${url} 用途标记不合法`);
  }
};
const mergeReference = (url, source) => {
  const next = {
    key: url,
    kind: 'web',
    title: cleanInline(source.title),
    target: url,
    displayTarget: url,
    site: cleanInline(source.site) || siteFromUrl(url),
    published_at: cleanInline(source.published_at),
    excerpt: cleanInline(source.excerpt),
    query: cleanInline(source.query),
    engine: cleanInline(source.engine),
    verification_status: cleanInline(source.verification_status),
    evidence_scope: cleanInline(source.evidence_scope),
    admission_reason: cleanInline(source.admission_reason),
    selection_reason: cleanInline(source.selection_reason),
    qualification_status: cleanInline(source.qualification_status),
    citation_eligibility: cleanInline(source.citation_eligibility),
    reference_role: source.reference_role === 'extended' ? 'extended' : 'evidence',
  };
  const prior = references.get(url);
  if (!prior) references.set(url, next);
  else {
    const preferred = prior.reference_role === 'evidence' ? prior : next.reference_role === 'evidence' ? next : prior;
    const fallback = preferred === prior ? next : prior;
    references.set(url, Object.fromEntries(Object.keys({ ...prior, ...next }).map((key) => [key, preferred[key] || fallback[key] || ''])));
  }
};

const reportPath = resolve(workspace, '20-report.md');
const sourcesPath = resolve(workspace, '04-sources.json');
if (!(await exists(reportPath))) throw new Error(`缺少报告：${reportPath}`);

const references = new Map();
if (await exists(sourcesPath)) {
  const registry = await readJson(sourcesPath);
  for (const source of registry.sources || []) {
    if (!/^SRC-\d+$/.test(source.source_id || '')) throw new Error(`无效本地来源编号：${source.source_id || '(empty)'}`);
    const key = `local:${source.source_id}`;
    const rawPath = String(source.path || '');
    const absolutePath = isAbsolute(rawPath) ? rawPath : resolve(rawPath);
    references.set(key, {
      key,
      kind: 'local',
      title: String(source.title || basename(rawPath) || source.source_id).replace(/[\r\n]+/g, ' ').trim(),
      target: rawPath ? pathToFileURL(absolutePath).href : '',
      displayTarget: basename(rawPath) || source.source_id,
      site: '用户提供的本地材料',
      published_at: '',
      excerpt: cleanInline(source.notes),
    });
  }
}

const files = await readdir(workspace);
for (const name of files.filter((item) => /^05-web-findings-\d+\.meta\.json$/.test(item)).sort()) {
  const meta = await readJson(resolve(workspace, name));
  if (meta.source_schema_version === 2) {
    if (!Array.isArray(meta.verified_sources)) throw new Error(`${name} 缺少 verified_sources 数组`);
    if (!Array.isArray(meta.qualified_reference_sources)) throw new Error(`${name} 缺少 qualified_reference_sources 数组`);
    for (const source of meta.qualified_reference_sources) {
      assertQualifiedReference(source, name);
      mergeReference(cleanInline(source.url), { ...source, reference_role: 'extended' });
    }
    for (const source of meta.verified_sources || []) {
      assertVerifiedSource(source, name);
      const url = cleanInline(source.url);
      mergeReference(url, { ...source, reference_role: 'evidence' });
    }
    continue;
  }
  const candidates = [
    ...(meta.high_quality_urls || []),
    ...(meta.new_urls_this_round || []),
    ...(meta.quantitative_facts || []).map((item) => ({ url: item.source_url, title: item.source_title })),
  ];
  for (const item of candidates) {
    const url = typeof item === 'string' ? item : item?.url;
    if (!url || !/^https?:\/\//i.test(url)) continue;
    const title = typeof item === 'string' ? '' : String(item.title || '').replace(/[\r\n]+/g, ' ').trim();
    if (!references.has(url) || (!references.get(url).title && title)) {
      mergeReference(url, { title, site: typeof item === 'object' ? item.site : '', published_at: typeof item === 'object' ? item.published_at : '' });
    }
  }
}

// 兼容旧研究产物：早期 meta 可能只保存 URL，而标题仍在 findings Markdown 链接中。
// 这里只补全展示标题，不改变引用 URL，也不接受未登记的新 URL。
for (const name of files.filter((item) => /^05-web-findings-\d+\.md$/.test(item)).sort()) {
  const findings = await readText(resolve(workspace, name));
  for (const match of findings.matchAll(/\[([^\]\n]{2,200})\]\((https?:\/\/[^)\s]+)\)/g)) {
    const [, rawTitle, url] = match;
    if (!references.has(url) || references.get(url).title) continue;
    const title = rawTitle.replace(/[\r\n]+/g, ' ').trim();
    if (!/^https?:\/\//i.test(title)) references.get(url).title = title;
  }
}

let report = await readText(reportPath);
// Writer 偶尔会无视契约自行生成 `**参考文献**`、`### 参考文献` 等附录。
// 统一在引用编号前裁掉，最终只保留本脚本根据真实 cite 映射生成的一套参考文献。
report = stripReferenceAppendix(report);

const citePattern = /<cite>([^<]+)<\/cite>/g;
const citedOrder = [];
const citedIndex = new Map();
for (const match of report.matchAll(citePattern)) {
  const key = match[1].trim();
  if (!references.has(key)) throw new Error(`报告含未登记引用：${key}`);
  if (!citedIndex.has(key)) {
    citedIndex.set(key, citedOrder.length + 1);
    citedOrder.push(key);
  }
}

if (!citedOrder.length) throw new Error('报告没有任何可核验的 <cite> 引用，禁止生成正式版');
report = report.replace(citePattern, (_, key) => `[${citedIndex.get(key.trim())}]`);

const requirements = await exists(resolve(workspace, '01-requirements.json')) ? await readJson(resolve(workspace, '01-requirements.json')) : {};
const intent = await exists(resolve(workspace, '02-intent.json')) ? await readJson(resolve(workspace, '02-intent.json')) : {};
const externalPrimary = intent.research_mode === 'external' || requirements.source_policy?.external_research_role === 'primary';
const webReferenceCount = [...references.values()].filter((item) => item.kind === 'web').length;
if (externalPrimary && webReferenceCount < 30) {
  throw new Error(`外部研究主导的报告至少需要 30 条去重后的高质量网络来源，当前只有 ${webReferenceCount} 条`);
}
const allReferenceKeys = [
  ...citedOrder,
  ...[...references.keys()].filter((key) => !citedIndex.has(key) && references.get(key).kind === 'web'),
];
const referenceRecords = allReferenceKeys.map((key, index) => ({
  n: index + 1,
  ...references.get(key),
  usage: citedIndex.has(key)
    ? 'cited_in_report'
    : references.get(key).reference_role === 'evidence'
      ? 'verified_reference_not_cited'
      : 'extended_reference',
}));
for (const ref of referenceRecords.filter((item) => item.kind === 'web')) {
  if (!ref.title || /^https?:\/\//i.test(ref.title)) throw new Error(`正式网络引用缺少真实页面标题：${ref.target}`);
  if (!ref.site) throw new Error(`正式网络引用缺少发布机构或站点：${ref.target}`);
}
const referenceLines = referenceRecords.map((ref) => {
  const title = ref.title || ref.displayTarget;
  return `${ref.n}. [${title.replace(/[\[\]]/g, '')}](${ref.target})`;
});
report = `${report}\n\n---\n\n## 参考文献\n\n${referenceLines.join('\n\n')}\n`;

await writeFile(reportPath, report, 'utf8');
await writeFile(resolve(workspace, '22-references.json'), `${JSON.stringify(referenceRecords, null, 2)}\n`, 'utf8');
const reportHash = createHash('sha256').update(await readFile(reportPath)).digest('hex');
const referencesHash = createHash('sha256').update(await readFile(resolve(workspace, '22-references.json'))).digest('hex');
await writeFile(resolve(workspace, '23-reference-state.json'), `${JSON.stringify({
  schema_version: 1,
  generator: 'postprocess-report.mjs',
  generated_at: new Date().toISOString(),
  report_sha256: reportHash,
  references_sha256: referencesHash,
  reference_count: referenceRecords.length,
}, null, 2)}\n`, 'utf8');
process.stdout.write(`引用后处理完成：${referenceRecords.length} 条来源（本地 ${referenceRecords.filter((r) => r.kind === 'local').length}，外部 ${referenceRecords.filter((r) => r.kind === 'web').length}，延伸参考 ${referenceRecords.filter((r) => r.usage === 'extended_reference').length}）\n`);
