import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

export const readText = async (path) => (await readFile(path, 'utf8')).replace(/^\uFEFF/, '');
export const readJson = async (path) => JSON.parse(await readText(path));
export const exists = async (path) => stat(path).then(() => true, () => false);
export const sha256File = async (path) => createHash('sha256').update(await readFile(path)).digest('hex');

const taskWrapperPattern = /<\/?(?:task|task_result)\b/i;

export const assertPostprocessedReferences = async (workspace) => {
  const reportPath = resolve(workspace, '20-report.md');
  const referencesPath = resolve(workspace, '22-references.json');
  const statePath = resolve(workspace, '23-reference-state.json');
  if (!(await exists(reportPath)) || !(await exists(referencesPath)) || !(await exists(statePath))) {
    throw new Error('引用发布门禁失败：必须先直接执行 postprocess-report.mjs，不能手工创建引用文件');
  }
  const report = await readText(reportPath);
  const references = await readJson(referencesPath);
  const state = await readJson(statePath);
  if (/<\/?cite>/i.test(report)) throw new Error('引用发布门禁失败：20-report.md 仍含未编号的 <cite>');
  if (taskWrapperPattern.test(report)) throw new Error('引用发布门禁失败：20-report.md 含 Task 包装标记');
  if (!/^## 参考文献\s*$/m.test(report)) throw new Error('引用发布门禁失败：20-report.md 缺少唯一的 ## 参考文献');
  if (!Array.isArray(references)) throw new Error('引用发布门禁失败：22-references.json 必须是确定性脚本生成的数组');
  references.forEach((item, index) => {
    if (item?.n !== index + 1 || !String(item?.target || '').trim()) {
      throw new Error(`引用发布门禁失败：第 ${index + 1} 条记录缺少连续编号或 target`);
    }
    if (item.kind === 'web' && (!String(item.title || '').trim() || /^https?:\/\//i.test(String(item.title || '').trim()))) {
      throw new Error(`引用发布门禁失败：第 ${index + 1} 条网络来源缺少真实标题`);
    }
  });
  const reportHash = await sha256File(reportPath);
  const referencesHash = await sha256File(referencesPath);
  if (state.generator !== 'postprocess-report.mjs' || state.report_sha256 !== reportHash || state.references_sha256 !== referencesHash) {
    throw new Error('引用发布门禁失败：报告或参考文献在确定性后处理后被改写，请重新执行 postprocess-report.mjs');
  }
  return { report, references };
};

export const assertVisualPlaceholders = async (workspace) => {
  const visual = await readJson(resolve(workspace, '25-visual-report.json'));
  if (!Array.isArray(visual.sections) || visual.sections.length === 0) throw new Error('可视化门禁失败：缺少 sections');
  const blocks = visual.sections.flatMap((section) => Array.isArray(section.blocks) ? section.blocks : []);
  const markdown = blocks.filter((block) => block.type === 'markdown');
  if (!markdown.length || markdown.some((block) => !/^__(?:ABSTRACT|CH\d+_\d+)__$/.test(String(block.content || '').trim()))) {
    throw new Error('可视化门禁失败：markdown block 只能是正文占位符，不能复制整篇正文');
  }
  if (/<\/?cite>|<\/?(?:task|task_result)\b/i.test(JSON.stringify(visual))) {
    throw new Error('可视化门禁失败：25-visual-report.json 含引用或 Task 包装残留');
  }
  const report = await readText(resolve(workspace, '20-report.md'));
  const body = report.split(/^## 参考文献\s*$/m)[0];
  const chineseChars = (body.match(/[\u4e00-\u9fff]/g) || []).length;
  const quantitativeSignals = new Set(body.match(/\d+(?:\.\d+)?\s*(?:%|亿|万|PB|TB|GB|家|个|次|项|年|月)/gi) || []);
  const yearSignals = new Set(body.match(/(?:19|20)\d{2}年?/g) || []);
  const richBlocks = blocks.filter((block) => ['chart', 'timeline', 'stat_grid', 'table'].includes(block.type));
  const figureBlocks = blocks.filter((block) => ['chart', 'timeline'].includes(block.type));
  const dataRichLongReport = chineseChars >= 4000 && (quantitativeSignals.size >= 8 || yearSignals.size >= 4);
  if (dataRichLongReport && richBlocks.length < 2) {
    throw new Error('可视化门禁失败：长篇数据型报告不能以纯 Markdown/占位符进入 HTML 渲染');
  }
  if (dataRichLongReport && figureBlocks.length < 4) {
    const reason = String(visual.visual_quality?.figure_shortfall_reason || '').trim();
    if (reason.length < 12) throw new Error('可视化门禁失败：长篇数据型报告少于 4 幅必要图形时必须说明真实证据原因');
  }
  return { visual, blocks };
};

export const assertRenderedHtml = async (htmlPath) => {
  const html = await readText(htmlPath);
  const reportData = html.match(/<script[^>]+id=["']visual-report-data["'][^>]*>([\s\S]*?)<\/script>/i)?.[1] || '';
  if (/<\/?cite>|&lt;\/?cite&gt;/i.test(reportData)) throw new Error('PDF 发布门禁失败：HTML 正文数据仍含原始 cite URL');
  if (taskWrapperPattern.test(reportData) || /&lt;\/?(?:task|task_result)\b/i.test(reportData)) throw new Error('PDF 发布门禁失败：HTML 正文数据含 Task 包装残留');
  if (/href=["']undefined["']/i.test(html)) throw new Error('PDF 发布门禁失败：HTML 含 undefined 引用链接');
  if (!/window\.__REPORT_READY__/.test(html) || !/<\/html>\s*$/.test(html)) throw new Error('PDF 发布门禁失败：HTML 不是完整的正式报告模板');
  return html;
};
