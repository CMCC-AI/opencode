#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const workspace = resolve(process.argv[2] || '');
if (!process.argv[2]) throw new Error('用法：node render-report.mjs <workspace>');
const reportPath = resolve(workspace, '07-report/report.md');
const modePath = resolve(workspace, '02-data/data-mode.json');
const manifestPath = resolve(workspace, '06-visuals/chart-manifest.json');
const preflightPath = resolve(workspace, '07-report/preflight-quality.json');
const outputPath = resolve(workspace, '07-report/report.html');
const statePath = resolve(workspace, '07-report/render-state.json');
const report = await readFile(reportPath, 'utf8');
const mode = JSON.parse(await readFile(modePath, 'utf8'));
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const preflight = JSON.parse(await readFile(preflightPath, 'utf8'));
if (!['simulated', 'real', 'mixed'].includes(mode.data_mode)) throw new Error('data-mode.json 缺少合法 data_mode');
if (preflight.status !== 'passed' || Number(preflight.summary?.p0) !== 0) throw new Error('确定性质量预检未通过，拒绝渲染最终报告');

const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const inline = (value) => escape(value).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`(.+?)`/g, '<code>$1</code>');
const lines = report.split(/\r?\n/);
const body = [];
let inList = false;
let inTable = false;
let tableHeaderSeen = false;
const closeBlocks = () => {
  if (inList) { body.push('</ul>'); inList = false; }
  if (inTable) { body.push('</tbody></table></div>'); inTable = false; tableHeaderSeen = false; }
};
for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
  const line = lines[lineIndex];
  if (/^#{1,4}\s/.test(line)) {
    closeBlocks();
    const match = line.match(/^(#{1,4})\s+(.+)$/);
    body.push(`<h${match[1].length}>${inline(match[2])}</h${match[1].length}>`);
  } else if (/^!\[[^\]]*\]\([^)]+\)\s*$/.test(line)) {
    closeBlocks();
    const match = line.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/);
    body.push(`<figure><img src="${escape(match[2])}" alt="${escape(match[1])}" loading="lazy"><figcaption>${escape(match[1])}</figcaption></figure>`);
  } else if (/^>\s?/.test(line)) {
    closeBlocks();
    body.push(`<aside class="reader-note">${inline(line.replace(/^>\s?/, ''))}</aside>`);
  } else if (/^\|.*\|\s*$/.test(line)) {
    if (inList) { body.push('</ul>'); inList = false; }
    const cells = line.replace(/^\||\|\s*$/g, '').split('|').map((cell) => cell.trim());
    const nextLine = lines[lineIndex + 1] || '';
    if (!inTable) {
      inTable = true;
      body.push('<div class="table-wrap"><table>');
      if (/^\|?\s*:?-{3,}/.test(nextLine)) {
        body.push(`<thead><tr>${cells.map((cell) => `<th>${inline(cell)}</th>`).join('')}</tr></thead><tbody>`);
        tableHeaderSeen = true;
        lineIndex += 1;
      } else {
        body.push('<tbody>');
        body.push(`<tr>${cells.map((cell) => `<td>${inline(cell)}</td>`).join('')}</tr>`);
      }
    } else if (!/^\|?\s*:?-{3,}/.test(line)) {
      body.push(`<tr>${cells.map((cell) => `<td>${inline(cell)}</td>`).join('')}</tr>`);
    }
  } else if (/^-\s+/.test(line)) {
    if (inTable) { body.push('</tbody></table></div>'); inTable = false; tableHeaderSeen = false; }
    if (!inList) { body.push('<ul>'); inList = true; }
    body.push(`<li>${inline(line.replace(/^-\s+/, ''))}</li>`);
  } else if (!line.trim()) {
    closeBlocks();
  } else {
    closeBlocks();
    body.push(`<p>${inline(line)}</p>`);
  }
}
closeBlocks();

const watermark = mode.data_mode === 'simulated' ? '模拟数据，仅用于产品演示' : mode.data_mode === 'mixed' ? '混合数据，来源与假设见数据说明' : '授权聚合数据，来源见数据说明';
const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>DeepGeo 位置决策报告</title><style>
:root{--ink:#18243b;--muted:#657087;--blue:#1456a0;--blue-soft:#eef5fc;--line:#dce5ef;--paper:#fff}*{box-sizing:border-box}body{margin:0;background:#edf2f7;color:var(--ink);font:16.5px/1.9 -apple-system,BlinkMacSystemFont,"PingFang SC","Noto Sans CJK SC",sans-serif;letter-spacing:.01em}.page{max-width:900px;margin:28px auto 64px;background:var(--paper);padding:64px 76px 80px;box-shadow:0 10px 36px #18335418}.mark{position:sticky;top:0;z-index:2;background:#fff5f2;color:#a43d2f;padding:9px 20px;border-bottom:1px solid #f1c9c1;text-align:center;font-size:14px;font-weight:650}h1,h2,h3{color:#103f76;line-height:1.4;letter-spacing:0}h1{font-size:34px;margin:0 0 36px;padding-bottom:20px;border-bottom:3px solid #5d6bd8}h2{font-size:25px;margin:58px 0 20px;padding-top:4px}h3{font-size:19px;margin:34px 0 12px}p{margin:0 0 20px;text-align:justify}strong{color:#0d3e76}.reader-note{margin:20px 0 28px;padding:18px 22px;border-left:4px solid #5d6bd8;border-radius:4px;background:var(--blue-soft);color:#33415c}code{background:#eef3f9;padding:2px 5px;border-radius:4px}ul{margin:12px 0 24px;padding-left:1.4em}li{margin:7px 0}figure{margin:34px 0 42px;padding:16px 16px 12px;border:1px solid var(--line);border-radius:12px;background:#fff;break-inside:avoid}figure img{display:block;width:100%;height:auto}figcaption{margin-top:10px;color:var(--muted);font-size:13px;line-height:1.6;text-align:center}.table-wrap{overflow-x:auto;margin:24px 0 32px;border:1px solid var(--line);border-radius:10px}table{width:100%;border-collapse:collapse;font-size:14px;line-height:1.6}th,td{padding:11px 12px;border-right:1px solid var(--line);border-bottom:1px solid var(--line);text-align:left;vertical-align:top}tr:last-child td{border-bottom:0}th:last-child,td:last-child{border-right:0}th{background:var(--blue-soft);color:#103f76;font-weight:650}@media(max-width:760px){.page{margin:0;padding:38px 24px;box-shadow:none}h1{font-size:28px}h2{font-size:22px}}@media print{body{background:#fff;font-size:11pt}.page{box-shadow:none;margin:0;max-width:none;padding:0}.mark{position:static;margin-bottom:10mm}h2{break-after:avoid}figure,.table-wrap{break-inside:avoid}@page{size:A4;margin:17mm}}
</style></head><body><div class="mark">${escape(watermark)}</div><main class="page">${body.join('\n')}</main>
<script type="application/json" id="deepgeo-chart-manifest">${escape(JSON.stringify(manifest))}</script></body></html>`;
await writeFile(outputPath, html, 'utf8');
const sha = (value) => createHash('sha256').update(value).digest('hex');
await writeFile(statePath, `${JSON.stringify({ generator: 'render-report.mjs', data_mode: mode.data_mode, report_sha256: sha(report), html_sha256: sha(html), rendered_at: new Date().toISOString() }, null, 2)}\n`, 'utf8');
process.stdout.write(`DeepGeo HTML: ${outputPath}\n`);
