#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const [command, workspaceArg] = process.argv.slice(2);
if (!['plan', 'assemble'].includes(command) || !workspaceArg) {
  throw new Error('用法：node report-batches.mjs <plan|assemble> <workspace_dir>');
}

const workspace = resolve(workspaceArg);
const readJson = async (name) => JSON.parse((await readFile(resolve(workspace, name), 'utf8')).replace(/^\uFEFF/, ''));
const readText = async (name) => (await readFile(resolve(workspace, name), 'utf8')).replace(/^\uFEFF/, '');
const positive = (value, fallback = 0) => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : fallback;
const labelOf = (section) => String(section.section_number || '').trim() || '摘要';
const titleOf = (section) => String(section.section_title || '').trim();
const partName = (index) => `19-report-part-${String(index).padStart(2, '0')}.md`;
const MAX_BATCH_TARGET_WORDS = 5000;
const MIN_COMBINED_BATCH_WORDS = 2800;

const buildPlan = (outline) => {
  const sections = outline.sections || outline.outline?.sections || [];
  if (!Array.isArray(sections) || sections.length === 0) throw new Error('10-outline.json 缺少 sections，无法规划章节写作批次');
  const units = [];
  for (const section of sections) {
    const sectionNumber = String(section.section_number || '').trim();
    const sectionTitle = titleOf(section);
    if (!sectionTitle) throw new Error('大纲存在无标题章节');
    const sectionTarget = positive(section.target_words);
    const subsections = Array.isArray(section.subsections) ? section.subsections : [];
    if (sectionTarget <= MAX_BATCH_TARGET_WORDS || subsections.length === 0) {
      units.push({
        section_filter: [labelOf(section)],
        parent_section: null,
        include_parent_heading: true,
        batch_target_words: sectionTarget,
        expected_headings: [`## ${sectionNumber ? `${sectionNumber} ` : ''}${sectionTitle}`],
      });
      continue;
    }

    let group = [];
    let groupWords = 0;
    const flush = () => {
      if (!group.length) return;
      units.push({
        section_filter: group.map((item) => String(item.subsection_number || '').trim()),
        parent_section: { section_number: sectionNumber, section_title: sectionTitle },
        include_parent_heading: !units.some((item) => item.parent_section?.section_number === sectionNumber),
        batch_target_words: groupWords,
        expected_headings: [
          ...(!units.some((item) => item.parent_section?.section_number === sectionNumber) ? [`## ${sectionNumber} ${sectionTitle}`] : []),
          ...group.map((item) => `### ${String(item.subsection_number || '').trim()} ${String(item.subsection_title || '').trim()}`),
        ],
      });
      group = [];
      groupWords = 0;
    };
    for (const subsection of subsections) {
      const words = positive(subsection.target_words, Math.ceil(sectionTarget / subsections.length));
      if (group.length && groupWords + words > MAX_BATCH_TARGET_WORDS) flush();
      group.push(subsection);
      groupWords += words;
    }
    flush();
  }

  // 保留自然章节边界，但把相邻的短顶层章节合并到同一批。摘要、引言等短章不再
  // 各占一次 Task，也不会把剩余全部长章塞进最后一批；超长章仍只沿既有子章节拆分。
  const drafts = [];
  for (const unit of units) {
    const previous = drafts.at(-1);
    const canMerge = previous
      && previous.parent_section === null
      && unit.parent_section === null
      && previous.batch_target_words < MIN_COMBINED_BATCH_WORDS
      && previous.batch_target_words + unit.batch_target_words <= MAX_BATCH_TARGET_WORDS;
    if (!canMerge) {
      drafts.push({ ...unit });
      continue;
    }
    previous.section_filter.push(...unit.section_filter);
    previous.batch_target_words += unit.batch_target_words;
    previous.expected_headings.push(...unit.expected_headings);
  }

  const targets = drafts.map((item) => item.batch_target_words).filter(Boolean).sort((a, b) => a - b);
  const medianTarget = targets.length ? targets[Math.floor(targets.length / 2)] : 0;
  const maxTarget = targets.at(-1) || 0;

  return {
    schema_version: 1,
    mode: 'outline_driven_chapter_batches',
    source_outline: '10-outline.json',
    target_word_count: positive(outline.target_word_count),
    batch_count: drafts.length,
    balance: {
      policy: 'natural_boundaries_then_near_balanced',
      max_batch_target_words: MAX_BATCH_TARGET_WORDS,
      median_batch_target_words: medianTarget,
      max_to_median_ratio: medianTarget ? Number((maxTarget / medianTarget).toFixed(2)) : 0,
    },
    batches: drafts.map((item, index) => ({ batch_index: index + 1, artifact: partName(index + 1), ...item })),
  };
};

