#!/usr/bin/env node

// 引用编号后处理：把 30-final-report.md 里的 <cite>URL</cite> 按首次出现顺序
// 替换为 [N]，并在文末追加「## 引用来源」章节（N. [标题](URL) 形式）。
// 标题优先取 25-sources.json 登记的来源元数据，缺失时用域名+路径兜底并告警。
// 幂等：正文已无 <cite> 且已有引用来源章节时不修改；两者皆无则报错拒绝交付。

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const workspace = resolve(process.argv[2] || '');
if (!process.argv[2]) throw new Error('用法：node finalize-report.mjs <workspace_dir>');

const reportPath = resolve(workspace, '30-final-report.md');
const sourcesPath = resolve(workspace, '25-sources.json');
const readText = async (path) => (await readFile(path, 'utf8')).replace(/^\uFEFF/, '');

let body = await readText(reportPath);

// 第 1 步：收集 <cite>URL</cite>，按首次出现分配编号
const citePattern = /<cite>([^<>\s]+)<\/cite>/g;
const urlOrder = [];
const urlIndex = new Map();
for (const m of body.matchAll(citePattern)) {
  const url = m[1];
  if (!urlIndex.has(url)) {
    urlIndex.set(url, urlOrder.length + 1);
    urlOrder.push(url);
  }
}

const refHeading = /^[ \t]*##[ \t]*引用来源[ \t]*$/m;

if (!urlOrder.length) {
  if (refHeading.test(body)) {
    process.stdout.write('正文引用已编号且存在引用来源章节，无需后处理\n');
    process.exit(0);
  }
  throw new Error('正文没有任何 <cite>URL</cite> 引用，也没有「## 引用来源」章节：终稿必须保留分析阶段的引用标签，不允许无引用交付');
}

// 第 2 步：来源元数据（研究阶段登记的 {url,title,site}），缺失不阻塞、走兜底标题
const sourceMeta = new Map();
try {
  const registered = JSON.parse(await readText(sourcesPath));
  if (Array.isArray(registered)) {
    for (const item of registered) {
      if (item?.url && String(item.title || '').trim()) sourceMeta.set(String(item.url).trim(), item);
    }
  }
} catch {
  process.stdout.write('未找到可解析的 25-sources.json，全部引用使用兜底标题\n');
}

// 第 3 步：剥离已有的「## 引用来源」章节（含其前的 --- 分隔线），保证重跑不重复
const headingMatch = body.match(refHeading);
if (headingMatch) {
  body = body.slice(0, headingMatch.index).replace(/\r?\n---\s*$/, '').replace(/\s+$/, '') + '\n';
}

// 第 4 步：替换 <cite>URL</cite> -> [N]
body = body.replace(citePattern, (_m, url) => `[${urlIndex.get(url)}]`);

// 第 5 步：追加「## 引用来源」章节；标题优先元数据，兜底用域名+路径推导
function deriveTitle(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    const parts = u.pathname.split('/').filter(Boolean);
    const tail = parts.length > 0 ? parts[parts.length - 1].replace(/\.[^.]+$/, '') : '';
    const readable = tail
      ? tail.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 80)
      : host;
    return `${host} — ${readable}`;
  } catch {
    return url;
  }
}
const unregistered = [];
const refLines = urlOrder.map((url, i) => {
  const meta = sourceMeta.get(url);
  if (!meta) unregistered.push(url);
  const title = String(meta?.title || deriveTitle(url)).replace(/[\[\]\r\n]+/g, ' ').trim();
  return `${i + 1}. [${title}](${url})`;
});
const refSection = '\n\n---\n\n## 引用来源\n\n' + refLines.join('\n') + '\n';
body = body.replace(/\s*$/, '') + refSection;

await writeFile(reportPath, body, 'utf8');
process.stdout.write(`引用后处理完成：${urlOrder.length} 个独立 URL 已编号，报告已写回 ${reportPath}\n`);
if (unregistered.length) {
  process.stdout.write(`警告：${unregistered.length} 个引用未在 25-sources.json 登记，使用了域名+路径兜底标题：\n${unregistered.join('\n')}\n`);
}
