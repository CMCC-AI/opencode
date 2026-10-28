#!/usr/bin/env node

import { access, readFile, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assertPostprocessedReferences, assertVisualPlaceholders, sha256File } from './publication-guards.mjs';

const workspace = resolve(process.argv[2] || '');
if (!process.argv[2]) throw new Error('用法：node render-report.mjs <workspace_dir>');
const opencodeRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const readText = async (path) => (await readFile(path, 'utf8')).replace(/^\uFEFF/, '');
const readJson = async (path) => JSON.parse(await readText(path));
const exists = async (path) => stat(path).then(() => true, () => false);
const referenceHeadingPattern = /^(?:#{1,6}\s+)?(?:\*\*|__)?\s*参考文献\s*(?:\*\*|__)?\s*$/m;
const stripReferenceAppendix = (value) => {
  const match = referenceHeadingPattern.exec(String(value || ''));
  return match ? String(value || '').slice(0, match.index).replace(/\s+$/, '') : String(value || '');
};

const reportPath = resolve(workspace, '20-report.md');
const visualPath = resolve(workspace, '25-visual-report.json');
if (!(await exists(reportPath)) || !(await exists(visualPath))) throw new Error('缺少 20-report.md 或 25-visual-report.json');

const publication = await assertPostprocessedReferences(workspace);
await assertVisualPlaceholders(workspace);
const markdown = publication.report;
const visual = await readJson(visualPath);
const input = await readJson(resolve(workspace, '00-input.json'));
const refs = await readJson(resolve(workspace, '22-references.json'));

const sectionsWithAnchors = new WeakSet();
// 新版可视化可以用 after 明确声明“放在某个正文子节之后”。先按锚点归位，
// 再填充正文占位符，避免模型输出顺序波动破坏阅读节奏。
for (const section of visual.sections || []) {
  const blocks = section.blocks || [];
  const markdownKeys = new Set(blocks
    .filter((block) => block.type === 'markdown')
    .map((block) => String(block.content || '').trim())
    .filter((key) => /^__(?:ABSTRACT|CH\d+_\d+)__$/.test(key)));
  const anchored = new Map();
  const base = [];
  for (const block of blocks) {
    const target = String(block.after || '').trim();
    if (block.type !== 'markdown' && markdownKeys.has(target)) {
      if (!anchored.has(target)) anchored.set(target, []);
      delete block.after;
      anchored.get(target).push(block);
      sectionsWithAnchors.add(section);
    } else {
      delete block.after;
      base.push(block);
    }
  }
  section.blocks = base.flatMap((block) => {
    const key = block.type === 'markdown' ? String(block.content || '').trim() : '';
    return key && anchored.has(key) ? [block, ...anchored.get(key)] : [block];
  });
}

// 正文回填 + 图表闸门：委托仓库级 report-render 引擎（与独立技能同一实现）。
// 引擎能力：章号自动识别（数字含前导零/中文序号/无编号 H2）、自适应粒度宽松回填（块数不齐时
// 并入最后一个占位符，正文永不丢失，失配只警告不失败）、图表扁平 data 校验并组装 ECharts option。
// 结构与证据校验仍在 pipeline-state.mjs 注册时 fail-fast；这里做渲染前兜底。
const scriptDir = resolve(fileURLToPath(new URL('.', import.meta.url)));
const renderEngineCandidates = [
  resolve(scriptDir, '../../../../../skills/report-render/scripts/render-report.mjs'),
  resolve(scriptDir, '../../report-render/scripts/render-report.mjs'),
];
const renderEnginePath = (await Promise.all(renderEngineCandidates.map((candidate) => access(candidate).then(() => candidate, () => null)))).find(Boolean);
if (!renderEnginePath) throw new Error('缺少共享 report-render 引擎，请确认仓库级技能已部署');
const { backfillAndGate, copyLibFiles } = await import(pathToFileURL(renderEnginePath).href);
const renderSummary = await backfillAndGate(visual, markdown);
const replacements = renderSummary.backfill.replacements;
if (renderSummary.backfill.warnings.length) {
  process.stdout.write(`警告：${renderSummary.backfill.warnings.join('；')}\n`);
}
if (replacements) {
  process.stdout.write(`正文回填：${replacements} 个占位符，并入 ${renderSummary.backfill.mergedPieces} 块，剥离 ${renderSummary.backfill.strippedTables} 个表格段\n`);
}
process.stdout.write(`图表校验：${renderSummary.charts.kept}/${renderSummary.charts.total} 张通过`);
if (renderSummary.charts.dropped.length) {
  process.stdout.write(`，已丢弃 ${renderSummary.charts.dropped.length} 张：\n`);
  for (const dropped of renderSummary.charts.dropped) process.stdout.write(`  - 「${dropped.title}」：${dropped.errors.join('；')}\n`);
} else {
  process.stdout.write('\n');
}
if (renderSummary.charts.total && !renderSummary.charts.kept) {
  process.stdout.write('警告：全部图表被丢弃，应退回 di-viz 按契约重做图表数据\n');
}

// 旧模型有时不输出占位符，而是复制整段正文，并把 Writer 自行生成的参考文献也
// 塞进最后一个 markdown block。渲染层再次确定性裁切，保证正式参考文献只来自
// 22-references.json。空 block 同步移除，避免产生多余空白页。
let removedEmbeddedReferenceAppendices = 0;
for (const section of visual.sections || []) {
  section.blocks = (section.blocks || []).filter((block) => {
    if (block.type !== 'markdown') return true;
    const original = String(block.content || '');
    const cleaned = stripReferenceAppendix(original).trim();
    if (cleaned !== original.trim()) removedEmbeddedReferenceAppendices += 1;
    block.content = cleaned;
    return cleaned.length > 0;
  });
}

// di-viz 可能把 Markdown 原表复制成 table block。若正文仍含同表，PDF 会连续出现两份。
// 通过首列实体匹配识别重复，只移除视觉复制品，正文中的完整表格和数据保持不变。
let deduplicatedTables = 0;
for (const section of visual.sections || []) {
  const prose = (section.blocks || [])
    .filter((block) => block.type === 'markdown')
    .map((block) => String(block.content || ''));
  section.blocks = (section.blocks || []).filter((block) => {
    if (block.type !== 'table' || !Array.isArray(block.rows) || block.rows.length < 2) return true;
    const rowKeys = block.rows
      .map((row) => String(row?.[0] || '').trim())
      .filter((value) => value.length >= 2)
      .slice(0, 8);
    if (rowKeys.length < 2) return true;
    const duplicate = prose.some((content) => {
      if (!/^\s*\|.+\|\s*$/m.test(content)) return false;
      const hits = rowKeys.filter((key) => content.includes(key)).length;
      return hits >= Math.max(2, Math.ceil(rowKeys.length * 0.6));
    });
    if (duplicate) deduplicatedTables += 1;
    return !duplicate;
  });
}

// 旧版报告没有 after 锚点，且常把所有组件堆在章节开头。只在首次升级旧产物时，
// 根据组件标题与各子节正文的关键词重合度，把组件就近放到最相关正文之后。
let reorderedSections = 0;
if (Number(visual.layout_version || 0) < 2) {
  const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'word' });
  const stopWords = new Set(['palantir', 'ontology', 'foundry', 'aip', '企业', '数据', '系统', '平台', '官方', '核心', '分析', '对比', '架构', '能力', '方法', '模型', '应用']);
  const tokens = (value) => [...segmenter.segment(String(value || '').toLowerCase())]
    .filter((part) => part.isWordLike)
    .map((part) => part.segment.trim())
    .filter((word) => word.length >= 2 && !stopWords.has(word));
  const visualTitle = (block) => block.title || block.chart?.title || block.source || '';
  const visualBody = (block) => block.chart?.description || block.content || JSON.stringify(block.items || block.rows || []);

  for (const section of visual.sections || []) {
    if (sectionsWithAnchors.has(section)) {
      const blocks = section.blocks || [];
      const firstMarkdown = blocks.findIndex((block) => block.type === 'markdown' && String(block.content || '').trim());
      if (firstMarkdown > 0) {
        const leadingVisuals = blocks.slice(0, firstMarkdown);
        const fromFirstMarkdown = blocks.slice(firstMarkdown);
        section.blocks = [fromFirstMarkdown[0], ...leadingVisuals, ...fromFirstMarkdown.slice(1)];
        reorderedSections += 1;
      }
      continue;
    }
    const prose = (section.blocks || []).filter((block) => block.type === 'markdown' && String(block.content || '').trim());
    const visuals = (section.blocks || []).filter((block) => block.type !== 'markdown');
    if (!prose.length || !visuals.length) continue;
    const groups = prose.map(() => []);
    const proseIndex = prose.map((block) => {
      const content = String(block.content || '').toLowerCase();
      const heading = (content.match(/^###\s+(.+)$/m)?.[1] || '').toLowerCase();
      return { content, heading };
    });
    for (const block of visuals) {
      const titleTokens = [...new Set(tokens(visualTitle(block)))];
      const bodyTokens = [...new Set(tokens(visualBody(block)))].slice(0, 80);
      let bestIndex = 0;
      let bestScore = -1;
      proseIndex.forEach((candidate, index) => {
        const titleScore = titleTokens.reduce((sum, word) => sum + (candidate.heading.includes(word) ? 8 : candidate.content.includes(word) ? 3 : 0), 0);
        const bodyScore = bodyTokens.reduce((sum, word) => sum + (candidate.heading.includes(word) ? 2 : candidate.content.includes(word) ? 1 : 0), 0);
        const score = titleScore + bodyScore;
        if (score > bestScore) { bestIndex = index; bestScore = score; }
      });
      groups[bestIndex].push(block);
    }
    section.blocks = prose.flatMap((block, index) => [block, ...groups[index]]);
    reorderedSections += 1;
  }
} else {
  // 已有明确锚点时只保证章节不以组件开场，不改动模型声明的具体位置。
  for (const section of visual.sections || []) {
    const blocks = section.blocks || [];
    const firstMarkdown = blocks.findIndex((block) => block.type === 'markdown' && String(block.content || '').trim());
    if (firstMarkdown <= 0) continue;
    const leadingVisuals = blocks.slice(0, firstMarkdown);
    const fromFirstMarkdown = blocks.slice(firstMarkdown);
    section.blocks = [fromFirstMarkdown[0], ...leadingVisuals, ...fromFirstMarkdown.slice(1)];
    reorderedSections += 1;
  }
}
visual.layout_version = 2;

const hasFilledMarkdown = (visual.sections || []).some((section) =>
  (section.blocks || []).some((block) => block.type === 'markdown' && String(block.content || '').trim())
);
if (!replacements && !hasFilledMarkdown) throw new Error('25-visual-report.json 既没有正文占位符，也没有已填充正文');

// 原始 query 只服务于研究流程，不写入正式报告封面。
delete visual.topic;
visual.current_date = input.current_date || visual.current_date || '';
if (!visual.title) visual.title = '深度洞察报告';

const template = await readText(resolve(opencodeRoot, 'templates/report.html.tpl'));
const printCss = await readText(resolve(opencodeRoot, 'templates/report-print.css'));
const safeJson = (value) => JSON.stringify(value).replace(/<\/script>/gi, '<\\/script>');
// 使用替换函数而非替换字符串：JSON 内容里的 $' / $` / $& 序列（如图表 formatter 中的 '$'+p）
// 在字符串替换模式下会被当作特殊模式解释，导致输出损坏。函数替换会原样返回，忽略 $ 语义。
const html = template
  .replaceAll('__TITLE__', visual.title)
  .replace('__VISUAL_REPORT_JSON__', () => safeJson(visual))
  .replace('__REFERENCES_JSON__', () => safeJson(refs))
  .replace('__PRINT_CSS__', () => printCss);

if (/__(?:TITLE|VISUAL_REPORT_JSON|REFERENCES_JSON|PRINT_CSS)__/.test(html)) throw new Error('HTML 模板仍有未替换占位符');
await writeFile(resolve(workspace, '30-report.html'), html, 'utf8');
await copyLibFiles(workspace);
await writeFile(resolve(workspace, '31-render-state.json'), `${JSON.stringify({
  schema_version: 1,
  generator: 'render-report.mjs',
  generated_at: new Date().toISOString(),
  report_sha256: await sha256File(reportPath),
  references_sha256: await sha256File(resolve(workspace, '22-references.json')),
  visual_sha256: await sha256File(visualPath),
  html_sha256: await sha256File(resolve(workspace, '30-report.html')),
}, null, 2)}\n`, 'utf8');
process.stdout.write(`HTML 报告完成：填充 ${replacements} 个正文块，调整 ${reorderedSections} 个章节的正文优先顺序，去除 ${deduplicatedTables} 个重复表格和 ${removedEmbeddedReferenceAppendices} 个内嵌参考文献附录，${refs.length} 条参考文献\n`);
