#!/usr/bin/env node

import { access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const input = resolve(process.argv[2] || "");
const output = resolve(process.argv[3] || resolve(dirname(input), "45-report.pdf"));
if (!process.argv[2]) throw new Error("用法：node export-report-pdf.mjs <40-report.html> [45-report.pdf]");

const candidates = [
  resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../skills/report-pdf/scripts/export-report-pdf.mjs"),
  resolve(dirname(fileURLToPath(import.meta.url)), "../../report-pdf/scripts/export-report-pdf.mjs"),
];
const checked = await Promise.all(candidates.map((candidate) => access(candidate).then(() => candidate, () => null)));
const shared = checked.find(Boolean);
if (!shared) throw new Error("缺少共享 report-pdf 导出器，请确认仓库级技能已部署");
const module = await import(pathToFileURL(shared).href);
await module.exportReportPdf({
  input,
  output,
  headerLabel: "DeepTrading",
  footerLabel: "Internal research material",
  profilePrefix: "deeptrading-pdf"
});
