#!/usr/bin/env node

import { access, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const input = resolve(process.argv[2] || '');
const output = resolve(process.argv[3] || resolve(dirname(input), 'report.pdf'));
if (!process.argv[2]) throw new Error('用法：node export-report-pdf.mjs <report.html> [report.pdf]');
if (!(await stat(input)).isFile()) throw new Error(`HTML 不存在：${input}`);

// 委托仓库级 report-pdf 导出器：CDP 渲染、中文字体注入与校验、渲染等待统一由共享脚本负责。
const candidates = [
  resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../skills/report-pdf/scripts/export-report-pdf.mjs'),
  resolve(dirname(fileURLToPath(import.meta.url)), '../../report-pdf/scripts/export-report-pdf.mjs'),
];
const checked = await Promise.all(candidates.map((candidate) => access(candidate).then(() => candidate, () => null)));
const shared = checked.find(Boolean);
if (!shared) throw new Error('缺少共享 report-pdf 导出器，请确认仓库级技能已部署');
const mod = await import(pathToFileURL(shared).href);

await mod.exportReportPdf({
  input,
  output,
  headerLabel: 'DeepGeo',
  footerLabel: 'Internal Use Only',
  profilePrefix: 'deepgeo-pdf',
});

const info = await stat(output);
await writeFile(resolve(dirname(output), 'pdf-export-state.json'), `${JSON.stringify({ generator: 'export-report-pdf.mjs', shared, input, output, bytes: info.size, exported_at: new Date().toISOString() }, null, 2)}\n`, 'utf8');
process.stdout.write(`DeepGeo PDF: ${output} (${info.size} bytes)\n`);
