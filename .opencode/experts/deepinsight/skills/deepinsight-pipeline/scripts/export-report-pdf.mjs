#!/usr/bin/env node

import { access, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assertPostprocessedReferences, assertRenderedHtml, sha256File } from './publication-guards.mjs';

const input = resolve(process.argv[2] || '');
const output = resolve(process.argv[3] || resolve(dirname(input), '35-report.pdf'));
const exportStatePath = resolve(dirname(output), '36-pdf-export-state.json');
if (!process.argv[2]) throw new Error('用法：node export-report-pdf.mjs <30-report.html> [35-report.pdf]');
if (!(await stat(input)).isFile()) throw new Error(`HTML 不存在：${input}`);

// ---- 文件级发布门禁：引用后处理 + 渲染哈希链 ----
const workspace = dirname(input);
await assertPostprocessedReferences(workspace);
await assertRenderedHtml(input);
const renderState = JSON.parse(await readFile(resolve(workspace, '31-render-state.json'), 'utf8').catch(() => {
  throw new Error('PDF 发布门禁失败：缺少 render-report.mjs 生成的 31-render-state.json');
}));
const expectedRenderHashes = {
  report_sha256: await sha256File(resolve(workspace, '20-report.md')),
  references_sha256: await sha256File(resolve(workspace, '22-references.json')),
  visual_sha256: await sha256File(resolve(workspace, '25-visual-report.json')),
  html_sha256: await sha256File(input),
};
if (renderState.generator !== 'render-report.mjs' || Object.entries(expectedRenderHashes).some(([key, value]) => renderState[key] !== value)) {
  throw new Error('PDF 发布门禁失败：HTML 或其上游产物在正式渲染后被改写，请重新执行 render-report.mjs');
}

// ---- DAG 导出次数限制与台账 ----
const dag = JSON.parse(await readFile(resolve(dirname(fileURLToPath(import.meta.url)), '../pipeline/deepinsight-dag.json'), 'utf8'));
const maxExports = dag.execution_policy?.pdf?.max_exports || 2;
const exportState = await readFile(exportStatePath, 'utf8').then(JSON.parse, () => ({ schema_version: 1, max_exports: maxExports, attempts: [] }));
if (exportState.attempts.length >= maxExports) throw new Error(`PDF 最多允许导出 ${maxExports} 次；请保留当前产物和问题清单，不要继续截图—重导循环`);
const exportAttempt = { attempt: exportState.attempts.length + 1, started_at: new Date().toISOString(), input };
exportState.attempts.push(exportAttempt);
await writeFile(exportStatePath, `${JSON.stringify(exportState, null, 2)}\n`, 'utf8');

// ---- 委托仓库级共享 report-pdf 导出器：CDP 控制、中文字体注入与校验、渲染等待统一由其负责 ----
const candidates = [
  resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../skills/report-pdf/scripts/export-report-pdf.mjs"),
  resolve(dirname(fileURLToPath(import.meta.url)), "../../report-pdf/scripts/export-report-pdf.mjs"),
];
const checked = await Promise.all(candidates.map((candidate) => access(candidate).then(() => candidate, () => null)));
const shared = checked.find(Boolean);
if (!shared) throw new Error('缺少共享 report-pdf 导出器，请确认仓库级技能已部署');
const module = await import(pathToFileURL(shared).href);

try {
  await module.exportReportPdf({
    input,
    output,
    headerLabel: 'DeepInsight',
    footerLabel: 'Internal Use Only',
    profilePrefix: 'deepinsight-pdf',
  });
  exportAttempt.status = 'completed';
  exportAttempt.completed_at = new Date().toISOString();
  exportAttempt.size_bytes = (await stat(output)).size;
  await writeFile(exportStatePath, `${JSON.stringify(exportState, null, 2)}\n`, 'utf8');
} catch (error) {
  exportAttempt.status = 'failed';
  exportAttempt.completed_at = new Date().toISOString();
  exportAttempt.reason = error.message;
  await writeFile(exportStatePath, `${JSON.stringify(exportState, null, 2)}\n`, 'utf8');
  throw error;
}
