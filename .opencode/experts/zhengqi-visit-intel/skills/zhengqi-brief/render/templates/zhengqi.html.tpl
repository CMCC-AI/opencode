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
    --bg: #f5f7fa; --surface: #ffffff; --text: #1c2733; --text-soft: #4a5a6a;
    --border: #dfe6ee; --accent: #0086d4; --accent-dark: #005a9e; --muted: #718093;
    --info-bg: #eaf4fc; --info-border: #35a3e8; --info-text: #0b5c96;
    --positive-bg: #ecfdf5; --positive-border: #10b981; --positive-text: #065f46;
    --warning-bg: #fffbeb; --warning-border: #f59e0b; --warning-text: #92400e;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0f1a26; --surface: #1a2836; --text: #e2e8f0; --text-soft: #94a3b8;
      --border: #2c3e52; --accent: #38a3e8; --accent-dark: #7cc4f2; --muted: #8fa3b8;
      --info-bg: #12314a; --info-border: #35a3e8; --info-text: #bfdbfe;
      --positive-bg: #123527; --positive-border: #10b981; --positive-text: #a7f3d0;
      --warning-bg: #3a2a0c; --warning-border: #f59e0b; --warning-text: #fde68a;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 0; background: var(--bg); color: var(--text);
    font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif;
    font-size: 16px; line-height: 1.85;
    word-break: break-all; line-break: anywhere; overflow-wrap: anywhere;
  }
  .layout { display: grid; grid-template-columns: 232px 1fr; max-width: 1240px; margin: 0 auto; }
  .toc {
    position: sticky; top: 0; align-self: start; height: 100vh; overflow-y: auto;
    padding: 26px 14px; border-right: 1px solid var(--border);
    font-size: 13px; color: var(--text-soft); background: var(--bg);
  }
  .toc h4 { margin: 0 0 12px 0; font-size: 11px; letter-spacing: 0.14em; color: var(--muted); font-weight: 700; }
  .toc a { display: block; padding: 4px 9px; color: var(--text-soft); text-decoration: none;
    border-radius: 4px; border-left: 2px solid transparent; margin-bottom: 2px; }
  .toc a:hover { background: var(--surface); color: var(--text); border-left-color: var(--accent); }
  .toc a.lvl-3 { padding-left: 22px; font-size: 12px; }
  .main { padding: 40px 44px 90px; min-width: 0; }
  /* 标题头：移动蓝渐变 + 光晕，无数据卡 */
  .hero { margin-bottom: 34px; padding: 36px 42px; border-radius: 14px;
    background: linear-gradient(135deg, var(--accent-dark) 0%, var(--accent) 100%);
    color: #fff; position: relative; overflow: hidden;
    box-shadow: 0 14px 34px rgba(0, 90, 158, 0.25); }
  .hero::after { content: ''; position: absolute; top: -50%; right: -8%; width: 380px; height: 380px;
    background: radial-gradient(circle, rgba(255,255,255,0.14) 0%, transparent 70%); border-radius: 50%; }
  .hero .kicker { font-size: 12px; letter-spacing: 0.26em; color: rgba(255,255,255,0.88);
    font-weight: 600; margin-bottom: 12px; position: relative; z-index: 1; }
  .hero h1 { font-size: 32px; line-height: 1.3; margin: 0 0 10px 0; font-weight: 800;
    letter-spacing: -0.01em; position: relative; z-index: 1; }
  .hero .subtitle { font-size: 16px; color: rgba(255,255,255,0.92); margin: 0; position: relative; z-index: 1; }
  .hero .meta { margin-top: 14px; font-size: 13px; color: rgba(255,255,255,0.75); position: relative; z-index: 1; }
  /* 章节 */
  section { margin-bottom: 26px; background: var(--surface); border: 1px solid var(--border);
    border-radius: 12px; padding: 26px 32px; box-shadow: 0 1px 4px rgba(16,38,61,0.05);
    scroll-margin-top: 16px; transition: box-shadow 0.2s; }
  section:hover { box-shadow: 0 4px 14px rgba(16,38,61,0.09); }
  section > h2 { font-size: 22px; margin: 0 0 16px 0; padding: 0 0 9px 12px;
    border-left: 4px solid var(--accent); border-bottom: 1px solid var(--border);
    color: var(--accent-dark); font-weight: 700; }
  #report-body h3 { font-size: 17.5px; margin: 24px 0 10px; color: var(--text); font-weight: 600; }
  #report-body p { margin: 10px 0; }
  #report-body em { color: var(--muted); font-size: 13.5px; }
  #report-body blockquote { margin: 14px 0; padding: 12px 20px; border-left: 4px solid var(--info-border);
    background: var(--info-bg); color: var(--info-text); border-radius: 0 8px 8px 0; }
  #report-body table { border-collapse: separate; border-spacing: 0; width: 100%; margin: 16px 0;
    font-size: 14px; background: var(--surface); border: 1px solid var(--border);
    border-radius: 8px; overflow: hidden; }
  #report-body th, #report-body td { padding: 9px 13px; text-align: left; border-bottom: 1px solid var(--border); }
  #report-body th { background: var(--info-bg); font-weight: 600; color: var(--accent-dark); border-bottom: 2px solid var(--accent); }
  #report-body tr:last-child td { border-bottom: none; }
  #report-body tr:hover td { background: var(--info-bg); }
  #report-body ul, #report-body ol { padding-left: 26px; }
  #report-body li { margin: 6px 0; }
  #report-body a { color: var(--accent); text-decoration: none; border-bottom: 1px dashed #a9cde5; }
  #report-body hr { border: none; border-top: 1px dashed var(--border); margin: 24px 0; }
  /* 图表块 */
  .chart-block { background: var(--surface); border: 1px solid var(--border); border-radius: 12px;
    padding: 18px 22px 10px; margin: 20px 0; box-shadow: 0 1px 4px rgba(16,38,61,0.05);
    transition: box-shadow 0.2s, transform 0.2s; }
  .chart-block:hover { box-shadow: 0 5px 16px rgba(16,38,61,0.1); transform: translateY(-1px); }
  .chart-block .chart-title { font-size: 15px; font-weight: 700; color: var(--accent-dark); margin-bottom: 10px;
    padding-left: 10px; border-left: 3px solid var(--accent); }
  .chart-block .chart-canvas { width: 100%; height: 380px; }
  .chart-block .chart-toggle { display: flex; justify-content: flex-end; gap: 6px; margin: 2px 0 6px; }
  .chart-block .chart-toggle button { border: 1px solid var(--info-border); background: var(--info-bg); color: var(--info-text);
    font-size: 12px; font-weight: 600; padding: 3px 12px; border-radius: 12px; cursor: pointer; line-height: 1.6; }
  .chart-block .chart-toggle button:hover { filter: brightness(0.96); }
  .chart-block .chart-toggle button.active { background: var(--accent); color: #fff; border-color: var(--accent); }
  .chart-block .chart-table { display: none; }
  .chart-block .chart-table table { border-collapse: collapse; width: 100%; margin: 4px 0 8px; font-size: 13px; }
  .chart-block .chart-table th, .chart-block .chart-table td { border: 1px solid var(--border); padding: 6px 10px; text-align: right; }
  .chart-block .chart-table th:first-child, .chart-block .chart-table td:first-child { text-align: left; }
  .chart-block .chart-table th { background: var(--info-bg); font-weight: 600; }
  .chart-block.view-table .chart-canvas { display: none; }
  .chart-block.view-table .chart-table { display: block; }
  .chart-block .chart-note { display: none; }
  .chart-block.chart-missing .chart-canvas { display: none; }
  .chart-block.chart-missing .chart-note { display: block; color: var(--muted);
    font-size: 13px; padding: 22px 0 14px; text-align: center; }
  /* 声明与页脚 */
  .disclaimer { background: var(--warning-bg); border: 1px solid var(--warning-border); border-radius: 10px;
    padding: 15px 22px; margin-top: 30px; color: var(--warning-text); font-size: 13px; }
  .footer { margin-top: 22px; text-align: center; color: var(--muted); font-size: 12.5px; }
  .fallback-pre { white-space: pre-wrap; font-family: inherit; }
  @media (max-width: 960px) {
    .layout { grid-template-columns: 1fr; }
    .toc { display: none; }
  }
  @media print {
    body { background: #fff; }
    .layout { display: block; max-width: none; }
    .toc { display: none; }
    .main { padding: 0; max-width: none; }
    .hero { box-shadow: none; border-radius: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    section, .chart-block { box-shadow: none; break-inside: avoid; }
    .chart-block:hover, section:hover { transform: none; }
    .chart-block .chart-canvas { height: 340px; }
    svg { max-width: 100% !important; height: auto; }
    table { break-inside: avoid; }
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

  document.getElementById('doc-title').textContent = META.title || '政企客户谈参报告';
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
