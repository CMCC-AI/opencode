#!/usr/bin/env node
// report-render PDF 导出薄入口：委托仓库级 report-pdf 技能（CDP 无头浏览器、中文字体注入校验、
// 等待图表渲染、A4 打印）。默认输出与 HTML 同名 .pdf。
// 用法：node export-report-pdf.mjs <input.html> [output.pdf]

import { access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const input = resolve(process.argv[2] || "");
const output = process.argv[3] ? resolve(process.argv[3]) : resolve(dirname(input), `${input.split(/[\\/]/).at(-1)?.replace(/\.html?$/i, "") || "report"}.pdf`);
if (!process.argv[2]) throw new Error("用法：node export-report-pdf.mjs <input.html> [output.pdf]");

const candidates = [
  resolve(dirname(fileURLToPath(import.meta.url)), "../../report-pdf/scripts/export-report-pdf.mjs"),
  resolve(dirname(fileURLToPath(import.meta.url)), "../report-pdf/scripts/export-report-pdf.mjs"),
];
const shared = (await Promise.all(candidates.map((candidate) => access(candidate).then(() => candidate, () => null)))).find(Boolean);
if (!shared) throw new Error("缺少共享 report-pdf 导出器，请确认仓库级技能已部署");
const module = await import(pathToFileURL(shared).href);
await module.exportReportPdf({ input, output, profilePrefix: "report-render" });
