#!/usr/bin/env node

import { readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspace = resolve(process.argv[2] || '');
if (!process.argv[2]) throw new Error('用法：node render-report.mjs <workspace_dir>');

const scriptDir = resolve(fileURLToPath(new URL('.', import.meta.url)));
const templatesDir = resolve(scriptDir, '..', 'templates');

const readText = async (path) => (await readFile(path, 'utf8')).replace(/^\uFEFF/, '');
const exists = async (path) => stat(path).then(() => true, () => false);

const visualPath = resolve(workspace, '35-visual-report.json');
if (!(await exists(visualPath))) throw new Error('缺少 35-visual-report.json');

const visual = JSON.parse(await readText(visualPath));
const template = await readText(resolve(templatesDir, 'report.html.tpl'));

// 从 30-final-report.md 末尾「## 引用来源」章节解析参考文献（先跑 finalize-report.mjs 生成）
// 行格式：`N. [标题](URL)` 或 `N. <URL>`
const references = [];
const reportPath = resolve(workspace, '30-final-report.md');
if (await exists(reportPath)) {
  const md = await readText(reportPath);
  const heading = md.match(/^[ \t]*##[ \t]*引用来源[ \t]*$/m);
  if (heading) {
    const refSection = md.slice(heading.index);
    const linePattern = /^[ \t]*(\d+)\.[ \t]+(?:\[([^\]]*)\]\(([^)\s]+)\)|<([^>\s]+)>)/gm;
    for (const m of refSection.matchAll(linePattern)) {
      const n = Number(m[1]);
      const title = m[2] || '';
      const url = m[3] || m[4] || '';
      references.push({ n, title, url });
    }
    // 引用闸门：条目必须有真实标题、每个编号必须在正文有 [N] 标记、不得残留 <cite> 中间格式
    const badTitles = references.filter((r) => !r.title.trim() || /^https?:\/\//i.test(r.title.trim()));
    if (badTitles.length) throw new Error(`参考文献缺少真实标题（第 ${badTitles.map((r) => r.n).join('、')} 条）：请补齐 25-sources.json 后重跑 finalize-report.mjs`);
    const bodyPart = heading ? md.slice(0, heading.index) : md;
    const citedNumbers = new Set([...bodyPart.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])));
    const uncited = references.filter((r) => !citedNumbers.has(r.n));
    if (references.length && uncited.length) throw new Error(`参考文献在正文没有对应的 [N] 引用标记（第 ${uncited.map((r) => r.n).join('、')} 条）`);
    if (!references.length && /<cite>/.test(md)) throw new Error('正文仍是 <cite> 中间格式，请先执行 finalize-report.mjs');
  }
}

// viz 闸门：可视化正文必须保留 [N] 引用标记，不允许组件替代正文散文
const vizSections = visual.sections || [];
const markdownBlocks = vizSections.flatMap((s) => s.blocks || []).filter((b) => b.type === 'markdown');
if (references.length) {
  const vizText = JSON.stringify(vizSections);
  const vizCited = new Set([...vizText.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])));
  const vizMissing = references.filter((r) => !vizCited.has(r.n));
  if (!markdownBlocks.length) throw new Error('35-visual-report.json 没有任何 markdown 正文块：dt-viz 不得用组件替代正文，须原样搬运正文段落（含 [N] 引用标记）后重跑');
  if (vizMissing.length) throw new Error(`可视化正文缺少引用标记（第 ${vizMissing.map((r) => r.n).join('、')} 条）：dt-viz 重组正文时丢失了 [N] 标记，须原样搬运正文后重跑`);
}

const safeJson = (value) => JSON.stringify(value).replace(/<\/script>/gi, '<\\/script>');

const html = template
  .replaceAll('__TITLE__', visual.title || '深度研究报告')
  .replace('__VISUAL_REPORT_JSON__', () => safeJson(visual))
  .replace('__REFERENCES_JSON__', () => safeJson(references));

if (/__(?:TITLE|VISUAL_REPORT_JSON|REFERENCES_JSON)__/.test(html)) {
  throw new Error('HTML 模板仍有未替换占位符');
}

const outputPath = resolve(workspace, '40-report.html');
await writeFile(outputPath, html, 'utf8');
process.stdout.write(`HTML 报告完成：${outputPath}\n`);
process.stdout.write(`参考文献：${references.length} 条\n`);
