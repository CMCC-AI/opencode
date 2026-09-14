#!/usr/bin/env node

import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const workspace = resolve(process.argv[2] || '');
if (!process.argv[2]) throw new Error('用法：node validate-run.mjs <workspace_dir>');
const readText = async (file) => (await readFile(file, 'utf8')).replace(/^\uFEFF/, '');
const readJson = async (file) => JSON.parse(await readText(file));
const fileStat = async (name) => stat(resolve(workspace, name));
const required = ['00-input.json', '04-sources.json', '20-report.md', '22-references.json', '23-presentation-audit.json', '25-visual-report.json', '30-report.html', '35-report.pdf'];
const sizes = {};
for (const name of required) {
  const info = await fileStat(name).catch(() => null);
  if (!info?.isFile() || info.size === 0) throw new Error(`缺少或为空：${name}`);
  sizes[name] = info.size;
}

const files = await readdir(workspace);
const latest = (pattern) => files.filter((name) => pattern.test(name)).sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0])).at(-1);
const reviewName = latest(/^21-evidence-review-\d+\.json$/);
const consolidationAuditName = latest(/^06-consolidation-audit-\d+\.json$/);
if (!reviewName || !consolidationAuditName) throw new Error('缺少证据核验或归并完整性检查结果');
const review = await readJson(resolve(workspace, reviewName));
if (review.pass !== true) throw new Error(`证据核验未通过：${review.summary || '未提供原因'}`);
const consolidationAudit = await readJson(resolve(workspace, consolidationAuditName));
if (consolidationAudit.pass !== true) throw new Error('归并完整性检查未通过');
const presentation = await readJson(resolve(workspace, '23-presentation-audit.json'));
if (presentation.pass !== true) throw new Error('正式成品表达检查未通过');

const markdown = await readText(resolve(workspace, '20-report.md'));
if (/<cite>|<\/cite>|\bSRC-\d+\b|file:\/\/\/|\/(?:Users|home)\//i.test(markdown)) throw new Error('Markdown 仍含中间引用、内部编号或本地路径');
if (!/^## 参考文献\s*$/m.test(markdown)) throw new Error('Markdown 缺少参考文献章节');
const references = await readJson(resolve(workspace, '22-references.json'));
if (!references.length || references.some((item) => item.kind === 'local' && (item.url || /SRC-|\.(?:docx?|pdf|xlsx?|md|txt)$/i.test(item.title)))) {
  throw new Error('本地参考文献没有转换为“巡察报告N”等正式显示名');
}

const input = await readJson(resolve(workspace, '00-input.json'));
const promptValues = [input.topic, input.prompt, input.user_prompt, input.raw_prompt, input.query]
  .filter((value) => typeof value === 'string' && value.trim().length >= 20);
const html = await readText(resolve(workspace, '30-report.html'));
if (/__(?:TITLE|VISUAL_REPORT_JSON|REFERENCES_JSON|PRINT_CSS|ABSTRACT|CH\d+_\d+)__/.test(html)) throw new Error('HTML 仍含裸占位符');
if (!/<\/html>\s*$/.test(html) || !html.includes('@page') || !html.includes('size: A4')) throw new Error('HTML 结构或 A4 打印样式不完整');
if (promptValues.some((value) => html.includes(value.trim()))) throw new Error('HTML 中出现用户原始 query/prompt');
if (/file:\/\/\/|\/(?:Users|home)\/|\bSRC-\d+\b|\*\*[^*]+\*\*/i.test(html)) throw new Error('HTML 可见数据仍含路径、内部编号或裸 Markdown 标记');
if (!/renderer:\s*['"]svg['"]/.test(html)) throw new Error('图表未使用 SVG 矢量渲染');

const pdf = await readFile(resolve(workspace, '35-report.pdf'));
if (pdf.subarray(0, 4).toString() !== '%PDF' || pdf.length < 1024) throw new Error('PDF 文件无效');
const htmlInfo = await fileStat('30-report.html');
const pdfInfo = await fileStat('35-report.pdf');
if (htmlInfo.mtimeMs > pdfInfo.mtimeMs) throw new Error('Stale PDF report：PDF 早于最新 HTML');

const chineseChars = (markdown.match(/[\u4e00-\u9fff]/g) || []).length;
const minimum = Number(input.minimum_word_count || 0);
if (minimum && chineseChars < minimum) throw new Error(`有效汉字 ${chineseChars}，低于最低要求 ${minimum}`);
const stats = {
  workspace, validated_at: new Date().toISOString(), evidence_review: reviewName,
  evidence_passed: true, consolidation_audit: consolidationAuditName, consolidation_passed: true,
  presentation_passed: true, report_chinese_chars: chineseChars,
  reference_count: references.length, local_reference_count: references.filter((item) => item.kind === 'local').length,
  web_reference_count: references.filter((item) => item.kind === 'web').length, artifact_sizes: sizes,
  structural_validation_passed: true, visual_validation_required: true,
};
await writeFile(resolve(workspace, '40-stats.json'), `${JSON.stringify(stats, null, 2)}\n`, 'utf8');
process.stdout.write(`结构验收通过：${chineseChars} 个汉字，${references.length} 条参考文献；仍需逐页视觉验收。\n`);
