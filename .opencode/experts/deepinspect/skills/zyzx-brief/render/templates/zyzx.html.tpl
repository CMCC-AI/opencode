<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>__TITLE__</title>
<script>__MARKED_JS__</script>
<script>__ECHARTS_JS__</script>
<style>
  :root {
    --bg: #f7f5f1; --surface: #ffffff; --text: #26221e; --text-soft: #5a524a;
    --border: #e2d9d2; --accent: #a31515; --accent-dark: #7a0e0e; --accent-soft: #faf1ef;
    --muted: #8a7f75;
    --info-bg: #faf1ef; --info-border: #c97b6d; --info-text: #7a0e0e;
    --positive-bg: #f0f7f2; --positive-border: #4d8a5f; --positive-text: #2f5c3f;
    --warning-bg: #fbf6ea; --warning-border: #b8934a; --warning-text: #6f5524;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 0; background: var(--bg); color: var(--text);
    font-family: "FangSong", "仿宋", "STFangsong", "Noto Serif SC", "SimSun", "宋体", serif;
    font-size: 16px; line-height: 2.0;
    word-break: break-all; line-break: anywhere; overflow-wrap: anywhere;
  }
  .layout { display: grid; grid-template-columns: 228px 1fr; max-width: 1180px; margin: 0 auto; }
  .toc {
    position: sticky; top: 0; align-self: start; height: 100vh; overflow-y: auto;
    padding: 28px 14px; border-right: 1px solid var(--border);
    font-size: 13px; color: var(--text-soft); background: var(--bg);
    font-family: "Noto Sans SC", "Microsoft YaHei", sans-serif;
  }
  .toc h4 { margin: 0 0 12px 0; font-size: 11px; letter-spacing: 0.5em; color: var(--accent); font-weight: 700;
    border-bottom: 1px solid var(--border); padding-bottom: 8px; }
  .toc a { display: block; padding: 4px 9px; color: var(--text-soft); text-decoration: none;
    border-radius: 3px; border-left: 2px solid transparent; margin-bottom: 2px; }
  .toc a:hover { background: var(--accent-soft); color: var(--accent-dark); border-left-color: var(--accent); }
  .toc a.lvl-3 { padding-left: 22px; font-size: 12px; }
  .main { padding: 48px 52px 100px; min-width: 0; background: var(--bg); }
  .paper { background: var(--surface); border: 1px solid var(--border); box-shadow: 0 2px 10px rgba(74, 52, 44, 0.06);
    padding: 56px 64px 48px; }
  /* 红头标题区：白底红字、居中、下衬公文红线，无数据卡 */
  .hero { text-align: center; padding: 8px 0 26px; margin-bottom: 34px;
    border-bottom: 3px solid var(--accent); position: relative; }
  .hero::after { content: ''; position: absolute; left: 0; right: 0; bottom: -7px;
    border-bottom: 1px solid var(--accent); }
  .hero .kicker { font-size: 12px; letter-spacing: 0.42em; text-indent: 0.42em; color: var(--accent);
    font-weight: 600; margin-bottom: 16px;
    font-family: "Noto Sans SC", "Microsoft YaHei", sans-serif; }
  .hero h1 { font-size: 30px; line-height: 1.45; margin: 0 0 12px 0; font-weight: 900; color: var(--accent-dark);
    font-family: "Noto Serif SC", "Source Han Serif SC", "SimSun", "宋体", serif; letter-spacing: 0.04em; }
  .hero .subtitle { font-size: 16px; color: var(--text-soft); margin: 0 0 14px 0;
    font-family: "KaiTi", "楷体", "STKaiti", "Noto Serif SC", serif; }
  .hero .meta { font-size: 13px; color: var(--muted);
    font-family: "Noto Sans SC", "Microsoft YaHei", sans-serif; }
  /* 正文（公文版式：黑体章标题 / 楷体节标题 / 仿宋正文） */
  #report-body { position: relative; }
  #report-body h1 { display: none; }
  #report-body h2 { font-size: 21px; margin: 34px 0 18px 0; padding: 0 0 10px 14px;
    border-left: 5px solid var(--accent); border-bottom: 1px solid var(--border);
    color: var(--accent-dark); font-weight: 700; line-height: 1.6;
    font-family: "Noto Sans SC", "SimHei", "黑体", "Microsoft YaHei", sans-serif; }
  #report-body h3 { font-size: 18px; margin: 26px 0 12px; color: var(--text); font-weight: 700;
    font-family: "KaiTi", "楷体", "STKaiti", "Noto Serif SC", "SimSun", serif; }
  #report-body h4 { font-size: 16.5px; margin: 20px 0 10px; color: var(--accent-dark); font-weight: 700;
    font-family: "KaiTi", "楷体", "STKaiti", "Noto Serif SC", serif; }
  #report-body p { margin: 12px 0; text-align: justify; }
  #report-body em { color: var(--muted); font-size: 13.5px; }
  #report-body strong { color: var(--accent-dark); }
  #report-body blockquote { margin: 16px 0; padding: 12px 20px; border-left: 4px solid var(--info-border);
    background: var(--info-bg); color: var(--info-text); border-radius: 0 4px 4px 0; }
  #report-body table { border-collapse: separate; border-spacing: 0; width: 100%; margin: 18px 0;
    font-size: 14.5px; background: var(--surface); border: 1px solid var(--border);
    border-radius: 4px; overflow: hidden; line-height: 1.7;
    font-family: "Noto Sans SC", "Microsoft YaHei", sans-serif; }
  #report-body th, #report-body td { padding: 9px 13px; text-align: left; border-bottom: 1px solid var(--border); }
  #report-body th { background: var(--accent-soft); font-weight: 700; color: var(--accent-dark);
    border-bottom: 2px solid var(--accent); }
  #report-body tr:last-child td { border-bottom: none; }
  #report-body tr:hover td { background: var(--accent-soft); }
  #report-body ul, #report-body ol { padding-left: 28px; }
  #report-body li { margin: 7px 0; }
  #report-body a { color: var(--accent); text-decoration: none; border-bottom: 1px dashed #d4a49c; }
  #report-body hr { border: none; border-top: 1px dashed var(--border); margin: 26px 0; }
  /* [N] 引用标记：红色上标 */
  #report-body sup.cite { color: var(--accent); font-size: 11px; font-weight: 700; line-height: 1;
    font-family: "Noto Sans SC", "Times New Roman", serif; padding: 0 1px; }
  /* 图表块 */
  .chart-block { background: var(--surface); border: 1px solid var(--border); border-radius: 6px;
    padding: 20px 24px 12px; margin: 22px 0; box-shadow: 0 1px 5px rgba(74, 52, 44, 0.05);
    transition: box-shadow 0.2s;
    font-family: "Noto Sans SC", "Microsoft YaHei", sans-serif; }
  .chart-block:hover { box-shadow: 0 4px 14px rgba(74, 52, 44, 0.1); }
  .chart-block .chart-title { font-size: 15px; font-weight: 700; color: var(--accent-dark); margin-bottom: 12px;
    padding-left: 10px; border-left: 4px solid var(--accent); }
  .chart-block .chart-canvas { width: 100%; height: 380px; }
  .chart-block .chart-toggle { display: flex; justify-content: flex-end; gap: 6px; margin: 2px 0 6px; }
  .chart-block .chart-toggle button { border: 1px solid var(--info-border); background: var(--accent-soft); color: var(--accent-dark);
    font-size: 12px; font-weight: 600; padding: 3px 12px; border-radius: 12px; cursor: pointer; line-height: 1.6; }
  .chart-block .chart-toggle button:hover { filter: brightness(0.96); }
  .chart-block .chart-toggle button.active { background: var(--accent); color: #fff; border-color: var(--accent); }
  .chart-block .chart-table { display: none; }
  .chart-block .chart-table table { border-collapse: collapse; width: 100%; margin: 4px 0 8px; font-size: 13px; }
  .chart-block .chart-table th, .chart-block .chart-table td { border: 1px solid var(--border); padding: 6px 10px; text-align: right; }
  .chart-block .chart-table th:first-child, .chart-block .chart-table td:first-child { text-align: left; }
  .chart-block .chart-table th { background: var(--accent-soft); font-weight: 600; }
  .chart-block.view-table .chart-canvas { display: none; }
  .chart-block.view-table .chart-table { display: block; }
  .chart-block .chart-note { display: none; }
  .chart-block.chart-missing .chart-canvas { display: none; }
  .chart-block.chart-missing .chart-note { display: block; color: var(--muted);
    font-size: 13px; padding: 22px 0 14px; text-align: center; }
  /* 声明与页脚 */
  .disclaimer { background: var(--warning-bg); border: 1px solid var(--warning-border); border-radius: 4px;
    padding: 16px 24px; margin-top: 40px; color: var(--warning-text); font-size: 13.5px; line-height: 1.9; }
  .footer { margin-top: 24px; text-align: center; color: var(--muted); font-size: 12.5px;
    font-family: "Noto Sans SC", "Microsoft YaHei", sans-serif; }
  .fallback-pre { white-space: pre-wrap; font-family: inherit; }
  @media (max-width: 960px) {
    .layout { grid-template-columns: 1fr; }
    .toc { display: none; }
    .main { padding: 20px 16px 60px; }
    .paper { padding: 28px 22px 30px; }
  }
  @media print {
    body { background: #fff; }
    .layout { display: block; max-width: none; }
    .toc { display: none; }
    .main { padding: 0; max-width: none; }
    .paper { border: none; box-shadow: none; padding: 0; }
    .hero { box-shadow: none; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .chart-block { box-shadow: none; break-inside: avoid; }
    .chart-block:hover { box-shadow: none; }
    .chart-block .chart-canvas { height: 340px; }
    svg { max-width: 100% !important; height: auto; }
    table { break-inside: avoid; }
    section, .paper > div { break-inside: auto; }
  }
</style>
</head>
<body>
<div class="layout">
  <nav class="toc" id="toc">
    <h4>目 录</h4>
    <div id="toc-list"></div>
  </nav>
  <div class="main">
    <div class="paper">
      <header class="hero" id="hero">
        <div class="kicker">__BRAND_KICKER__</div>
        <h1 id="doc-title"></h1>
        <p class="subtitle" id="doc-subtitle"></p>
        <div class="meta" id="doc-meta"></div>
      </header>
      <div id="report-body"></div>
      <div class="disclaimer">
        __DISCLAIMER_HTML__
      </div>
      <div class="footer" id="footer-meta"></div>
    </div>
  </div>
</div>
<script>
(function () {
  'use strict';
  var META = __QUICK_META_JSON__;
  var CHARTS = __QUICK_CHARTS_JSON__;
  var MD = __QUICK_MD__;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  document.getElementById('doc-title').textContent = META.title || '巡察材料整编报告';
  document.getElementById('doc-subtitle').textContent = META.subtitle || '';
  document.getElementById('doc-meta').textContent = '生成日期：' + (META.generated_at || '');

  var bodyEl = document.getElementById('report-body');
  var html = '';
  if (window.marked && typeof window.marked.parse === 'function') {
    html = window.marked.parse(MD);
  } else {
    html = '<section><h2>报告正文</h2><pre class="fallback-pre">' + esc(MD) + '</pre></section>';
  }

  var chartById = {};
  (Array.isArray(CHARTS) ? CHARTS : []).forEach(function (c) {
    if (c && c.id) chartById[c.id] = c;
  });
  function buildTable(tb) {
    var h = '<table><thead><tr>';
    tb.columns.forEach(function (c) { h += '<th>' + esc(c) + '</th>'; });
    h += '</tr></thead><tbody>';
    tb.rows.forEach(function (r) {
      h += '<tr>';
      r.forEach(function (v) { h += '<td>' + esc(v) + '</td>'; });
      h += '</tr>';
    });
    return h + '</tbody></table>';
  }
  html = html.replace(/(<p>)?<!--CHART:([a-zA-Z0-9-]+)-->(<\/p>)?/g, function (m, p1, id, p2) {
    var c = chartById[id];
    if (!c) return m;
    delete chartById[id];
    var toggle = '';
    if (c.table && c.table.columns && c.table.rows) {
      toggle = '<div class="chart-toggle"><button type="button" data-view="chart" class="active">图</button>' +
        '<button type="button" data-view="table">表</button></div>' +
        '<div class="chart-table">' + buildTable(c.table) + '</div>';
    }
    return '<div class="chart-block" id="block-' + id + '"><div class="chart-title">' + esc(c.title || '') +
      '</div>' + toggle + '<div class="chart-canvas" id="chart-' + id + '"></div><div class="chart-note">图表库加载失败，图表未渲染</div></div>';
  });
  bodyEl.innerHTML = html;

  /* [N] 引用标记上标化：纯视觉增强，不改变文本内容 */
  (function () {
    var walker = document.createTreeWalker(bodyEl, NodeFilter.SHOW_TEXT, null);
    var hits = [];
    while (walker.nextNode()) {
      if (/\[\d+\]/.test(walker.currentNode.nodeValue)) hits.push(walker.currentNode);
    }
    hits.forEach(function (n) {
      var parts = String(n.nodeValue).split(/(\[\d+\])/);
      if (parts.length < 2) return;
      var frag = document.createDocumentFragment();
      parts.forEach(function (p) {
        if (!p) return;
        if (/^\[\d+\]$/.test(p)) {
          var sup = document.createElement('sup');
          sup.className = 'cite';
          sup.textContent = p;
          frag.appendChild(sup);
        } else {
          frag.appendChild(document.createTextNode(p));
        }
      });
      if (n.parentNode) n.parentNode.replaceChild(frag, n);
    });
  })();

  /* 目录：从 h2/h3 生成 */
  var slugSeed = 0;
  var tocHtml = '';
  Array.prototype.forEach.call(bodyEl.querySelectorAll('h2, h3'), function (h) {
    var text = (h.textContent || '').trim();
    if (!text) return;
    var id = 'sec-' + (++slugSeed);
    h.id = id;
    tocHtml += '<a href="#' + id + '" class="' + (h.tagName === 'H3' ? 'lvl-3' : '') + '">' + esc(text) + '</a>';
  });
  document.getElementById('toc-list').innerHTML = tocHtml || '<a>（无章节）</a>';

  Array.prototype.forEach.call(document.querySelectorAll('.chart-toggle button'), function (btn) {
    btn.addEventListener('click', function () {
      var block = btn.closest('.chart-block');
      if (!block) return;
      var view = btn.getAttribute('data-view');
      block.className = view === 'table' ? 'chart-block view-table' : 'chart-block';
      Array.prototype.forEach.call(block.querySelectorAll('.chart-toggle button'), function (b) {
        b.className = b === btn ? 'active' : '';
      });
    });
  });

  document.getElementById('footer-meta').textContent =
    '生成于 ' + (META.generated_at || '') + ' · ' + (META.footer_text || '');

  if (window.echarts) {
    var instances = [];
    (Array.isArray(CHARTS) ? CHARTS : []).forEach(function (c) {
      var el = document.getElementById('chart-' + (c && c.id));
      if (!el || !c || !c.option || typeof c.option !== 'object') return;
      try {
        var inst = window.echarts.init(el, null, { renderer: 'svg' });
        inst.setOption(c.option);
        instances.push(inst);
      } catch (e) {
        var block = document.getElementById('block-' + c.id);
        if (block) block.className = 'chart-block chart-missing';
      }
    });
    var resizeAll = function () { instances.forEach(function (c) { c.resize(); }); };
    var timer = null;
    window.addEventListener('resize', function () {
      clearTimeout(timer); timer = setTimeout(resizeAll, 120);
    });
    window.addEventListener('beforeprint', resizeAll);
    if (document.readyState === 'complete') resizeAll();
    else window.addEventListener('load', resizeAll);
  } else {
    Array.prototype.forEach.call(document.querySelectorAll('.chart-block'), function (b) {
      b.className = 'chart-block chart-missing';
    });
  }
})();
</script>
</body>
</html>
