#!/usr/bin/env node

import { access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const input = resolve(process.argv[2] || "");
const output = resolve(process.argv[3] || resolve(dirname(input), "35-report.pdf"));
if (!process.argv[2]) throw new Error("用法：node export-report-pdf.mjs <30-report.html> [35-report.pdf]");

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
  headerLabel: "DeepInspect",
  footerLabel: "Internal Use Only",
  profilePrefix: "deepinspect-pdf",
  pageChecks: [
    {
      name: "正文污染检查",
      expression: String.raw`(function(){
        var text = document.body ? document.body.innerText : '';
        var pattern = /\b(?:COMMON|TYP|CONFLICT|IND)-\d+\b|\bR\d+-I\d+\b|\bSRC-\d+\b|\b(?:group_id|issue_id|conflict_id|source_ids|risk_level|confidence|comments|conflict_type)\b|file:\/\/\/|\/(?:Users|home)\/[^\s]+|\*\*[^*]+\*\*/gi;
        return Array.from(new Set(text.match(pattern) || []));
      })()`,
    },
    {
      name: "图表清晰度检查",
      expression: String.raw`(function(){
        return Array.from(document.querySelectorAll('.chart-canvas')).map(function(el){
          var id = el.id || 'chart';
          var svg = el.querySelector('svg');
          if (!svg) return id + ': missing-svg';
          var container = el.getBoundingClientRect();
          var textRects = Array.from(svg.querySelectorAll('text')).map(function(node){
            var rect = node.getBoundingClientRect();
            return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
          }).filter(function(rect){ return rect.width > 0 && rect.height > 0; });
          var overflowing = textRects.some(function(rect){
            return rect.left < container.left - 2 || rect.right > container.right + 2 || rect.top < container.top - 2 || rect.bottom > container.bottom + 2;
          });
          if (overflowing) return id + ': label-overflow';
          for (var i = 0; i < textRects.length; i++) {
            for (var j = i + 1; j < textRects.length; j++) {
              var a = textRects[i], b = textRects[j];
              var overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
              var overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
              if (overlapX > 2 && overlapY > 2) return id + ': label-overlap';
            }
          }
          return null;
        }).filter(Boolean);
      })()`,
    },
  ],
});
