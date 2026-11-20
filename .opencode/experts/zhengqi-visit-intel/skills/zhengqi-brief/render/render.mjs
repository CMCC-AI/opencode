#!/usr/bin/env node
// 渲染脚本：node render.mjs <workspace>
// 输入：workspace 目录（须含 00-input.json + 60-quick-report.md + 61-quick-charts.json）
// 输出：65-quick-report.html + 66-quick-report.pdf + 70-quick-stats.json
// 自包含：templates/、lib/、export-report-pdf.mjs 与本脚本同目录
//   （engines-src/ 为母版全量三模板；各业务 skill 的 render/ 为单模板分发件，同一份代码）
// 00-input.json 的 template 字段选皮；缺省/非法时若 templates/ 仅一张模板则自动采用
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const PLACEHOLDER_RE = /__(?:TITLE|BRAND_KICKER|DISCLAIMER_HTML|QUICK_META_JSON|QUICK_CHARTS_JSON|QUICK_MD|MARKED_JS|ECHARTS_JS)__/;
const CHART_PLACEHOLDER_RE = /<!--CHART:([a-zA-Z0-9-]+)-->/g;

const die = (code, detail) => { console.error(`${code}${detail ? ": " + detail : ""}`); process.exit(1); };
const readT = (p) => readFileSync(p, "utf8").replace(/^\uFEFF/, "");
const parseJsonFile = (p, code, hint) => {
  try { return JSON.parse(readT(p)); } catch (e) { die(code, `${p}: ${e.message}${hint ? `（${hint}）` : ""}`); }
};
const fmtTime = (ms) => {
  const d = new Date(ms); const p = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

const scriptDir = dirname(fileURLToPath(import.meta.url));

const rawRunDir = process.argv[2];
if (!rawRunDir) { console.error("usage: node render.mjs <workspace>"); process.exit(1); }
const runDir = resolve(rawRunDir);
if (!existsSync(runDir) || !statSync(runDir).isDirectory()) die("RUN_DIR_NOT_FOUND", runDir);

// ── 输入检查 ──
const mdPath = join(runDir, "60-quick-report.md");
const chartsPath = join(runDir, "61-quick-charts.json");
const inputPath = join(runDir, "00-input.json");
for (const [p, name] of [[mdPath, "60-quick-report.md"], [chartsPath, "61-quick-charts.json"], [inputPath, "00-input.json"]]) {
  if (!existsSync(p)) die("MISSING_INPUT", name);
}

// ── 1. 校验 60 markdown ──
const inputObj = parseJsonFile(inputPath, "INVALID_INPUT_JSON");
const sourceHeading = typeof inputObj.source_heading === "string" && inputObj.source_heading.trim()
  ? inputObj.source_heading.trim() : "## 数据与来源";
const disclaimerText = typeof inputObj.disclaimer_text === "string"
  ? inputObj.disclaimer_text.trim() : "不构成投资建议";
const md = readT(mdPath);
const h1 = (md.match(/^#\s+(.+)$/m) || [])[1];
if (!h1) die("INVALID_QUICK_MD", "60 首行缺观点式 `# ` 标题");
if (disclaimerText && !md.includes(disclaimerText)) die("INVALID_QUICK_MD", `60 缺免责声明文案（${disclaimerText}）`);
if (!md.includes(sourceHeading)) die("INVALID_QUICK_MD", `60 缺 \`${sourceHeading}\` 章节`);

// ── 2. 校验 61 charts JSON ──
const chartsObj = parseJsonFile(chartsPath, "INVALID_CHARTS_JSON", "按契约修正后重跑");
for (const k of Object.keys(chartsObj)) {
  if (!["title", "subtitle", "hero_stats", "charts"].includes(k)) die("INVALID_CHARTS_JSON", `非契约顶层键 ${k}`);
}
const chartsTitle = String(chartsObj.title || "");
if (chartsTitle.trim() !== h1.trim()) die("MD_TITLE_MISMATCH", `61.title 与 60 H1 不一致`);
const heroStats = Array.isArray(chartsObj.hero_stats) ? chartsObj.hero_stats : [];
if (heroStats.length > 5) die("INVALID_CHARTS_JSON", `hero_stats=${heroStats.length}（上限 5）`);
const charts = Array.isArray(chartsObj.charts) ? chartsObj.charts : [];
if (charts.length > 6) die("INVALID_CHARTS_JSON", `charts=${charts.length}（上限 6）`);
const idRe = /^[a-zA-Z0-9-]+$/;
const seenIds = new Set(); let tableCount = 0;
for (const c of charts) {
  if (!c || typeof c !== "object" || !idRe.test(String(c.id || "")) || !c.title || !c.option || typeof c.option !== "object")
    die("INVALID_CHARTS_JSON", "charts 条目须含 id/title/option");
  for (const k of Object.keys(c)) if (!["id", "title", "option", "table"].includes(k))
    die("INVALID_CHARTS_JSON", `chart ${c.id} 非契约键 ${k}`);
  if (c.table !== undefined) {
    const tb = c.table;
    if (!tb || typeof tb !== "object" || !Array.isArray(tb.columns) || tb.columns.length < 2 ||
        !tb.columns.every((x) => typeof x === "string") || !Array.isArray(tb.rows) || tb.rows.length < 1 ||
        !tb.rows.every((r) => Array.isArray(r) && r.length === tb.columns.length))
      die("INVALID_CHARTS_JSON", `chart ${c.id} table 结构非法`);
    tableCount++;
  }
  if (seenIds.has(c.id)) die("INVALID_CHARTS_JSON", `图表 id 重复：${c.id}`);
  seenIds.add(c.id);
}
const placeholderIds = new Set();
for (const m of md.matchAll(CHART_PLACEHOLDER_RE)) placeholderIds.add(m[1]);
const missing = [...placeholderIds].filter((id) => !seenIds.has(id));
if (missing.length) die("INVALID_CHARTS_JSON", `60 占位但 61 无图：${missing.join(", ")}`);
const usedCharts = charts.filter((c) => placeholderIds.has(c.id));
for (const c of charts) if (!placeholderIds.has(c.id)) console.error(`WARN CHART_WITHOUT_PLACEHOLDER: ${c.id}（已丢弃）`);

// ── 3. 渲染：模板与 lib 与本脚本同目录 ──
const tplDir = join(scriptDir, "templates");
let tplName = typeof inputObj.template === "string" && /^[a-z0-9-]{1,40}$/.test(inputObj.template.trim())
  ? inputObj.template.trim() : "";
if (!tplName) {
  const available = existsSync(tplDir) ? readdirSync(tplDir).filter((f) => f.endsWith(".html.tpl")) : [];
  tplName = available.length === 1 ? available[0].replace(/\.html\.tpl$/, "") : "report";
}
const tplPath = join(tplDir, `${tplName}.html.tpl`);
if (!existsSync(tplPath)) die("TEMPLATE_NOT_FOUND", tplPath);
{
  const raw = readT(tplPath);
  for (const ph of ["__TITLE__", "__QUICK_MD__", "__QUICK_CHARTS_JSON__", "__MARKED_JS__", "__ECHARTS_JS__"]) {
    if (!raw.includes(ph)) die("TEMPLATE_INVALID", `${tplName}.html.tpl 缺占位符 ${ph}`);
  }
}
const cacheLibDir = join(runDir, "99-url-cache", "lib");
import { mkdirSync } from "node:fs";
mkdirSync(cacheLibDir, { recursive: true });
const libJs = {};
for (const [ph, file] of [["__MARKED_JS__", "marked.min.js"], ["__ECHARTS_JS__", "echarts.min.js"]]) {
  const libPath = join(scriptDir, "lib", file);
  if (!existsSync(libPath) || statSync(libPath).size < 1024) die("LIB_MISSING", `${file} 本目录 lib/ 缺失`);
  libJs[ph] = readT(libPath);
}

const meta = { title: chartsTitle, subtitle: String(chartsObj.subtitle || ""), hero_stats: heroStats,
  generated_at: inputObj.current_date || fmtTime(Date.now()),
  footer_text: typeof inputObj.footer_text === "string" && inputObj.footer_text.trim() ? inputObj.footer_text.trim() : "DeepTrading Agent Team 快速研究通道" };
const safeJson = (s) => s.replace(/<\/script>/gi, "<\\/script>");
const tpl = readT(tplPath);
let html = tpl
  .replaceAll("__TITLE__", () => chartsTitle)
  .replaceAll("__BRAND_KICKER__", () => typeof inputObj.brand_kicker === "string" && inputObj.brand_kicker.trim() ? inputObj.brand_kicker.trim() : "DEEPTRADING · QUICK RESEARCH")
  .replaceAll("__DISCLAIMER_HTML__", () => inputObj.disclaimer_html ? String(inputObj.disclaimer_html) : "免责声明：本报告不构成投资建议，仅供研究参考。本流程产出仅用于学术研究、工程实验与教学演示。")
  .replaceAll("__QUICK_META_JSON__", () => safeJson(JSON.stringify(meta)))
  .replaceAll("__QUICK_CHARTS_JSON__", () => safeJson(JSON.stringify(usedCharts)))
  .replaceAll("__QUICK_MD__", () => safeJson(JSON.stringify(md)))
  .replaceAll("__MARKED_JS__", () => libJs["__MARKED_JS__"])
  .replaceAll("__ECHARTS_JS__", () => libJs["__ECHARTS_JS__"]);
if (PLACEHOLDER_RE.test(html)) die("PLACEHOLDER_LEFTOVER", html.match(PLACEHOLDER_RE)[0]);
const outPath = join(runDir, "65-quick-report.html");
writeFileSync(outPath, html, "utf8");
const htmlBytes = statSync(outPath).size;
if (htmlBytes < 30720) console.error(`WARN HTML_LT_30KB: ${htmlBytes}B`);

// ── 4. 变体扫描 ──
const variants = readdirSync(runDir).filter((f) => f.toLowerCase().endsWith(".html") && f !== "65-quick-report.html");
if (variants.length) die("VARIANT_HTML", variants.join(", "));

// ── 5. PDF：同目录 export-report-pdf.mjs ──
let pdfNote = "pdf=WARN";
{
  const pdfPath = join(scriptDir, "export-report-pdf.mjs");
  try {
    const { exportReportPdf } = await import(pathToFileURL(pdfPath).href);
    await exportReportPdf({ input: outPath, output: join(runDir, "66-quick-report.pdf"), profilePrefix: "report-render" });
    pdfNote = "pdf=OK";
  } catch (e) {
    const firstErr = String(e && e.message ? e.message : e).split(/\r?\n/)[0];
    console.error(`WARN PDF_EXPORT_SKIPPED: ${firstErr}（HTML 交付不受影响）`);
  }
}

// ── 6. 统计 ──
const startStat = statSync(inputPath);
const startMs = startStat.birthtimeMs > 0 ? startStat.birthtimeMs : startStat.mtimeMs;
let endMs = 0;
for (const f of readdirSync(runDir, { withFileTypes: true })) {
  if (!f.isFile()) continue;
  const m = statSync(join(runDir, f.name)).mtimeMs;
  if (m > endMs) endMs = m;
}
const bodyText = md.slice(0, Math.max(0, md.indexOf(sourceHeading)));
const chineseChars = (bodyText.match(/[\u4e00-\u9fa5]/g) || []).length;
const srcIdx = md.indexOf(sourceHeading);
const sourceCount = srcIdx >= 0 ? ((md.slice(srcIdx).match(/^\s*\d+\./gm) || []).length) : 0;
const stats = {
  workspace: basename(runDir), mode: inputObj.mode || "quick",
  research_question: inputObj.research_question || inputObj.user_input || "",
  ticker: inputObj.ticker || "", company_name: inputObj.company_name || "", trade_date: inputObj.trade_date || "",
  duration_seconds: Math.round((endMs - startMs) / 1000), duration_minutes: Math.round(((endMs - startMs) / 60000) * 10) / 10,
  quick_report_chinese_chars: chineseChars, chart_count: usedCharts.length, source_count: sourceCount,
};
writeFileSync(join(runDir, "70-quick-stats.json"), JSON.stringify(stats, null, 2), "utf8");
console.log(`OK charts=${usedCharts.length}/${charts.length} tables=${tableCount} chars=${chineseChars} sources=${sourceCount} html=${htmlBytes}B ${pdfNote} -> ${outPath}`);
