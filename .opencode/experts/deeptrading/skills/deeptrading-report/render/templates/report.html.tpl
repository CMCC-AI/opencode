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
    --bg: #fafafa; --surface: #ffffff; --text: #1a1a1a; --text-soft: #555;
    --border: #e5e7eb; --accent: #0d9488; --muted: #7b848c;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 0; background: var(--bg); color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC",
                 "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif;
    font-size: 16px; line-height: 1.75;
    word-break: break-all; line-break: anywhere; overflow-wrap: anywhere;
  }
  .main { max-width: 980px; margin: 0 auto; padding: 40px 28px 80px; }
  /* hero（品牌渐变，对齐主链模板） */
  .hero { margin-bottom: 36px; padding: 36px 40px; border-radius: 16px;
    background: linear-gradient(135deg, #134e4a 0%, #0d9488 55%, #2dd4bf 100%);
    color: #fff; position: relative; overflow: hidden; box-shadow: 0 18px 40px rgba(13,148,136,0.22); }
  .hero::after { content: ''; position: absolute; top: -50%; right: -10%; width: 380px; height: 380px;
    background: radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 70%); border-radius: 50%; }
  .hero .kicker { font-size: 12px; letter-spacing: 0.22em; text-transform: uppercase;
    color: rgba(255,255,255,0.85); margin-bottom: 10px; position: relative; z-index: 1; }
  .hero h1 { font-size: 34px; line-height: 1.25; margin: 0 0 10px 0; font-weight: 800;
    letter-spacing: -0.02em; position: relative; z-index: 1; }
  .hero .subtitle { font-size: 17px; color: rgba(255,255,255,0.95); margin: 0; position: relative; z-index: 1; }
  .hero .hero-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 10px; margin-top: 24px; position: relative; z-index: 1; }
  .hero .hero-stat { background: linear-gradient(135deg, rgba(240,253,250,0.97), rgba(240,249,255,0.93));
    border: 1px solid rgba(204,251,241,0.92); border-radius: 10px; padding: 12px 16px;
    display: flex; flex-direction: column; gap: 3px; }
  .hero .hero-stat .hs-label { font-size: 11px; color: #334155; font-weight: 600; letter-spacing: 0.03em; }
  .hero .hero-stat .hs-value { font-size: 24px; font-weight: 800; color: #0f766e; margin-top: 2px; line-height: 1.1; }
  /* 核心观点卡 */
  .thesis { background: #fff; border: 1px solid #e2e8f0; border-left: 5px solid var(--accent);
    border-radius: 12px; padding: 20px 26px; margin-bottom: 36px; box-shadow: 0 2px 10px rgba(15,23,42,0.04);
    font-size: 16.5px; }
  .thesis .thesis-tag { font-size: 11px; letter-spacing: 0.18em; color: var(--accent); font-weight: 700; margin-bottom: 6px; }
  .thesis p { margin: 0; }
  .thesis strong { color: #0f172a; }
  /* 章节 */
  section { margin-bottom: 26px; scroll-margin-top: 16px; background: #fff; border: 1px solid #eef2f7;
    border-radius: 14px; padding: 26px 32px; box-shadow: 0 2px 10px rgba(15,23,42,0.04); }
  section > h2 { font-size: 23px; margin: 0 0 18px 0; padding-bottom: 10px;
    border-bottom: 1px solid var(--border); font-weight: 700; color: #134e4a; }
  #report-body h3 { font-size: 19px; margin: 26px 0 10px; color: #1f2937; font-weight: 600; }
  #report-body p { margin: 10px 0; }
  #report-body em { color: var(--muted); font-size: 13.5px; }
  #report-body blockquote { margin: 12px 0; padding: 8px 18px; border-left: 3px solid var(--accent);
    background: #f0fdfa; color: #134e4a; border-radius: 0 8px 8px 0; }
  #report-body table { border-collapse: collapse; width: 100%; margin: 14px 0; font-size: 14.5px; }
  #report-body th, #report-body td { border: 1px solid #e2e8f0; padding: 8px 12px; text-align: left; }
  #report-body th { background: #f8fafc; font-weight: 600; }
  #report-body ul, #report-body ol { padding-left: 26px; }
  #report-body li { margin: 6px 0; }
  #report-body a { color: #0d9488; text-decoration: none; border-bottom: 1px dashed #99f6e4; }
  #report-body a:hover { border-bottom-style: solid; }
  #report-body hr { border: none; border-top: 1px solid var(--border); margin: 22px 0; }
  /* 图表块 */
  .chart-block { background: #fff; border: 1px solid #eef2f7; border-radius: 14px;
    padding: 18px 22px 10px; margin: 18px 0; box-shadow: 0 2px 10px rgba(15,23,42,0.04); }
  .chart-block .chart-title { font-size: 15.5px; font-weight: 700; color: #134e4a; margin-bottom: 10px; }
  .chart-block .chart-canvas { width: 100%; height: 380px; }
  .chart-block .chart-toggle { display: flex; justify-content: flex-end; gap: 6px; margin: 2px 0 6px; }
  .chart-block .chart-toggle button { border: none; background: #f0fdfa; color: #0f766e; font-size: 12px;
    font-weight: 600; padding: 3px 12px; border-radius: 12px; cursor: pointer; line-height: 1.6; }
  .chart-block .chart-toggle button:hover { background: #ccfbf1; }
  .chart-block .chart-toggle button.active { background: #0d9488; color: #fff; }
  .chart-block .chart-table { display: none; }
  .chart-block .chart-table table { border-collapse: collapse; width: 100%; margin: 4px 0 8px; font-size: 13px; }
  .chart-block .chart-table th, .chart-block .chart-table td { border: 1px solid #e2e8f0; padding: 6px 10px; text-align: right; }
  .chart-block .chart-table th:first-child, .chart-block .chart-table td:first-child { text-align: left; }
  .chart-block .chart-table th { background: #f8fafc; font-weight: 600; }
  .chart-block.view-table .chart-canvas { display: none; }
  .chart-block.view-table .chart-table { display: block; }
  .chart-block .chart-note { display: none; }
  .chart-block.chart-missing .chart-canvas { display: none; }
  .chart-block.chart-missing .chart-note { display: block; color: var(--muted);
    font-size: 13px; padding: 22px 0 14px; text-align: center; }
  /* 免责与页脚 */
  .disclaimer { background: #fffbeb; border: 1px solid #fde68a; border-radius: 12px;
    padding: 16px 22px; margin-top: 30px; color: #92400e; font-size: 13.5px; }
  .footer { margin-top: 22px; text-align: center; color: var(--muted); font-size: 12.5px; }
  .fallback-pre { white-space: pre-wrap; font-family: inherit; }
  @media print {
    body { background: #fff; }
    .main { padding: 0; max-width: none; }
    .hero { box-shadow: none; border-radius: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    section, .chart-block { box-shadow: none; break-inside: avoid; }
    .chart-block .chart-canvas { height: 340px; }
    svg { max-width: 100% !important; height: auto; }
    table { break-inside: avoid; }
  }
</style>
</head>
<body>
<div class="main">
  <header class="hero" id="hero">
    <div class="kicker">__BRAND_KICKER__</div>
    <h1 id="hero-title"></h1>
    <p class="subtitle" id="hero-subtitle"></p>
    <div class="hero-stats" id="hero-stats"></div>
  </header>
  <div class="thesis" id="thesis" hidden>
    <div class="thesis-tag">核 心 观 点</div>
    <div id="thesis-body"></div>
  </div>
  <div id="report-body"></div>
  <div class="disclaimer">
    __DISCLAIMER_HTML__
  </div>
  <div class="footer" id="footer-meta"></div>
</div>
<script>
(function () {
  'use strict';
  var META = __QUICK_META_JSON__;
  var CHARTS = __QUICK_CHARTS_JSON__;
  var MD = __QUICK_MD__;
  var RED = '#b3352c', GREEN = '#1f7a4d', BLUE = '#2f5d7c';
  var FONT = "'Microsoft YaHei','PingFang SC',sans-serif";

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* hero 填充 */
  document.getElementById('hero-title').textContent = META.title || 'A 股快速研究报告';
  document.getElementById('hero-subtitle').textContent = META.subtitle || '';
  var statsWrap = document.getElementById('hero-stats');
  var stats = Array.isArray(META.hero_stats) ? META.hero_stats.slice(0, 5) : [];
  if (stats.length) {
    statsWrap.innerHTML = stats.map(function (s) {
      return '<div class="hero-stat"><div class="hs-label">' + esc(s.label) +
        '</div><div class="hs-value">' + esc(s.value) + '</div></div>';
    }).join('');
  } else { statsWrap.style.display = 'none'; }

  /* markdown 渲染 */
  var bodyEl = document.getElementById('report-body');
  var html = '';
  if (window.marked && typeof window.marked.parse === 'function') {
    html = window.marked.parse(MD);
  } else {
    html = '<section><h2>报告正文</h2><pre class="fallback-pre">' + esc(MD) + '</pre></section>';
  }

  /* 图表占位替换：<!--CHART:id-->（兼容 marked 输出的 <p> 包裹）；带 table 的图渲染为图/表可切换块 */
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
    delete chartById[id]; /* 已消费 */
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

  /* 图/表切换 */
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

  /* 核心观点块：md 首个 blockquote 上提为 thesis 卡 */
  var bq = bodyEl.querySelector('blockquote');
  var thesisEl = document.getElementById('thesis');
  if (bq) {
    document.getElementById('thesis-body').innerHTML = bq.innerHTML;
    thesisEl.hidden = false;
    bq.parentNode.removeChild(bq);
  }

  /* 页脚元信息 */
  document.getElementById('footer-meta').textContent =
    '生成于 ' + (META.generated_at || '') + ' · ' + (META.footer_text || '');

  /* 图表渲染（SVG renderer，对齐主链纪律） */
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
