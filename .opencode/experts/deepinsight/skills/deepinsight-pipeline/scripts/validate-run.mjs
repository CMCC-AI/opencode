#!/usr/bin/env node

import { readFile, stat, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertPostprocessedReferences, assertRenderedHtml } from './publication-guards.mjs';

const workspace = resolve(process.argv[2] || '');
if (!process.argv[2]) throw new Error('用法：node validate-run.mjs <workspace_dir>');
const readText = async (path) => (await readFile(path, 'utf8')).replace(/^\uFEFF/, '');
const readJson = async (path) => JSON.parse(await readText(path));
const fileStat = async (name) => stat(resolve(workspace, name));

const required = ['00-input.json', '00-execution-trace.json', '01-requirements.json', '20-report.md', '22-references.json', '23-reference-state.json', '25-visual-report.json', '30-report.html', '31-render-state.json', '35-report.pdf', '36-pdf-export-state.json'];
const sizes = {};
for (const name of required) {
  const info = await fileStat(name).catch(() => null);
  if (!info?.isFile() || info.size === 0) throw new Error(`缺少或为空：${name}`);
  sizes[name] = info.size;
}

const reviewNames = (await import('node:fs/promises')).readdir(workspace).then((items) => items.filter((name) => /^21-evidence-review-\d+\.json$/.test(name)).sort());
const reviews = await reviewNames;
if (!reviews.length) throw new Error('缺少独立证据核验结果');
const review = await readJson(resolve(workspace, reviews.at(-1)));
if (typeof review.pass !== 'boolean') throw new Error('最终证据核验缺少布尔值 pass');
const requirements = await readJson(resolve(workspace, '01-requirements.json'));
const p0Ids = new Set((requirements.must_cover || []).filter((item) => item.priority === 'P0').map((item) => item.id));
const coverageById = new Map((review.requirement_coverage || []).map((item) => [item.requirement_id, item]));
const missingP0 = [...p0Ids].filter((id) => coverageById.get(id)?.status !== 'met');

const pipelineScript = resolve(fileURLToPath(new URL('.', import.meta.url)), 'pipeline-state.mjs');
const pipelineValidation = spawnSync(process.execPath, [pipelineScript, 'validate', workspace], { encoding: 'utf8' });
if (pipelineValidation.status !== 0) {
  throw new Error(`多智能体 DAG 验收失败：${(pipelineValidation.stderr || pipelineValidation.stdout).trim()}`);
}

