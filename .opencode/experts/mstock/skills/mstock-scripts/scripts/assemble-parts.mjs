// 标准分片组装脚本（解析式）：node .opencode/scripts/assemble-parts.mjs <分片目录> <目标文件> <N> <期望键1,键2,...>
// 规则：每片独立合法 JSON 对象；同键数组跨片=追加合并（大数组官方拆分姿势）；异值重复键报错；
//       期望键集必填，合并后键集必须完全一致（禁自造字段/缺字段）；UTF-8 无 BOM 写回。
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
const [dir, out, nStr, keysArg] = process.argv.slice(2);
const n = Number(nStr);
if (!dir || !out || !Number.isInteger(n) || n < 1 || !keysArg || !keysArg.trim()) {
  console.error("usage: node assemble-parts.mjs <dir> <out> <N> <key1,key2,...>");
  console.error("KEYSET_REQUIRED: expected top-level keys (comma-separated) are mandatory");
  process.exit(1);
}
const expect = keysArg.split(",").map((s) => s.trim()).filter(Boolean);
if (expect.length < 1) {
  console.error("KEYSET_REQUIRED: expected key list is empty");
  process.exit(1);
}
const merged = {};
for (let i = 1; i <= n; i++) {
  let p = join(dir, `part-${i}.json`);
  if (!existsSync(p)) p = join(dir, `part-${String(i).padStart(2, "0")}.json`);
  let obj;
  try {
    obj = JSON.parse(readFileSync(p, "utf8").replace(/^\uFEFF/, ""));
  } catch (e) {
    console.error(`SHARD_BAD part-${i}: ${e.message}`);
    process.exit(1);
  }
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
    console.error(`SHARD_BAD part-${i}: not a JSON object`);
    process.exit(1);
  }
  for (const [k, v] of Object.entries(obj)) {
    if (!(k in merged)) {
      merged[k] = v;
    } else if (Array.isArray(merged[k]) && Array.isArray(v)) {
      merged[k] = merged[k].concat(v);
    } else {
      console.error(`DUP_KEY ${k} in part-${i} (non-array conflict)`);
      process.exit(1);
    }
  }
}
const got = Object.keys(merged).sort().join(",");
const want = [...expect].sort().join(",");
if (got !== want) {
  console.error(`KEYSET_MISMATCH got=[${got}] want=[${want}]`);
  process.exit(1);
}
writeFileSync(out, JSON.stringify(merged, null, 2), "utf8");
const chk = JSON.parse(readFileSync(out, "utf8"));
console.log(`OK keys=${Object.keys(chk).length} -> ${out}`);
