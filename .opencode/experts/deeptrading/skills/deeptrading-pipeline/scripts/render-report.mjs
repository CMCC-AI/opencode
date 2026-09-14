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

const safeJson = (value) => JSON.stringify(value).replace(/<\/script>/gi, '<\\/script>');

const html = template
  .replaceAll('__TITLE__', visual.title || '深度研究报告')
  .replace('__VISUAL_REPORT_JSON__', () => safeJson(visual))
  .replace('__REFERENCES_JSON__', () => safeJson([]));

if (/__(?:TITLE|VISUAL_REPORT_JSON|REFERENCES_JSON)__/.test(html)) {
  throw new Error('HTML 模板仍有未替换占位符');
}

const outputPath = resolve(workspace, '40-report.html');
await writeFile(outputPath, html, 'utf8');
process.stdout.write(`HTML 报告完成：${outputPath}\n`);
