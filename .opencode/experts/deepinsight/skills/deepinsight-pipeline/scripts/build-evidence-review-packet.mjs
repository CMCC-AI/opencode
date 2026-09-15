#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const workspace = resolve(process.argv[2] || '');
const round = Number(process.argv[3] || 1);
if (!process.argv[2] || ![1, 2].includes(round)) {
  throw new Error('用法：node build-evidence-review-packet.mjs <workspace_dir> <1|2>');
}

const readText = async (name) => readFile(resolve(workspace, name), 'utf8');
const readJson = async (name, fallback = null) => readText(name)
  .then((text) => JSON.parse(text.replace(/^\uFEFF/, '')))
  .catch(() => fallback);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const compact = (value, limit = 700) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
const unique = (items) => [...new Set(items.filter(Boolean))];
const numericSuffix = (name) => Number(name.match(/(\d+)(?=\D*$)/)?.[1] || 0);
const localCitationKey = (id) => id ? (String(id).startsWith('local:') ? String(id) : `local:${id}`) : undefined;

const files = await readdir(workspace);
const report = await readText('20-report.md');
const requirements = await readJson('01-requirements.json', {});
const outline = await readJson('10-outline.json', {});
const reflectionNames = files.filter((name) => /^07-reflection-\d+\.json$/.test(name)).sort((a, b) => numericSuffix(a) - numericSuffix(b));
const latestReflection = reflectionNames.length ? await readJson(reflectionNames.at(-1), {}) : {};

const requirementItems = Array.isArray(requirements.must_cover) ? requirements.must_cover : [];
const p0Requirements = requirementItems.filter((item) => item.priority === 'P0').map((item) => ({
  id: item.id || item.requirement_id,
  requirement: compact(item.requirement || item.text || item.description, 360),
}));
const p0Ids = new Set(p0Requirements.map((item) => item.id));
const sectionRecords = Array.isArray(outline.sections) ? outline.sections : [];
const p0SectionHints = unique(sectionRecords
  .filter((section) => (section.requirement_ids || []).some((id) => p0Ids.has(id)))
  .flatMap((section) => [section.section_number, section.section_title]));

const sourceMap = new Map();
const addSource = (source, provenance, citationKey) => {
  const key = citationKey || source?.url || source?.id || source?.source_id;
  if (!key) return;
  const next = {
    key,
    title: compact(source?.title || source?.name || key, 180),
    site: compact(source?.site || source?.publisher || source?.source_type, 100),
    verification_status: source?.verification_status || source?.qualification_status || (provenance === 'local' ? 'local_registered' : ''),
    evidence_scope: source?.evidence_scope || source?.citation_eligibility || '',
    excerpt: compact(source?.excerpt || source?.summary || source?.description, 420),
    provenance,
  };
  const current = sourceMap.get(key);
  if (!current || (next.verification_status === 'verified_original' && current.verification_status !== 'verified_original')) sourceMap.set(key, next);
};

const localRegistry = await readJson('04-sources.json', {});
for (const source of Array.isArray(localRegistry) ? localRegistry : (localRegistry.sources || localRegistry.registered_sources || [])) {
  const id = source.id || source.source_id;
  addSource(source, 'local', localCitationKey(id));
}
const metadataNames = files.filter((name) => /^05-(?:local|web)-findings-\d+\.meta\.json$/.test(name));
for (const name of metadataNames) {
  const metadata = await readJson(name, {});
  const provenance = name.includes('-local-') ? 'local' : 'web';
  for (const source of metadata.verified_sources || []) {
    const id = source.id || source.source_id;
    addSource(source, provenance, provenance === 'local' ? localCitationKey(id) : undefined);
  }
  for (const source of metadata.qualified_reference_sources || []) {
    const id = source.id || source.source_id;
    addSource(source, provenance, provenance === 'local' ? localCitationKey(id) : undefined);
  }
  for (const source of metadata.sources || []) {
    const id = source.id || source.source_id;
    addSource(source, provenance, provenance === 'local' ? localCitationKey(id) : undefined);
  }
}