const markdown = await readText(resolve(workspace, '20-report.md'));
if (/<cite>|<\/cite>/.test(markdown)) throw new Error('Markdown 仍含未处理引用标签');
if (!/^## 参考文献\s*$/m.test(markdown)) throw new Error('Markdown 缺少参考文献章节');
const html = await readText(resolve(workspace, '30-report.html'));
await assertPostprocessedReferences(workspace);
await assertRenderedHtml(resolve(workspace, '30-report.html'));
if (/__(?:ABSTRACT|CH\d+_\d+|TITLE|VISUAL_REPORT_JSON|REFERENCES_JSON|PRINT_CSS)__/.test(html)) throw new Error('HTML 仍含裸占位符');
if (!/<\/html>\s*$/.test(html)) throw new Error('HTML 结构不完整');
if (/href=["']undefined["']/i.test(html)) throw new Error('HTML 参考文献含 undefined 链接');

const pdf = await readFile(resolve(workspace, '35-report.pdf'));
if (pdf.subarray(0, 4).toString() !== '%PDF' || pdf.length < 1024) throw new Error('PDF 文件无效');
const htmlInfo = await fileStat('30-report.html');
const pdfInfo = await fileStat('35-report.pdf');
if (htmlInfo.mtimeMs > pdfInfo.mtimeMs) throw new Error('PDF 早于最新 HTML，需要重新导出');
const pdfExportState = await readJson(resolve(workspace, '36-pdf-export-state.json'));
if (!Array.isArray(pdfExportState.attempts) || pdfExportState.attempts.length < 1 || pdfExportState.attempts.length > 2) throw new Error('PDF 导出轮次不符合 1-2 次的有界验收规则');
if (pdfExportState.attempts.at(-1)?.status !== 'completed') throw new Error('最新 PDF 导出没有成功完成');

const chineseChars = (markdown.match(/[\u4e00-\u9fff]/g) || []).length;
const refs = await readJson(resolve(workspace, '22-references.json'));
if (refs.some((item) => !item.target || !item.n)) throw new Error('参考文献记录缺少 n 或 target');
const invalidWebReferences = refs.filter((item) => item.kind === 'web' && (
  !String(item.title || '').trim()
  || /^https?:\/\//i.test(String(item.title || '').trim())
  || !String(item.site || '').trim()
));
if (invalidWebReferences.length) throw new Error(`网络参考文献缺少可展示标题或发布站点：${invalidWebReferences.map((item) => item.n).join(', ')}`);
const invalidAdmittedEvidence = refs.filter((item) => item.kind === 'web' && item.reference_role === 'evidence' && (
  !['verified_original', 'search_payload_admitted'].includes(item.verification_status)
  || (item.verification_status === 'verified_original' && item.evidence_scope !== 'full_claim_support')
  || (item.verification_status === 'search_payload_admitted' && (item.evidence_scope !== 'contextual_only' || String(item.admission_reason || '').trim().length < 8))
));
if (invalidAdmittedEvidence.length) throw new Error(`正文网络来源缺少合法证据层级：${invalidAdmittedEvidence.map((item) => item.n).join(', ')}`);
const intent = await readJson(resolve(workspace, '02-intent.json'));
const externalPrimary = intent.research_mode === 'external' || requirements.source_policy?.external_research_role === 'primary';
const webReferenceCount = refs.filter((item) => item.kind === 'web').length;
if (externalPrimary && webReferenceCount < 30) throw new Error(`外部研究主导的报告高质量网络参考来源少于 30 条：${webReferenceCount}`);
const invalidExtendedReferences = refs.filter((item) => item.usage === 'extended_reference' && (
  item.reference_role !== 'extended'
  || item.qualification_status !== 'qualified_reference'
  || item.citation_eligibility !== 'bibliography_only'
));
if (invalidExtendedReferences.length) throw new Error(`延伸参考缺少用途或质量标记：${invalidExtendedReferences.map((item) => item.n).join(', ')}`);
const visualReport = await readJson(resolve(workspace, '25-visual-report.json'));
const embeddedReferenceBlocks = (visualReport.sections || []).flatMap((section) => section.blocks || [])
  .filter((block) => block.type === 'markdown' && /^(?:#{1,6}\s+)?(?:\*\*|__)?\s*参考文献\s*(?:\*\*|__)?\s*$/m.test(String(block.content || '')));
if (embeddedReferenceBlocks.length) throw new Error('可视化正文仍内嵌第二套参考文献');
const stats = {
  workspace,
  validated_at: new Date().toISOString(),
  evidence_review: reviews.at(-1),
  evidence_passed: review.pass,
  evidence_summary: String(review.summary || ''),
  unresolved_p0_requirements: missingP0,
  delivery_status: review.pass === true ? 'delivered_evidence_passed' : 'delivered_with_evidence_gaps',
  report_chinese_chars: chineseChars,
  reference_count: refs.length,
  local_reference_count: refs.filter((item) => item.kind === 'local').length,
  web_reference_count: refs.filter((item) => item.kind === 'web').length,
  extended_reference_count: refs.filter((item) => item.usage === 'extended_reference').length,
  artifact_sizes: sizes,
  structural_validation_passed: true,
  multi_agent_dag_validated: true,
  visual_validation_required: true,
  pdf_export_attempts: pdfExportState.attempts.length,
};
await writeFile(resolve(workspace, '40-stats.json'), `${JSON.stringify(stats, null, 2)}\n`, 'utf8');
process.stdout.write(`完整交付验收通过：${chineseChars} 个汉字，${refs.length} 条参考文献；证据状态=${stats.evidence_passed ? 'passed' : 'gaps'}。仍需逐页视觉验收。\n`);