const visibleLength = (markdown) => {
  const withoutMarkup = markdown
    .replace(/<cite>[^<]+<\/cite>/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\[[^\]]+\]\([^)]+\)/g, '')
    .replace(/[|`*_>#-]/g, ' ');
  return (withoutMarkup.match(/[\u4e00-\u9fff]/g) || []).length
    + (withoutMarkup.match(/[A-Za-z0-9]+/g) || []).length;
};

if (command === 'plan') {
  const plan = buildPlan(await readJson('10-outline.json'));
  await writeFile(resolve(workspace, '11-writing-plan.json'), `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
  process.stdout.write(`写作批次计划已生成：${plan.batch_count} 个按大纲确定的章节批次\n`);
  process.exit(0);
}

const plan = await readJson('11-writing-plan.json');
if (!Array.isArray(plan.batches) || plan.batches.length < 1 || !plan.batch_count || plan.batch_count < plan.batches.length) {
  throw new Error('11-writing-plan.json 的批次数与 batches 不一致');
}
const parts = [];
const seenHeadings = new Set();
for (const batch of plan.batches) {
  const markdown = (await readText(batch.artifact)).trim();
  if (!markdown) throw new Error(`写作批次为空：${batch.artifact}`);
  if (/^(?:#{1,6}\s+)?(?:\*\*|__)?\s*参考文献\s*(?:\*\*|__)?\s*$/m.test(markdown)) {
    throw new Error(`${batch.artifact} 擅自生成了参考文献；参考文献只能在全局后处理时生成`);
  }
  const minimumLength = Math.max(120, Math.floor(positive(batch.batch_target_words) * 0.35));
  if (visibleLength(markdown) < minimumLength) {
    throw new Error(`${batch.artifact} 明显短于大纲目标，疑似截断或漏写`);
  }
  for (const heading of batch.expected_headings || []) {
    const occurrences = markdown.split('\n').filter((line) => line.trim() === heading).length;
    if (occurrences !== 1) throw new Error(`${batch.artifact} 缺少或重复计划标题：${heading}`);
    if (seenHeadings.has(heading)) throw new Error(`跨批次重复章节标题：${heading}`);
    seenHeadings.add(heading);
  }
  if (/<cite>[^<]*$/.test(markdown) || /\|[^\n]*$/.test(markdown.split('\n').at(-1) || '') && !(markdown.split('\n').at(-1) || '').trim().endsWith('|')) {
    throw new Error(`${batch.artifact} 末尾存在未闭合引用或表格，疑似输出截断`);
  }
  parts.push(markdown);
}

const report = `${parts.join('\n\n')}\n`;
let cursor = -1;
for (const batch of plan.batches) {
  for (const heading of batch.expected_headings || []) {
    const next = report.indexOf(`${heading}\n`, cursor + 1);
    if (next < 0 || next <= cursor) throw new Error(`合并后的章节顺序与大纲不一致：${heading}`);
    cursor = next;
  }
}
await writeFile(resolve(workspace, '20-report.md'), report, 'utf8');
process.stdout.write(`报告章节合并完成：${plan.batch_count} 个批次 → 20-report.md\n`);
