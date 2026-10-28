#!/usr/bin/env node
// report-render 共享渲染引擎：markdown 报告 → 带图表的 HTML。
//
// CLI：node render-report.mjs <input.md> [visual.json] [output.html]
//   参数按扩展名识别（.json → visual 路径，.html → 输出路径），省略时自动推导：
//   visual 默认 <md 同目录>/<basename>.visual.json（不存在则纯文本降级），输出默认 <basename>.html。
//
// 可复用导出：backfillAndGate(visual, markdownText, options)
//   供团队渲染脚本 import（deepinsight 等编号文件名团队）：after 锚点归位 + 宽松占位符回填
//   （章号自动识别/自适应粒度/并入最后兜底）+ 图表闸门（委托 chart-builder）。原地修改 visual。
//
// 章号自动识别（中文序号/数字含前导零/无编号 H2）；参考文献兼容「参考文献/引用来源」两种标题
// × 「N. / [N]」两种编号 × 链接/《内部材料》/裸 URL 三种条目；失配只警告不失败，正文永不丢失。

import { access, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = resolve(fileURLToPath(new URL('.', import.meta.url)));
const readText = async (path) => (await readFile(path, 'utf8')).replace(/^\uFEFF/, '');
const exists = async (path) => stat(path).then(() => true, () => false);

// ---------- 章节切分（章号自动识别，含前导零归一化） ----------
const CHINESE_DIGITS = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const normalizeChapterNumber = (value) => {
  const parsed = Number(value);
  return /^\d+$/.test(value) && Number.isInteger(parsed) && parsed > 0 ? String(parsed) : value;
};
const headingNumber = (heading) => {
  const ascii = heading.match(/^(\d+)[、.．\s]/)?.[1];
  if (ascii) return normalizeChapterNumber(ascii);
  const chinese = heading.match(/^([一二三四五六七八九十]{1,3})[、.．\s]/)?.[1];
  if (!chinese) return null;
  if (chinese === '十') return '10';
  if (chinese.length === 2 && chinese[0] === '十') return String(10 + (CHINESE_DIGITS[chinese[1]] || 0));
  if (chinese.length === 2 && chinese[1] === '十') return String((CHINESE_DIGITS[chinese[0]] || 0) * 10);
  if (chinese.length === 3 && chinese[1] === '十') return String((CHINESE_DIGITS[chinese[0]] || 0) * 10 + (CHINESE_DIGITS[chinese[2]] || 0));
  return CHINESE_DIGITS[chinese] != null ? String(CHINESE_DIGITS[chinese]) : null;
};
// 摘要章允许带编号前缀：「## 摘要」与「## 00 摘要」都对应 __ABSTRACT__
const stripLeadingChapterNumber = (heading) => heading
  .replace(/^\d+[、.．\s]*\s*/, '')
  .replace(/^[一二三四五六七八九十]{1,3}[、.．\s]*\s*/, '')
  .trim();
const isSeparator = (segment) => /^-{3,}$|^\*{3,}$|^_{3,}$/.test(segment.trim());

function splitChapters(markdown) {
  const referenceHeading = markdown.match(/^[ \t]*##[ \t]*(?:参考文献|引用来源)[ \t]*$/m);
  const reportBody = referenceHeading ? markdown.slice(0, referenceHeading.index) : markdown;
  const h2Matches = [...reportBody.matchAll(/^##[ \t]+(.+)$/gm)];
  const explicitNumbers = new Set(h2Matches.map((match) => headingNumber(match[1].trim())).filter(Boolean));
  const chapters = [];
  for (let index = 0; index < (h2Matches.length || 1); index += 1) {
    const heading = h2Matches[index] ? h2Matches[index][1].trim() : (reportBody.match(/^#\s+(.+)$/m)?.[1] || '正文').trim();
    const start = h2Matches[index] ? h2Matches[index].index + h2Matches[index][0].length : 0;
    const end = h2Matches[index + 1]?.index ?? reportBody.length;
    const chapterBody = reportBody.slice(start, end).trim();
    const explicit = headingNumber(heading);
    const number = explicit || (explicitNumbers.has(String(index + 1)) ? `x${index + 1}` : String(index + 1));
    const h3Matches = [...chapterBody.matchAll(/^###[ \t]+(.+)$/gm)];
    // 所有路径统一剥离表格段（管道行开头的段落）——表格由 table block 承载，残留进正文会被
    // PDF pageChecks 检测为未渲染 Markdown 语法并阻断导出
    const stripTableSegments = (text) => text.split(/\n{2,}/)
      .map((segment) => segment.trim())
      .filter(Boolean)
      .filter((segment) => !isSeparator(segment) && !/^\|/m.test(segment));
    const pieces = [];
    if (!h3Matches.length) {
      pieces.push(...stripTableSegments(chapterBody));
    } else {
      const intro = stripTableSegments(chapterBody.slice(0, h3Matches[0].index).trim()).join('\n\n');
      for (let sub = 0; sub < h3Matches.length; sub += 1) {
        const piece = stripTableSegments(chapterBody.slice(h3Matches[sub].index, h3Matches[sub + 1]?.index ?? chapterBody.length).trim()).join('\n\n');
        if (piece) pieces.push(sub === 0 && intro ? `${intro}\n\n${piece}` : piece);
      }
    }
    const tableSegments = chapterBody.split(/\n{2,}/).map((segment) => segment.trim()).filter((segment) => segment && /^\|/m.test(segment));
    chapters.push({ number, heading, body: chapterBody, pieces, tablesStripped: tableSegments.length });
  }
  return {
    referenceHeading,
    reportBody,
    reportTitle: reportBody.match(/^#\s+(.+)$/m)?.[1]?.trim() || '',
    chapters,
    abstractChapter: chapters.find((chapter) => stripLeadingChapterNumber(chapter.heading) === '摘要'),
  };
}

// ---------- 参考文献解析（双编号格式 × 三种条目形态） ----------
function parseReferences(markdown, referenceHeading) {
  const references = [];
  if (!referenceHeading) return references;
  const refSection = markdown.slice(referenceHeading.index);
  for (const line of refSection.split(/\r?\n/)) {
    const match = line.trim().match(/^(?:\[(\d+)\]|(\d+)[.、．])[ \t]+(.+)$/);
    if (!match) continue;
    const n = Number(match[1] || match[2]);
    const rest = match[3].trim();
    const link = rest.match(/^\[([^\]]*)\]\(([^)\s]+)\)$/);
    const angle = rest.match(/^<([^>\s]+)>$/);
    const book = rest.match(/^《([^》]+)》/);
    if (link) references.push({ n, title: link[1], url: link[2] });
    else if (angle) references.push({ n, title: '', url: angle[1] });
    else if (book) references.push({ n, title: book[1], url: '' });
    else references.push({ n, title: rest.replace(/[（(]\s*内部材料\s*[)）]\s*$/, '').trim(), url: '' });
  }
  return references;
}

// ---------- 图表闸门（委托仓库级 chart-builder） ----------
const chartBuilderCandidates = [
  resolve(scriptDir, '../../chart-builder/scripts/build-charts.mjs'),
  resolve(scriptDir, '../chart-builder/scripts/build-charts.mjs'),
];
const chartBuilderPath = (await Promise.all(chartBuilderCandidates.map((candidate) => access(candidate).then(() => candidate, () => null)))).find(Boolean);
if (!chartBuilderPath) throw new Error('缺少共享 chart-builder 脚本，请确认仓库级技能已部署');
const { injectChartOptions } = await import(pathToFileURL(chartBuilderPath).href);

// ---------- 复制本地 lib 到输出目录（本地优先加载，失败时模板 CDN 兜底） ----------
export async function copyLibFiles(outputDir) {
  const libDir = resolve(scriptDir, '..', 'lib');
  for (const libFile of ['echarts.min.js', 'marked.min.js']) {
    const src = resolve(libDir, libFile);
    if (await exists(src)) {
      await writeFile(resolve(outputDir, libFile), await readFile(src));
    }
  }
}

const chartSummaryText = (summary) => {
  let text = `图表校验：${summary.kept}/${summary.total} 张通过`;
  if (summary.dropped.length) {
    text += `，已丢弃 ${summary.dropped.length} 张：\n` + summary.dropped.map((dropped) => `  - 「${dropped.title}」：${dropped.errors.join('；')}`).join('\n');
  } else {
    text += '\n';
  }
  return text;
};

// ---------- 宽松回填 + after 锚点归位 + 图表闸门（可复用导出） ----------
// 原地修改 visual（接受顶层 sections 或 report.sections 根结构）；返回回填与图表摘要。
export async function backfillAndGate(visual, markdownText, options = {}) {
  // ---------- <cite> 守卫：正文含中间格式引用时明确报错，防止跳过引用后处理 ----------
  const citeMatches = markdownText.match(/<cite>[^<]+<\/cite>/g);
  if (citeMatches) {
    const teamHints = [
      'deeptrading: node <团队skill>/scripts/finalize-report.mjs <workspace>',
      'deepinsight: node <团队skill>/scripts/postprocess-report.mjs <workspace>',
      'deepinspect: node <团队skill>/scripts/postprocess-report.mjs <workspace>',
      'zhengqi-visit-intel: node <团队skill>/scripts/finalize-citations.mjs <workspace>',
    ].join('\n  ');
    throw new Error(`正文仍含 ${citeMatches.length} 处 <cite> 中间格式引用，请先执行团队引用后处理脚本再渲染：\n  ${teamHints}`);
  }

  const root = visual && Array.isArray(visual.sections)
    ? visual
    : visual && visual.report && Array.isArray(visual.report.sections) ? visual.report : null;
  if (!root) throw new Error('visual JSON 中找不到 sections（支持顶层 sections 或 report.sections）');
  const sections = root.sections;
  const { chapters, abstractChapter } = splitChapters(markdownText);
  const placeholderPattern = /^__CH(\d+)_(\d+)__$/;

  // after 锚点归位（可选字段）：非 markdown block 带 after 时移到对应占位符块之后
  for (const section of sections) {
    const blocks = Array.isArray(section.blocks) ? section.blocks : [];
    const markdownKeys = new Set(blocks.filter((block) => block && block.type === 'markdown')
      .map((block) => String(block.content || '').trim())
      .filter((key) => /^__(?:ABSTRACT|CH\d+_\d+)__$/.test(key)));
    if (!markdownKeys.size) continue;
    const anchored = new Map();
    const base = [];
    for (const block of blocks) {
      const target = block && block.type !== 'markdown' ? String(block.after || '').trim() : '';
      if (target && markdownKeys.has(target)) {
        if (!anchored.has(target)) anchored.set(target, []);
        delete block.after;
        anchored.get(target).push(block);
      } else {
        base.push(block);
      }
    }
    section.blocks = base.flatMap((block) => {
      const key = block && block.type === 'markdown' ? String(block.content || '').trim() : '';
      return anchored.has(key) ? [block, ...anchored.get(key)] : [block];
    });
  }

  const allMarkdownBlocks = sections.flatMap((section) => (Array.isArray(section.blocks) ? section.blocks : [])).filter((block) => block && block.type === 'markdown');
  const placeholderBlocks = allMarkdownBlocks.filter((block) => placeholderPattern.test(String(block.content || '').trim()) || String(block.content || '').trim() === '__ABSTRACT__');
  const rawTextBlocks = allMarkdownBlocks.filter((block) => String(block.content || '').trim() && !placeholderPattern.test(String(block.content || '').trim()) && String(block.content || '').trim() !== '__ABSTRACT__');
  if (placeholderBlocks.length && rawTextBlocks.length) {
    throw new Error('markdown block 混用了占位符与正文原文：按 viz 契约只应输出 __CH{N}_{M}__ / __ABSTRACT__ 占位符，正文由渲染脚本回填');
  }

  const backfill = { replacements: 0, mergedPieces: 0, strippedTables: 0, warnings: [] };
  if (placeholderBlocks.length) {
    const abstractBlocks = placeholderBlocks.filter((block) => String(block.content || '').trim() === '__ABSTRACT__');
    const slotsByChapter = new Map();
    for (const block of placeholderBlocks) {
      const text = String(block.content || '').trim();
      if (text === '__ABSTRACT__') continue;
      const match = text.match(placeholderPattern);
      const key = normalizeChapterNumber(match[1]);
      if (!slotsByChapter.has(key)) slotsByChapter.set(key, []);
      slotsByChapter.get(key).push({ block, m: Number(match[2]) });
    }
    for (const block of abstractBlocks) {
      if (abstractChapter) {
        block.content = abstractChapter.body;
        backfill.replacements += 1;
      } else {
        block.content = '';
        backfill.warnings.push('__ABSTRACT__ 未匹配到「摘要」章节，已置空');
      }
    }
    const coveredNumbers = new Set(abstractChapter && abstractBlocks.length ? [abstractChapter.number] : []);
    for (const chapter of chapters) {
      const slots = (slotsByChapter.get(chapter.number) || []).sort((a, b) => a.m - b.m);
      slotsByChapter.delete(chapter.number);
      if (!slots.length) continue;
      coveredNumbers.add(chapter.number);
      // 自适应粒度：占位符多于子节数（如全章连续编号、子节提升为 section）时降为段落粒度顺序填充
      let pieces = chapter.pieces;
      if (slots.length > pieces.length) {
        pieces = chapter.body.split(/\n{2,}/)
          .map((segment) => segment.trim())
          .filter((segment) => segment && !isSeparator(segment) && !/^\|/m.test(segment));
      }
      for (const slot of slots) slot.block.content = '';
      for (const [i, piece] of pieces.entries()) {
        const slot = slots[Math.min(i, slots.length - 1)];
        slot.block.content = slot.block.content ? `${slot.block.content}\n\n${piece}` : piece;
      }
      if (pieces.length > slots.length) backfill.mergedPieces += pieces.length - slots.length;
      backfill.replacements += slots.length;
    }
    for (const chapter of chapters) {
      if (!coveredNumbers.has(chapter.number) && chapter.pieces.length > 0) {
        backfill.warnings.push(`第 ${chapter.number} 章「${chapter.heading}」未被占位符覆盖，该章正文未进入 HTML`);
      }
    }
    for (const [key, slots] of slotsByChapter) {
      for (const slot of slots) slot.block.content = '';
      backfill.warnings.push(`占位符 __CH${key}_M__ 未匹配到任何章节（报告章号：${[...coveredNumbers].join('、')}），已置空`);
    }
    backfill.strippedTables = chapters.reduce((sum, chapter) => sum + chapter.tablesStripped, 0);
  }

  const charts = injectChartOptions(sections, { palette: options.palette });

  // ---------- 兜底：剥离正文块中残留的原始 Markdown 表格语法 ----------
  // 无论占位符/已填充模式，正文中的 `|...|` 表格行都会被 PDF pageChecks 判定为未渲染语法并
  // 阻断导出；表格应由 table block 承载。此处作为最后防线统一剥离并计入摘要。
  let residualTablesStripped = 0;
  for (const section of sections) {
    for (const block of (Array.isArray(section.blocks) ? section.blocks : [])) {
      if (!block || block.type !== 'markdown' || typeof block.content !== 'string') continue;
      const cleaned = block.content.split(/\n{2,}/)
        .map((segment) => segment.trim())
        .filter(Boolean)
        .filter((segment) => !/^\|/m.test(segment))
        .join('\n\n');
      if (cleaned !== block.content.trim()) {
        residualTablesStripped += 1;
        block.content = cleaned;
      }
    }
  }
  if (residualTablesStripped) {
    backfill.warnings.push(`剥离 ${residualTablesStripped} 个正文块中残留的 Markdown 表格段（应由 table block 承载）`);
  }

  return { backfill, charts };
}

// ---------- CLI ----------
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  if (!args[0]) {
    process.stderr.write('用法：node render-report.mjs <input.md> [visual.json] [output.html]\n');
    process.exit(2);
  }
  const input = resolve(args[0]);
  if (!(await exists(input))) throw new Error(`markdown 不存在：${input}`);
  const rest = args.slice(1);
  const visualArg = rest.find((arg) => /\.json$/i.test(arg));
  const outputArg = rest.find((arg) => /\.html?$/i.test(arg));
  const mdName = basename(input).replace(/\.md$/i, '');
  const visualPath = visualArg ? resolve(visualArg) : resolve(dirname(input), `${mdName}.visual.json`);
  const outputPath = outputArg ? resolve(outputArg) : resolve(dirname(input), `${mdName}.html`);

  const markdown = await readText(input);
  const template = await readText(resolve(scriptDir, '..', 'templates', 'report.html.tpl'));
  const printCss = await readText(resolve(scriptDir, '..', 'templates', 'report-print.css'));
  const { referenceHeading, reportTitle } = splitChapters(markdown);
  const references = parseReferences(markdown, referenceHeading);
  const fallbackTitle = reportTitle || `${mdName} 报告`;

  let visual = null;
  if (await exists(visualPath)) {
    visual = JSON.parse(await readText(visualPath));
  }
  const inTextMode = !visual || !(Array.isArray(visual.sections) || (visual.report && Array.isArray(visual.report.sections)));
  if (inTextMode) {
    const { chapters } = splitChapters(markdown);
    visual = {
      title: fallbackTitle,
      subtitle: '',
      hero_stats: [],
      sections: chapters.map((chapter, index) => ({
        id: `ch${index + 1}`,
        level: 2,
        heading: chapter.heading,
        blocks: chapter.body ? [{ type: 'markdown', content: chapter.body }] : [],
      })),
    };
    process.stdout.write(`未找到 ${basename(visualPath)}，走纯文本模式（自动切章，无图表）\n`);
  }
  const root = Array.isArray(visual.sections) ? visual : visual.report;
  if (!root.title) root.title = fallbackTitle;

  const { backfill, charts } = await backfillAndGate(visual, markdown);
  if (backfill.replacements) {
    if (backfill.warnings.length) process.stdout.write(`警告：${backfill.warnings.join('；')}\n`);
    process.stdout.write(`正文回填：${backfill.replacements} 个占位符，并入 ${backfill.mergedPieces} 块，剥离 ${backfill.strippedTables} 个表格段\n`);
  }
  process.stdout.write(chartSummaryText(charts));

  const safeJson = (value) => JSON.stringify(value).replace(/<\/script>/gi, '<\\/script>');
  const safeTitle = String(root.title).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const html = template
    .replaceAll('__TITLE__', safeTitle)
    .replace('__VISUAL_REPORT_JSON__', () => safeJson(visual))
    .replace('__REFERENCES_JSON__', () => safeJson(references))
    .replace('__PRINT_CSS__', () => printCss);
  if (/__(?:TITLE|VISUAL_REPORT_JSON|REFERENCES_JSON|PRINT_CSS)__/.test(html)) throw new Error('模板仍有未替换占位符');
  await writeFile(outputPath, html, 'utf8');
  await copyLibFiles(dirname(outputPath));
  process.stdout.write(`HTML 报告完成：${outputPath}\n`);
  process.stdout.write(`参考文献：${references.length} 条\n`);
}
