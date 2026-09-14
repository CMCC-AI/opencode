#!/usr/bin/env node

import { readFile, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const workspace = resolve(process.argv[2] || '');
if (!process.argv[2]) throw new Error('用法：node lint-report.mjs <workspace_dir>');
const readText = async (file) => (await readFile(file, 'utf8')).replace(/^\uFEFF/, '');
const exists = async (file) => stat(file).then(() => true, () => false);
const report = await readText(resolve(workspace, '20-report.md'));
const input = await exists(resolve(workspace, '00-input.json'))
  ? JSON.parse(await readText(resolve(workspace, '00-input.json'))) : {};
const body = report.split(/^## 参考文献\s*$/m)[0];
const visibleBody = body.replace(/<cite>[^<]+<\/cite>/g, '');
const findings = [];

const rules = [
  ['内部追踪编号或字段', /\b(?:COMMON|TYP|CONFLICT|IND)-\d+\b|\bR\d+-I\d+\b|\b(?:group_id|issue_id|conflict_id|source_ids|risk_level|confidence|comments|conflict_type)\b/gi],
  ['本地绝对路径', /file:\/\/\/|\/(?:Users|home|private|tmp)\/[^\s)\]<>]+|[A-Za-z]:\\[^\s)\]<>]+/g],
  ['可见来源内部编号', /\bSRC-\d+\b/g],
  ['HTML 隐藏注释', /<!--[\s\S]*?-->/g],
  ['未解析占位符', /__(?:ABSTRACT|CH\d+_\d+|TITLE|PRINT_CSS)__/g],
  ['裸露 Markdown 加粗标记', /\*\*[^*\n]{1,160}[。！？；：]\s*\*\*(?=\s*[\u4e00-\u9fffA-Za-z0-9【])/g],
];
for (const [name, pattern] of rules) {
  const matches = [...visibleBody.matchAll(pattern)].map((match) => match[0].slice(0, 180));
  if (matches.length) findings.push({ rule: name, count: matches.length, samples: [...new Set(matches)].slice(0, 8) });
}

const promptLeakage = [];
for (const key of ['topic', 'prompt', 'user_prompt', 'raw_prompt', 'query']) {
  const value = typeof input[key] === 'string' ? input[key].trim() : '';
  if (value.length >= 20 && body.includes(value)) promptLeakage.push(key);
}

const structureErrors = [];
for (const match of body.matchAll(/^###\s+(2\.\d+)\s+[^\n]+\n([\s\S]*?)(?=^###\s+|^##\s+|(?![\s\S]))/gm)) {
  const section = match[2];
  if (/^\s*\*\*[^*]+\*\*/m.test(section)) {
    structureErrors.push(`${match[1]} 使用加粗段落模拟问题标题，应改用四级标题并明确共性/个性类型`);
  }
  if (/未形成.{0,20}共性问题[\s\S]{0,400}(?:共性表现|共通问题|共同问题)/.test(section)) {
    structureErrors.push(`${match[1]} 同时声称“未形成共性问题”和存在共性表现，归并口径矛盾`);
  }
}

const chapter4 = body.match(/^##\s+(?:四、|4\s+)[^\n]*\n([\s\S]*?)(?=^##\s+|(?![\s\S]))/m)?.[1] || '';
if (chapter4) {
  const subsectionNumbers = [...chapter4.matchAll(/^###\s+(4\.\d+)\s+/gm)].map((match) => match[1]);
  const subsectionParts = chapter4.split(/(?=^###\s+4\.\d+\s+)/gm).filter((part) => /^###\s+4\.\d+/m.test(part));
  const withTables = subsectionParts.filter((part) => /^\s*\|.+\|\s*$/m.test(part));
  const hasCoveringTable = [...chapter4.matchAll(/(?:^\s*\|.+\|\s*$\n?){3,}/gm)]
    .some((match) => subsectionNumbers.every((number) => match[0].includes(number)));
  if (withTables.length > 0 && withTables.length < subsectionParts.length && !hasCoveringTable) {
    structureErrors.push('第四章表格仅覆盖部分同级小节；应改为覆盖全部 4.x 的章末综合表，或统一取消小节孤立表格');
  }
}

const audit = {
  pass: findings.length === 0 && promptLeakage.length === 0 && structureErrors.length === 0,
  findings,
  prompt_leakage_fields: promptLeakage,
  structure_errors: structureErrors,
  checked_at: new Date().toISOString(),
  note: '该检查拦截明显呈现污染和结构失配，不能替代事实证据审查。',
};
await writeFile(resolve(workspace, '23-presentation-audit.json'), `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
if (!audit.pass) throw new Error(`正式成品检查未通过：${[...findings.map((item) => item.rule), ...promptLeakage.map((key) => `提示词字段 ${key}`), ...structureErrors].join('；')}`);
process.stdout.write('正式成品表达与结构检查通过。\n');
