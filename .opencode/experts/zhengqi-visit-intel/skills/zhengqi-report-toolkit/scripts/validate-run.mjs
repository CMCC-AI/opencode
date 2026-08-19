#!/usr/bin/env node

import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const workspace = resolve(process.argv[2] || "");
if (!process.argv[2]) throw new Error("用法：node validate-run.mjs <workspace_dir>");
const readText = async (file) => (await readFile(file, "utf8")).replace(/^\uFEFF/, "");
const readJson = async (file) => JSON.parse(await readText(file));
const fileStat = async (name) => stat(resolve(workspace, name));

const required = [
  "00-input.json", "02-source-registry.json", "20-report.md", "21-evidence-review-1.json",
  "22-citation-audit.json", "22-references.json", "23-presentation-audit.json",
  "25-visual-report.json", "30-report.html", "35-report.pdf"
];
const sizes = {};
for (const name of required) {
  const info = await fileStat(name).catch(() => null);
  if (!info?.isFile() || info.size === 0) throw new Error(`缺少或为空：${name}`);
  sizes[name] = info.size;
}

const files = await readdir(workspace);
const reviewNames = files.filter((name) => /^21-evidence-review-\d+\.json$/.test(name)).sort();
const review = await readJson(resolve(workspace, reviewNames.at(-1)));
if (review.pass !== true) throw new Error(`证据核验未通过：${review.summary || "未提供原因"}`);

const citationAudit = await readJson(resolve(workspace, "22-citation-audit.json"));
if (citationAudit.pass !== true) throw new Error("引用或参考文献数量门未通过");
if (citationAudit.total_reference_count < citationAudit.minimum_total) throw new Error("参考文献总数低于要求");
if (citationAudit.public_reference_count < citationAudit.minimum_public) throw new Error("公开来源数量低于要求");
if (citationAudit.human_readable_internal_titles !== true) throw new Error("内部参考文献仍含机器文件名或内部编号");

const presentation = await readJson(resolve(workspace, "23-presentation-audit.json"));
if (presentation.pass !== true) throw new Error("正式成品表达检查未通过");

const markdown = await readText(resolve(workspace, "20-report.md"));
if (/<cite>|<\/cite>/.test(markdown)) throw new Error("Markdown 仍含未处理引用标签");
if (!/^## 参考文献\s*$/m.test(markdown)) throw new Error("Markdown 缺少参考文献章节");
if (/(?:数字|数值|数据).{0,6}(?:逐字)?保真|用户\s*brief|\bworkspace\b|SRC-\d+|[「」『』]/i.test(markdown)) throw new Error("Markdown 仍含不适合正式交付的表达");

const input = await readJson(resolve(workspace, "00-input.json"));
const promptValues = [input.prompt, input.user_prompt, input.raw_prompt, input.query]
  .filter((value) => typeof value === "string" && value.trim().length >= 30);
const html = await readText(resolve(workspace, "30-report.html"));
if (/__(?:TITLE|VISUAL_REPORT_JSON|REFERENCES_JSON|PRINT_CSS)__/.test(html)) throw new Error("HTML 仍含裸占位符");
if (!/<\/html>\s*$/.test(html)) throw new Error("HTML 结构不完整");
if (promptValues.some((value) => html.includes(value.trim()))) throw new Error("HTML 中出现用户原始提示词");
if (!html.includes("@page") || !html.includes("size: A4")) throw new Error("HTML 未注入 A4 打印样式");
if (!html.includes("#0066cc") && !html.includes("#0066CC")) throw new Error("HTML 未使用中国移动蓝色体系");

const pdf = await readFile(resolve(workspace, "35-report.pdf"));
if (pdf.subarray(0, 4).toString() !== "%PDF" || pdf.length < 1024) throw new Error("PDF 文件无效");
const htmlInfo = await fileStat("30-report.html");
const pdfInfo = await fileStat("35-report.pdf");
if (htmlInfo.mtimeMs > pdfInfo.mtimeMs) throw new Error("PDF 早于最新 HTML，需要重新导出");

const chineseChars = (markdown.match(/[\u4e00-\u9fff]/g) || []).length;
const references = await readJson(resolve(workspace, "22-references.json"));
const stats = {
  workspace,
  validated_at: new Date().toISOString(),
  evidence_review: reviewNames.at(-1),
  evidence_passed: true,
  presentation_passed: true,
  report_chinese_chars: chineseChars,
  reference_count: references.length,
  local_reference_count: references.filter((item) => item.kind === "local").length,
  web_reference_count: references.filter((item) => item.kind === "web").length,
  artifact_sizes: sizes,
  structural_validation_passed: true,
  visual_validation_required: true
};
await writeFile(resolve(workspace, "40-stats.json"), `${JSON.stringify(stats, null, 2)}\n`, "utf8");
process.stdout.write(`结构验收通过：${chineseChars} 个汉字，${references.length} 条参考文献。仍需逐页视觉验收。\n`);
