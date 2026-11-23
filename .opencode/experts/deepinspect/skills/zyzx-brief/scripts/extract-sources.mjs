#!/usr/bin/env node
// 材料抽取：node extract-sources.mjs <材料文件或目录> <输出目录，默认 ./90-sources>
// docx/xlsx 依赖 unzip，pdf 依赖 pdftotext（PATH 缺失时自动定位 Git for Windows 的 usr/bin、mingw64/bin）
// 抽取失败的文件写 <名>.error.txt，不猜测内容；成功输出 <名>.txt
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { resolve, join, extname } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const die = (msg) => { console.error(`EXTRACT_ABORT: ${msg}`); process.exit(1); };
const args = process.argv.slice(2);
if (args.length < 1) die("usage: node extract-sources.mjs <材料文件或目录> [输出目录]");
const inputPath = resolve(args[0]);
const outDir = resolve(args[1] || "./90-sources");
if (!existsSync(inputPath)) die(`输入不存在：${inputPath}`);

const xmlText = (x) => x.replace(/<[^>]*>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

const toolCache = new Map();
function toolPath(name) {
  if (toolCache.has(name)) return toolCache.get(name);
  let resolved = null;
  if (spawnSync(name, ["-v"], { stdio: "ignore", timeout: 5000 }).error?.code !== "ENOENT") resolved = name;
  else {
    try {
      const git = execFileSync("where", ["git"], { encoding: "utf8", timeout: 5000 }).trim().split(/\r?\n/)[0];
      const root = git ? resolve(git, "..", "..") : null;
      if (root) for (const dir of ["usr/bin", "mingw64/bin"]) for (const exe of [`${name}.exe`, name]) {
        const candidate = join(root, dir, exe);
        if (existsSync(candidate)) { resolved = candidate; break; }
      }
    } catch { /* where/git 不可用：保持未解析 */ }
  }
  toolCache.set(name, resolved);
  return resolved;
}

function extract(path) {
  const ext = extname(path).toLowerCase();
  if ([".md", ".txt", ".csv", ".tsv", ".json", ".jsonl"].includes(ext))
    return readFileSync(path, "utf8").replace(/^\uFEFF/, "");
  const unzipBin = toolPath("unzip");
  if (!unzipBin && (ext === ".docx" || ext === ".xlsx"))
    throw new Error("未找到 unzip（PATH 与 Git for Windows 的 usr/bin 均未找到）；请提供可靠的可读文本版本");
  const unzip = (member) => execFileSync(unzipBin, ["-p", path, member], { encoding: "utf8", timeout: 30000, maxBuffer: 32 * 1024 * 1024 });
  if (ext === ".docx")
    return xmlText(unzip("word/document.xml").replace(/<\/w:p>/g, "\n").replace(/<\/w:tc>/g, "\t").replace(/<w:tab\b[^>]*\/>/g, "\t"));
  if (ext === ".pdf") {
    const pdftotext = toolPath("pdftotext");
    if (!pdftotext) throw new Error("未找到 pdftotext（PATH 与 Git for Windows 的 mingw64/bin 均未找到）；请提供可靠的可读文本版本");
    return execFileSync(pdftotext, ["-layout", path, "-"], { encoding: "utf8", timeout: 30000, maxBuffer: 32 * 1024 * 1024 });
  }
  if (ext === ".xlsx") {
    let strings = [];
    try { strings = [...unzip("xl/sharedStrings.xml").matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((m) => xmlText(m[1])); } catch {}
    const names = execFileSync(unzipBin, ["-Z1", path], { encoding: "utf8", timeout: 30000 }).split("\n")
      .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
    return names.map((name) => `\n工作表 ${name}\n` + [...unzip(name).matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].map((row) =>
      [...row[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)].map((c) => {
        const ref = c[1].match(/r="([^"]+)"/)?.[1] || "";
        const v = c[2].match(/<v[^>]*>([\s\S]*?)<\/v>/)?.[1];
        const value = /t="s"/.test(c[1]) ? strings[Number(v)] ?? "" : /t="inlineStr"/.test(c[1]) ? xmlText(c[2]) : xmlText(v ?? "");
        return `${ref}=${value}${/<f\b/.test(c[2]) ? "（公式缓存值，未重新计算）" : ""}`;
      }).join("\t")).join("\n")).join("\n");
  }
  throw new Error(`不支持 ${ext}；请提供可靠的可读文本版本`);
}

function collectFiles(p) {
  const st = statSync(p);
  if (st.isFile()) return [p];
  const out = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (!/^\./.test(e.name) && !/\.(zip|png|jpe?g|gif|exe|dll|db)$/i.test(e.name)) out.push(full);
    }
  };
  walk(p);
  return out;
}

mkdirSync(outDir, { recursive: true });
const files = collectFiles(inputPath);
if (!files.length) die("未找到可抽取的材料文件");
const used = new Set();
let okCount = 0, failCount = 0;
for (const f of files) {
  let base = f.slice(inputPath.length + 1).replace(/[\\/]+/g, "__").replace(/\.[^.]+$/, "") || "material";
  while (used.has(base)) base = `${base}x`;
  used.add(base);
  try {
    const text = extract(f);
    if (!text || text.trim().length <= 20) throw new Error("提取内容为空或不足以可靠读取");
    writeFileSync(join(outDir, `${base}.txt`), text, "utf8");
    okCount++;
    console.log(`OK ${base} <- ${f}`);
  } catch (e) {
    writeFileSync(join(outDir, `${base}.error.txt`), `${f}\n${String(e && e.message ? e.message : e)}\n`, "utf8");
    failCount++;
    console.error(`FAIL ${base}: ${String(e && e.message ? e.message : e).split(/\r?\n/)[0]}`);
  }
}
console.log(`DONE ok=${okCount} fail=${failCount} -> ${outDir}`);
if (!okCount) process.exit(1);
