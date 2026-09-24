#!/usr/bin/env node
// 图表闸门薄入口：把 30-visual-report.json 里 chart block 的扁平 data 委托仓库级 chart-builder 技能
// 校验并组装 ECharts option（就地写回，多股横评紫色系色板）。校验失败的图表整块丢弃并在日志报出
// 标题与原因；仍自带 option 的旧格式 block 原样保留。渲染（render_html.py）因此永远不会遇到坏 option。

import { access, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const workspace = resolve(process.argv[2] || "");
if (!process.argv[2]) throw new Error("用法：node build-charts.mjs <workspace_dir>");

const scriptDir = resolve(fileURLToPath(new URL(".", import.meta.url)));
const candidates = [
  resolve(scriptDir, "../../../../../skills/chart-builder/scripts/build-charts.mjs"),
  resolve(scriptDir, "../../chart-builder/scripts/build-charts.mjs"),
];
const shared = (await Promise.all(candidates.map((candidate) => access(candidate).then(() => candidate, () => null)))).find(Boolean);
if (!shared) throw new Error("缺少共享 chart-builder 脚本，请确认仓库级技能已部署");
const { injectChartOptions } = await import(pathToFileURL(shared).href);

const visualPath = resolve(workspace, "30-visual-report.json");
const visual = JSON.parse((await readFile(visualPath, "utf8")).replace(/^\uFEFF/, ""));
const summary = injectChartOptions(visual.sections || [], {
  palette: ["#7c3aed", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#94a3b8"],
});
await writeFile(visualPath, JSON.stringify(visual, null, 2) + "\n", "utf8");
process.stdout.write(`图表校验：${summary.kept}/${summary.total} 张通过`);
if (summary.dropped.length) {
  process.stdout.write(`，已丢弃 ${summary.dropped.length} 张：\n`);
  for (const dropped of summary.dropped) process.stdout.write(`  - 「${dropped.title}」：${dropped.errors.join("；")}\n`);
} else {
  process.stdout.write("\n");
}
if (summary.total && !summary.kept) {
  process.stdout.write("警告：全部图表被丢弃，应退回 ms-visualizer 按契约重做图表数据\n");
}