const blockRows = [];
let heading = '';
let buffer = [];
const flush = () => {
  const text = buffer.join('\n').trim();
  buffer = [];
  if (!text) return;
  const citations = [...text.matchAll(/<cite>([^<]+)<\/cite>/g)].map((match) => match[1].trim());
  const hasNumber = /(?:\d[\d,.]*\s*(?:%|％|亿元|万元|美元|人|家|项|倍|年|月|日|GB|TB|PB|EFLOPS|CAGR|同比|环比))|(?:同比|环比|占比|增长率|预算|成本)/i.test(text);
  const highRisk = /(结论|摘要|核心观点|政策|监管|调查|案例|市场规模|领先|显著|因果|预测|预计|图\s*\d|表\s*\d|\[FIGURE)/i.test(`${heading} ${text}`);
  const p0Relevant = p0SectionHints.some((hint) => hint && (`${heading} ${text}`).includes(String(hint)));
  const isTable = /(^|\n)\s*\|.+\|\s*(\n|$)/.test(text);
  const score = citations.length * 3 + (hasNumber ? 4 : 0) + (highRisk ? 3 : 0) + (p0Relevant ? 6 : 0) + (isTable ? 3 : 0);
  blockRows.push({ heading, text, citations, hasNumber, highRisk, p0Relevant, isTable, score });
};
for (const line of report.split(/\r?\n/)) {
  if (/^#{1,6}\s+/.test(line)) {
    flush();
    heading = line.replace(/^#{1,6}\s+/, '').trim();
    continue;
  }
  if (!line.trim()) flush();
  else buffer.push(line);
}
flush();

const allCitations = unique(blockRows.flatMap((block) => block.citations));
const citationAnomalies = [];
for (const citation of allCitations) {
  if (!sourceMap.has(citation)) {
    citationAnomalies.push({ severity: 'P0', type: 'unregistered_citation', citation });
    continue;
  }
  const source = sourceMap.get(citation);
  if (['search_payload_admitted', 'qualified_reference'].includes(source.verification_status)
    || ['contextual_only', 'bibliography_only'].includes(source.evidence_scope)) {
    const riskyUses = blockRows.filter((block) => block.citations.includes(citation) && (block.hasNumber || block.highRisk));
    if (riskyUses.length) citationAnomalies.push({
      severity: 'P0',
      type: 'contextual_source_used_for_high_risk_claim',
      citation,
      locations: unique(riskyUses.map((block) => block.heading)).slice(0, 4),
    });
  }
}
const malformedCitations = unique([
  ...[...report.matchAll(/<cite>([^<]*)<\/cite>/g)].map((match) => match[1].trim()).filter((value) => !value),
  ...(report.match(/<cite(?!>)/g) || []),
]);
for (const value of malformedCitations) citationAnomalies.push({ severity: 'P0', type: 'malformed_citation', citation: value || '(empty)' });
const openCitationTags = (report.match(/<cite>/g) || []).length;
const closeCitationTags = (report.match(/<\/cite>/g) || []).length;
if (openCitationTags !== closeCitationTags) citationAnomalies.push({
  severity: 'P0',
  type: 'unbalanced_citation_tags',
  open_tags: openCitationTags,
  close_tags: closeCitationTags,
});

const claimsToAvoid = (latestReflection.claims_to_avoid || []).map((item) => ({
  claim: compact(typeof item === 'string' ? item : item.claim, 360),
  reason: compact(typeof item === 'string' ? '' : item.reason, 360),
}));
const suspiciousAvoidedClaims = [];
for (const item of claimsToAvoid) {
  const tokens = unique((item.claim.match(/[\p{Script=Han}A-Za-z0-9.%]+/gu) || []).filter((token) => token.length >= 4)).slice(0, 8);
  const matches = blockRows.filter((block) => tokens.filter((token) => block.text.includes(token)).length >= Math.min(2, tokens.length));
  if (matches.length) suspiciousAvoidedClaims.push({
    claim: item.claim,
    locations: unique(matches.map((block) => block.heading)).slice(0, 4),
    note: '关键词规则命中，仅要求 Reviewer 定向判断，不代表已经违规',
  });
}

const previousReview = round === 2 ? await readJson('21-evidence-review-1.json', {}) : {};
const previousPacket = round === 2 ? await readJson('20-evidence-review-packet-1.json', {}) : {};
const p0Instructions = (previousReview.revision_instructions || []).filter((item) => item.priority === 'P0').map((item, index) => ({
  id: `P0-${index + 1}`,
  section: compact(item.section, 220),
  action: compact(item.action, 600),
  source_ids: item.source_ids || [],
}));
const p0Needles = unique(p0Instructions.flatMap((item) => [
  item.section.match(/\d+(?:\.\d+)*/)?.[0],
  ...item.source_ids,
  ...[...item.action.matchAll(/<cite>([^<]+)<\/cite>/g)].map((match) => match[1]),
]));
const previousCitationSet = new Set(previousPacket.citation_inventory || []);
const newCitations = allCitations.filter((citation) => !previousCitationSet.has(citation));

let candidates = blockRows.filter((block) => block.score > 0);
if (round === 2) {
  candidates = candidates.filter((block) => p0Needles.some((needle) => needle && `${block.heading} ${block.text}`.includes(needle))
    || block.citations.some((citation) => newCitations.includes(citation)));
}
candidates.sort((a, b) => b.score - a.score || a.heading.localeCompare(b.heading));
const segmentLimit = round === 1 ? 28 : 12;
let selectedBlocks = candidates;
if (round === 1) {
  const mandatoryBlocks = sectionRecords
    .filter((section) => (section.requirement_ids || []).some((id) => p0Ids.has(id)))
    .map((section) => blockRows
      .filter((block) => block.score > 0 && (block.heading.includes(section.section_title)
        || block.heading.startsWith(`${section.section_number} `)
        || block.heading.startsWith(`${section.section_number}.`)))
      .sort((a, b) => b.score - a.score)[0])
    .filter(Boolean);
  selectedBlocks = [...mandatoryBlocks, ...candidates.filter((block) => !mandatoryBlocks.includes(block))];
}
if (round === 2 && selectedBlocks.length === 0) {
  selectedBlocks = blockRows.filter((block) => block.score > 0).sort((a, b) => b.score - a.score).slice(0, 4);
}
const selected = selectedBlocks.slice(0, segmentLimit).map((block, index) => {
  const excerpt = compact(block.text, 760);
  const priorMatch = (previousPacket.review_segments || []).find((item) => item.heading === block.heading && item.citations?.some((citation) => block.citations.includes(citation)));
  return {
    claim_id: `C${String(index + 1).padStart(2, '0')}`,
    heading: block.heading,
    excerpt,
    excerpt_sha256: sha256(excerpt),
    risk_flags: [block.p0Relevant && 'p0_requirement', block.hasNumber && 'quantitative', block.highRisk && 'decision_bearing', block.isTable && 'table_or_figure'].filter(Boolean),
    citations: block.citations,
    changed_from_round_1: round === 2 ? !priorMatch || priorMatch.excerpt_sha256 !== sha256(excerpt) : undefined,
  };
});
const selectedCitations = unique(selected.flatMap((item) => item.citations));
const selectedSources = selectedCitations.map((citation) => sourceMap.get(citation)).filter(Boolean);

const packet = {
  schema_version: 1,
  review_round: round,
  mode: round === 1 ? 'risk_selected_review' : 'p0_delta_review',
  report_sha256: sha256(report),
  report_size_bytes: Buffer.byteLength(report),
  policy: {
    reviewer_must_not_reread_full_report: true,
    reviewer_must_not_open_unlisted_research_files: true,
    round_1_scope: 'P0 requirements, decision-bearing claims, quantitative claims, tables/figures and deterministic anomalies',
    round_2_scope: 'previous P0 findings, changed target passages and newly introduced citations only',
  },
  p0_requirements: p0Requirements,
  delivery_constraints: {
    constraints: (requirements.constraints || []).map((item) => compact(item, 260)),
    prohibited: (requirements.prohibited || []).map((item) => compact(item, 260)),
    output_requirements: requirements.output_requirements || {},
  },
  p0_revision_targets: p0Instructions,
  claims_to_avoid: claimsToAvoid,
  deterministic_checks: {
    citation_occurrences: blockRows.reduce((sum, block) => sum + block.citations.length, 0),
    unique_citations: allCitations.length,
    registered_citations: allCitations.filter((citation) => sourceMap.has(citation)).length,
    registered_source_pool_size: sourceMap.size,
    external_source_pool_minimum: requirements.research_mode === 'external' ? 50 : null,
    external_source_pool_minimum_met: requirements.research_mode === 'external' ? sourceMap.size >= 50 : null,
    citation_anomalies: citationAnomalies,
    suspected_claims_to_avoid_matches: suspiciousAvoidedClaims,
    new_citations_since_round_1: round === 2 ? newCitations : [],
  },
  review_segments: selected,
  source_evidence: selectedSources,
  citation_inventory: allCitations,
  scope_summary: {
    report_blocks: blockRows.length,
    candidate_blocks: candidates.length,
    selected_blocks: selected.length,
    segment_limit: segmentLimit,
    selection_is_risk_based_not_random: true,
  },
};

let serialized = `${JSON.stringify(packet, null, 2)}\n`;
while (Buffer.byteLength(serialized) > 56_000 && packet.review_segments.length > (round === 1 ? 12 : 4)) {
  packet.review_segments.pop();
  const retained = new Set(packet.review_segments.flatMap((item) => item.citations));
  packet.source_evidence = packet.source_evidence.filter((source) => retained.has(source.key));
  packet.scope_summary.selected_blocks = packet.review_segments.length;
  serialized = `${JSON.stringify(packet, null, 2)}\n`;
}
if (Buffer.byteLength(serialized) > 64_000) throw new Error('审查包超过 64KB；请检查异常清单或单条需求是否异常膨胀');

const outputName = `20-evidence-review-packet-${round}.json`;
await writeFile(resolve(workspace, outputName), serialized, 'utf8');
process.stdout.write(`${outputName}: ${packet.review_segments.length} selected blocks, ${Buffer.byteLength(serialized)} bytes\n`);
