#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const workspaceArg = process.argv[2];
if (!workspaceArg) {
  console.error("用法：node finalize-citations.mjs <workspace_dir>");
  process.exit(2);
}

const workspace = path.resolve(process.cwd(), workspaceArg);
const reportPath = path.join(workspace, "20-report.md");
const registryPath = path.join(workspace, "02-source-registry.json");
const inputPath = path.join(workspace, "00-input.json");
const auditPath = path.join(workspace, "22-citation-audit.json");
const referencesPath = path.join(workspace, "22-references.json");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function collectPublicSources() {
  const result = new Map();
  for (const name of fs.readdirSync(workspace).sort()) {
    if (!/^05-web-findings-\d+\.meta\.json$/.test(name)) continue;
    const meta = readJson(path.join(workspace, name));
    for (const record of Array.isArray(meta.source_records) ? meta.source_records : []) {
      if (!record || typeof record.url !== "string" || !record.url.startsWith("http")) continue;
      result.set(record.url, {
        title: record.title || record.url,
        url: record.url,
        publisher: record.publisher || "",
        published_at: record.published_at || null,
        source_file: name
      });
    }
  }
  return result;
}

function cleanInternalTitle(source, index) {
  const raw = String(source.title || "").trim();
  const base = raw.replace(/^.*[\\/]/, "").replace(/\.(json|jsonl|csv|xlsx?|docx?|pdf|md|txt)$/i, "").trim();
  const generic = /^(data|dataset|json|jason|export|customer[-_ ]?export|portal[-_ ]?data|file|document|附件|材料)$/i.test(base);
  if (base && !generic) return base;
  const names = {
    portal_export: "政企门户客户档案",
    portal_data: "政企门户客户档案",
    outline_data: "客户业务数据材料",
    file_content: "客户补充情况材料",
    attachment: "用户提供的业务材料",
    local_file: "本地业务材料"
  };
  return names[source.kind] || `用户提供的业务材料${index + 1}`;
}

const registry = readJson(registryPath);
const input = fs.existsSync(inputPath) ? readJson(inputPath) : {};
const registeredInternal = (registry.sources || []).filter((source) => source?.source_id);
const readableInternal = registeredInternal.filter((source) => source.read_status === "read");
const internalSources = new Map(readableInternal.map((source) => [`internal:${source.source_id}`, source]));
const publicSources = collectPublicSources();

let report = fs.readFileSync(reportPath, "utf8").replace(/^\uFEFF/, "");
report = report.replace(/\n## 参考文献[\s\S]*$/m, "").trimEnd();

const citationPattern = /<cite>(internal:SRC-\d{3}|https?:\/\/[^<\s]+)<\/cite>/g;
const orderedKeys = readableInternal.map((source) => `internal:${source.source_id}`);
const numberByKey = new Map(orderedKeys.map((key, index) => [key, index + 1]));
const unknown = [];

for (const match of report.matchAll(citationPattern)) {
  const key = match[1];
  if (numberByKey.has(key)) continue;
  const known = key.startsWith("internal:") ? internalSources.has(key) : publicSources.has(key);
  if (!known) {
    unknown.push(key);
    continue;
  }
  numberByKey.set(key, orderedKeys.length + 1);
  orderedKeys.push(key);
}

for (const match of report.matchAll(/<cite>([^<]+)<\/cite>/g)) {
  const key = match[1];
  if (!unknown.includes(key) && !numberByKey.has(key)) unknown.push(key);
}

const internalCount = readableInternal.length;
const publicCount = orderedKeys.filter((key) => key.startsWith("http")).length;
const referencePolicy = input.reference_policy || {};
const minimumTotal = Number(referencePolicy.minimum_total ?? 15);
const minimumPublic = Number(referencePolicy.minimum_public ?? (internalCount >= 10 ? 6 : 12));
const thresholdErrors = [];
if (orderedKeys.length < minimumTotal) thresholdErrors.push(`参考文献总数 ${orderedKeys.length}，低于最低要求 ${minimumTotal}`);
if (publicCount < minimumPublic) thresholdErrors.push(`外部公开来源 ${publicCount} 条，低于最低要求 ${minimumPublic} 条`);

if (unknown.length || thresholdErrors.length) {
  writeJson(auditPath, {
    pass: false,
    unknown_sources: [...new Set(unknown)],
    threshold_errors: thresholdErrors,
    internal_reference_count: internalCount,
    public_reference_count: publicCount,
    total_reference_count: orderedKeys.length,
    minimum_total: minimumTotal,
    minimum_public: minimumPublic,
    message: "引用来源或参考文献数量未达到正式交付要求，报告未被修改。"
  });
  console.error(`参考文献后处理失败：${unknown.length} 个未知来源，${thresholdErrors.length} 个数量问题`);
  process.exit(1);
}

report = report.replace(citationPattern, (_, key) => `[${numberByKey.get(key)}]`);

const references = orderedKeys.map((key, index) => {
  const n = index + 1;
  if (key.startsWith("internal:")) {
    const source = internalSources.get(key);
    const title = cleanInternalTitle(source, index);
    const displayTitle = `《${title}》（内部材料${source.updated_at ? `，资料截至${source.updated_at}` : ""}）`;
    return {
      n,
      kind: "local",
      title: displayTitle,
      url: "",
      source_id: source.source_id,
      updated_at: source.updated_at || null,
      markdown: `[${n}] ${displayTitle}`
    };
  }
  const source = publicSources.get(key);
  return {
    n,
    kind: "web",
    title: source.title,
    url: source.url,
    publisher: source.publisher,
    published_at: source.published_at,
    markdown: `[${n}] [${source.title}](${source.url})${source.published_at ? `，${source.published_at}` : ""}`
  };
});

const finalReport = `${report}\n\n## 参考文献\n\n${references.map((item) => item.markdown).join("\n\n")}\n`;
fs.writeFileSync(reportPath, finalReport, "utf8");
writeJson(referencesPath, references.map(({ markdown, source_id, ...item }) => item));

const remainingCiteTags = (finalReport.match(/<cite>/g) || []).length;
const audit = {
  pass: remainingCiteTags === 0,
  total_reference_count: references.length,
  internal_reference_count: internalCount,
  public_reference_count: publicCount,
  minimum_total: minimumTotal,
  minimum_public: minimumPublic,
  remaining_cite_tags: remainingCiteTags,
  human_readable_internal_titles: references.filter((item) => item.kind === "local").every((item) => !/\.(json|csv|xlsx?)\b|SRC-\d+/i.test(item.markdown))
};
writeJson(auditPath, audit);

if (!audit.pass || !audit.human_readable_internal_titles) process.exit(1);
console.log(`已整理 ${references.length} 条参考文献，其中内部材料 ${internalCount} 条、公开来源 ${publicCount} 条`);
