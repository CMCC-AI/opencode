<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>__TITLE__</title>
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"></script>
<style>
  :root {
    --bg: #faf8ff;
    --surface: #ffffff;
    --text: #1a1a2e;
    --text-soft: #555;
    --border: #e5e0f0;
    --accent: #7c3aed;
    --accent-dark: #5b21b6;
    --neutral: #64748b;
    --info-bg: #eff6ff; --info-border: #3b82f6; --info-text: #1e40af;
    --positive-bg: #ecfdf5; --positive-border: #10b981; --positive-text: #065f46;
    --warning-bg: #fffbeb; --warning-border: #f59e0b; --warning-text: #92400e;
    --negative-bg: #fef2f2; --negative-border: #ef4444; --negative-text: #991b1b;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0f0f1e; --surface: #1e1e32; --text: #e2e2f0; --text-soft: #9494b8;
      --border: #2d2d4a; --accent: #a78bfa; --accent-dark: #7c3aed;
      --neutral: #94a3b8;
      --info-bg: #1e2a5f; --info-border: #3b82f6; --info-text: #bfdbfe;
      --positive-bg: #14532d; --positive-border: #10b981; --positive-text: #a7f3d0;
      --warning-bg: #78350f; --warning-border: #f59e0b; --warning-text: #fde68a;
      --negative-bg: #7f1d1d; --negative-border: #ef4444; --negative-text: #fecaca;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 0;
    background: var(--bg); color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC",
                 "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif;
    font-size: 16px; line-height: 1.75;
  }
  .layout { display: grid; grid-template-columns: 240px 1fr; max-width: 1320px; margin: 0 auto; gap: 0; }
  .toc {
    position: sticky; top: 0; align-self: start;
    height: 100vh; overflow-y: auto;
    padding: 24px 16px; border-right: 1px solid var(--border);
    font-size: 13px; color: var(--text-soft);
  }
  .toc h4 { margin: 0 0 12px 0; font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-soft); }
  .toc a { display: block; padding: 4px 8px; color: var(--text-soft); text-decoration: none; border-radius: 4px; border-left: 2px solid transparent; margin-bottom: 2px; }
  .toc a:hover { background: var(--surface); color: var(--text); }
  .toc a.lvl-3 { padding-left: 20px; font-size: 12px; }
  .main { padding: 48px 56px 120px; min-width: 0; }
  .hero { margin-bottom: 40px; padding: 40px 44px; border-radius: 12px; background: linear-gradient(135deg, var(--accent) 0%, var(--accent-dark) 100%); color: #fff; position: relative; overflow: hidden; }
  .hero::after { content: ''; position: absolute; top: -50%; right: -10%; width: 400px; height: 400px; background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%); border-radius: 50%; }
  .hero h1 { font-size: 38px; line-height: 1.2; margin: 0 0 10px 0; font-weight: 800; letter-spacing: -0.02em; position: relative; z-index: 1; }
  .hero .subtitle { font-size: 18px; color: rgba(255,255,255,0.85); margin: 0; position: relative; z-index: 1; }
  .hero .meta { margin-top: 16px; font-size: 13px; color: rgba(255,255,255,0.7); position: relative; z-index: 1; }
  .hero .hero-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-top: 24px; position: relative; z-index: 1; }
  .hero .hero-stat { background: rgba(255,255,255,0.15); backdrop-filter: blur(4px); border-radius: 8px; padding: 12px 14px; }
  .hero .hero-stat .hs-label { font-size: 11px; color: rgba(255,255,255,0.75); text-transform: uppercase; letter-spacing: 0.05em; }
  .hero .hero-stat .hs-value { font-size: 22px; font-weight: 800; color: #fff; margin-top: 2px; line-height: 1.1; }
  section { margin-bottom: 48px; scroll-margin-top: 24px; }
  section > h2 { font-size: 26px; margin: 0 0 20px 0; padding-bottom: 8px; border-bottom: 1px solid var(--border); font-weight: 600; }
  section > h3 { font-size: 20px; margin: 32px 0 12px 0; color: var(--text); font-weight: 600; }
  .block { margin: 16px 0; }
  .block-markdown p { margin: 12px 0; }
  .block-markdown h4 { font-size: 16px; margin: 20px 0 8px; font-weight: 600; }
  .block-markdown ul, .block-markdown ol { margin: 12px 0; padding-left: 24px; }
  .block-markdown li { margin: 4px 0; }
  .block-markdown code { background: var(--surface); padding: 2px 6px; border-radius: 3px; font-family: ui-monospace, "SF Mono", Consolas, monospace; font-size: 0.9em; border: 1px solid var(--border); }
  .block-markdown a { color: var(--accent); text-decoration: none; }
  .block-markdown a:hover { text-decoration: underline; }
  .block-markdown table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
  .block-markdown th, .block-markdown td { padding: 10px 14px; text-align: left; border-bottom: 1px solid var(--border); }
  .block-markdown th { background: var(--surface); font-weight: 600; color: var(--text); border-bottom: 2px solid var(--accent); }
  .block-markdown td { color: var(--text); }
  .block-markdown tr:last-child td { border-bottom: none; }
  .block-markdown tr:hover td { background: var(--info-bg); }
  .block-markdown blockquote { margin: 16px 0; padding: 12px 20px; border-left: 4px solid var(--accent); background: var(--surface); border-radius: 0 6px 6px 0; color: var(--text-soft); font-style: italic; }
  .block-markdown img { max-width: 100%; border-radius: 8px; margin: 12px 0; }
  .block-markdown h1 { font-size: 22px; margin: 24px 0 12px; font-weight: 600; }
  .block-markdown h2 { font-size: 20px; margin: 24px 0 12px; font-weight: 600; }
  .block-markdown h3 { font-size: 17px; margin: 20px 0 8px; font-weight: 600; color: var(--text); }
  sup a.ref { color: var(--accent); text-decoration: none; font-weight: 600; font-size: 0.75em; padding: 0 2px; }
  .block-table { overflow-x: auto; }
  .block-table table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 14px; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
  .block-table th, .block-table td { padding: 10px 14px; text-align: left; border-bottom: 1px solid var(--border); }
  .block-table th { background: var(--surface); font-weight: 600; color: var(--text); }
  .block-table tr:last-child td { border-bottom: none; }
  .block-stat_grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
  .stat-card { background: var(--surface); border: 1px solid var(--border); border-left: 4px solid var(--neutral); padding: 18px 20px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); transition: box-shadow 0.2s, transform 0.2s; }
  .stat-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.08); transform: translateY(-1px); }
  .stat-card.tone-info { border-left-color: var(--info-border); }
  .stat-card.tone-positive { border-left-color: var(--positive-border); }
  .stat-card.tone-warning { border-left-color: var(--warning-border); }
  .stat-card.tone-negative { border-left-color: var(--negative-border); }
  .stat-card .label { font-size: 12px; color: var(--text-soft); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.03em; }
  .stat-card .value { font-size: 26px; font-weight: 800; color: var(--text); line-height: 1.15; }
  .stat-card .caption { font-size: 12px; color: var(--text-soft); margin-top: 8px; line-height: 1.5; }
  .stat-grid-title { font-size: 14px; font-weight: 600; color: var(--text-soft); margin: 12px 0 8px; text-transform: uppercase; letter-spacing: 0.05em; }
  .block-callout { background: var(--info-bg); border-left: 4px solid var(--info-border); padding: 16px 20px; border-radius: 6px; margin: 20px 0; }
  .block-callout.tone-positive { background: var(--positive-bg); border-left-color: var(--positive-border); }
  .block-callout.tone-warning { background: var(--warning-bg); border-left-color: var(--warning-border); }
  .block-callout.tone-negative { background: var(--negative-bg); border-left-color: var(--negative-border); }
  .block-callout .callout-title { font-weight: 700; margin-bottom: 6px; color: var(--text); }
  .block-callout .callout-content { color: var(--text); }
  .block-callout.tone-info .callout-title { color: var(--info-text); }
  .block-callout.tone-positive .callout-title { color: var(--positive-text); }
  .block-callout.tone-warning .callout-title { color: var(--warning-text); }
  .block-callout.tone-negative .callout-title { color: var(--negative-text); }
  .block-quote_card { border-left: 4px solid var(--accent); padding: 16px 24px; margin: 24px 0; background: var(--surface); border-radius: 0 6px 6px 0; }
  .block-quote_card .quote-content { font-size: 16px; font-style: italic; color: var(--text); line-height: 1.7; }
  .block-quote_card .quote-source { margin-top: 10px; font-size: 13px; color: var(--text-soft); font-weight: 500; }
  .block-timeline { position: relative; padding-left: 24px; margin: 24px 0; }
  .block-timeline::before { content: ''; position: absolute; left: 6px; top: 4px; bottom: 4px; width: 2px; background: var(--border); }
  .timeline-item { position: relative; padding: 8px 0 16px 16px; }
  .timeline-item::before { content: ''; position: absolute; left: -22px; top: 14px; width: 10px; height: 10px; border-radius: 50%; background: var(--accent); border: 2px solid var(--bg); }
  .timeline-item .tl-label { font-weight: 700; color: var(--accent); font-size: 14px; }
  .timeline-item .tl-content { margin-top: 4px; color: var(--text); }
  .block-chip_list { margin: 16px 0; }
  .chip-list-title { font-size: 13px; font-weight: 600; color: var(--text-soft); margin-bottom: 8px; }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; }
  .chip { background: var(--surface); border: 1px solid var(--border); padding: 4px 12px; border-radius: 16px; font-size: 13px; color: var(--text-soft); }
  .block-progress_bar { margin: 20px 0; }
  .progress-list { display: flex; flex-direction: column; gap: 14px; }
  .progress-item .progress-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
  .progress-item .progress-label { font-size: 14px; color: var(--text); font-weight: 500; }
  .progress-item .progress-value { font-size: 14px; font-weight: 700; }
  .progress-item .progress-value.tone-positive { color: var(--positive-border); }
  .progress-item .progress-value.tone-negative { color: var(--negative-border); }
  .progress-item .progress-value.tone-warning { color: var(--warning-border); }
  .progress-item .progress-value.tone-info { color: var(--info-border); }
  .progress-item .progress-track { height: 10px; border-radius: 999px; background: var(--border); overflow: hidden; }
  .progress-item .progress-fill { height: 100%; border-radius: 999px; background: var(--accent); transition: width 0.5s ease; }
  .progress-item .progress-fill.tone-positive { background: linear-gradient(90deg, #10b981, #34d399); }
  .progress-item .progress-fill.tone-negative { background: linear-gradient(90deg, #ef4444, #f87171); }
  .progress-item .progress-fill.tone-warning { background: linear-gradient(90deg, #f59e0b, #fbbf24); }
  .progress-item .progress-fill.tone-info { background: linear-gradient(90deg, #3b82f6, #60a5fa); }
  .block-mini_kpi_row { margin: 16px 0; }
  .mini-kpi-row { display: flex; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; background: var(--surface); }
  .mini-kpi-item { flex: 1; padding: 14px 12px; text-align: center; border-right: 1px solid var(--border); }
  .mini-kpi-item:last-child { border-right: none; }
  .mini-kpi-label { font-size: 12px; color: var(--text-soft); font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em; }
  .mini-kpi-value { font-size: 22px; font-weight: 800; margin-top: 4px; }
  .mini-kpi-value.tone-positive { color: var(--positive-border); }
  .mini-kpi-value.tone-negative { color: var(--negative-border); }
  .mini-kpi-value.tone-warning { color: var(--warning-border); }
  .mini-kpi-value.tone-info { color: var(--info-border); }
  .mini-kpi-trend { font-size: 11px; color: var(--text-soft); margin-top: 2px; }
  .block-divider { border: none; border-top: 1px dashed var(--border); margin: 32px 0; position: relative; }
  .block-divider.has-label { margin-top: 48px; }
  .divider-label { position: absolute; top: -10px; left: 50%; transform: translateX(-50%); background: var(--bg); padding: 0 12px; color: var(--text-soft); font-size: 12px; }
  .block-chart { margin: 28px 0; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 16px 20px 8px; }
  .chart-title { font-size: 15px; font-weight: 600; color: var(--text); margin-bottom: 4px; }
  .chart-description { font-size: 13px; color: var(--text-soft); margin-bottom: 12px; line-height: 1.5; }
  .chart-canvas { width: 100%; height: 340px; }
  .chart-canvas.tall { height: 420px; }
  .references { margin-top: 64px; padding-top: 32px; border-top: 2px solid var(--accent); }
  .references h2 { font-size: 22px; margin: 0 0 20px 0; }
  .references ol { padding-left: 24px; color: var(--text); font-size: 14px; }
  .references li { margin: 6px 0; word-break: break-all; }
  .references a { color: var(--accent); }
  .fallback { background: var(--warning-bg); color: var(--warning-text); padding: 12px 16px; border-radius: 6px; margin: 16px 0; font-size: 14px; }
  @media (max-width: 900px) {
    .layout { grid-template-columns: 1fr; }
    .toc { display: none; }
    .main { padding: 24px 16px 80px; }
    .hero h1 { font-size: 26px; }
    .mini-kpi-row { flex-direction: column; }
    .mini-kpi-item { border-right: none; border-bottom: 1px solid var(--border); }
  }
</style>
</head>
<body>
<div class="layout">
  <nav class="toc" id="toc"><h4>目录</h4><div id="toc-list"></div></nav>
  <main class="main">
    <header class="hero">
      <h1 id="report-title">__TITLE__</h1>
      <p class="subtitle" id="report-subtitle"></p>
      <p class="meta" id="report-meta"></p>
      <div class="hero-stats" id="hero-stats"></div>
    </header>
    <div id="report-body"></div>
    <section class="references" id="references" style="display:none">
      <h2>参考文献</h2>
      <ol id="ref-list"></ol>
    </section>
  </main>
</div>
<script id="visual-report-data" type="application/json">__VISUAL_REPORT_JSON__</script>
<script id="references-data" type="application/json">__REFERENCES_JSON__</script>
<script>
(function(){
  var TONES = ['neutral','info','positive','warning','negative'];
  function safeTone(t){ return TONES.indexOf(t) >= 0 ? t : 'neutral'; }
  function escapeHtml(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function annotateRefs(html){
    return html.replace(/\[(\d+)\]/g, function(m, n){
      return '<sup><a class="ref" href="#ref-'+n+'" title="参考文献 '+n+'">['+n+']</a></sup>';
    }).replace(/<cite>([^<]+)<\/cite>/g, function(m, url){
      return '<sup><a class="ref" href="'+escapeHtml(url)+'" target="_blank" rel="noopener">[src]</a></sup>';
    });
  }
  function annotateAgentTags(html){
    return html.replace(/〔([^〕]+)〕/g, function(m, name){
      return '<span class="chip" style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:12px;background:var(--surface);border:1px solid var(--accent);color:var(--accent);vertical-align:middle;">'+escapeHtml(name)+'</span>';
    });
  }
  function renderMarkdown(content){
    if (typeof marked === 'undefined') {
      return '<p>' + escapeHtml(content).replace(/\n\n/g, '</p><p>') + '</p>';
    }
    try {
      marked.setOptions({ breaks: false, gfm: true });
      var html = marked.parse(content);
      return annotateAgentTags(annotateRefs(html));
    } catch(e) {
      return '<p>' + escapeHtml(content) + '</p>';
    }
  }
  var CHART_INSTANCES = [];
  function reviveFunctions(obj){
    if (obj == null) return obj;
    if (typeof obj === 'string'){
      var s = obj.trim();
      if (s.indexOf('function') === 0){
        try { return eval('(' + s + ')'); } catch(e){ return obj; }
      }
      return obj;
    }
    if (Array.isArray(obj)){ return obj.map(reviveFunctions); }
    if (typeof obj === 'object'){
      var r = {};
      for (var k in obj){ r[k] = reviveFunctions(obj[k]); }
      return r;
    }
    return obj;
  }
  function renderChartAsync(containerId, chartBlock){
    if (typeof echarts === 'undefined') {
      var el = document.getElementById(containerId);
      if (el) el.innerHTML = '<div class="fallback">ECharts CDN 加载失败，无法渲染图表「'+escapeHtml(chartBlock.title||'')+'」</div>';
      return;
    }
    var el = document.getElementById(containerId);
    if (!el) return;
    try {
      var chart = echarts.init(el);
      var option = reviveFunctions(chartBlock.option || {});
      if (!option.color && !option.series) option.color = ['#7c3aed','#3b82f6','#10b981','#f59e0b','#ef4444','#06b6d4','#94a3b8'];
      chart.setOption(option);
      CHART_INSTANCES.push(chart);
    } catch(e) {
      el.innerHTML = '<div class="fallback">图表渲染失败：'+escapeHtml(e.message)+'</div>';
    }
  }
  function renderBlock(block){
    if (!block || !block.type) return '';
    var t = block.type;
    if (t === 'markdown') {
      var c = String(block.content || '').trim();
      if (!c) return '';
      return '<div class="block block-markdown">' + renderMarkdown(c) + '</div>';
    }
    if (t === 'chart') {
      var ch = block.chart || {};
      var id = 'chart-' + (ch.id || Math.random().toString(36).slice(2,10));
      var chartType = (ch.type || 'bar').toLowerCase();
      var tall = (chartType === 'line' || chartType === 'scatter' || chartType === 'radar') ? ' tall' : '';
      var h = '<div class="block block-chart">';
      if (ch.title) h += '<div class="chart-title">'+escapeHtml(ch.title)+'</div>';
      if (ch.description) h += '<div class="chart-description">'+escapeHtml(ch.description)+'</div>';
      h += '<div id="'+id+'" class="chart-canvas'+tall+'"></div>';
      h += '</div>';
      window.setTimeout(function(){ renderChartAsync(id, ch); }, 0);
      return h;
    }
    if (t === 'table') {
      var cols = block.columns || [], rows = block.rows || [];
      if (!cols.length || !rows.length) return '';
      var h = '<div class="block block-table">' + (block.title ? '<div class="stat-grid-title">'+escapeHtml(block.title)+'</div>' : '') + '<table><thead><tr>';
      cols.forEach(function(c){ h += '<th>'+escapeHtml(c)+'</th>'; });
      h += '</tr></thead><tbody>';
      rows.forEach(function(r){
        h += '<tr>';
        (r || []).forEach(function(cell){ h += '<td>'+escapeHtml(cell)+'</td>'; });
        h += '</tr>';
      });
      return h + '</tbody></table></div>';
    }
    if (t === 'stat_grid') {
      var items = (block.items || []).filter(function(it){ return it && it.label && it.value; });
      if (!items.length) return '';
      var h = '<div class="block block-stat_grid">';
      if (block.title) h += '<div class="stat-grid-title" style="grid-column:1/-1">'+escapeHtml(block.title)+'</div>';
      items.forEach(function(it){
        h += '<div class="stat-card tone-'+safeTone(it.tone)+'">';
        h += '<div class="label">'+escapeHtml(it.label)+'</div>';
        h += '<div class="value">'+escapeHtml(it.value)+'</div>';
        if (it.caption) h += '<div class="caption">'+escapeHtml(it.caption)+'</div>';
        h += '</div>';
      });
      return h + '</div>';
    }
    if (t === 'callout') {
      var c = String(block.content || '').trim();
      if (!c) return '';
      var h = '<div class="block block-callout tone-'+safeTone(block.tone)+'">';
      if (block.title) h += '<div class="callout-title">'+escapeHtml(block.title)+'</div>';
      h += '<div class="callout-content">'+renderMarkdown(c)+'</div>';
      return h + '</div>';
    }
    if (t === 'quote_card') {
      var c = String(block.content || '').trim();
      if (!c) return '';
      var h = '<div class="block block-quote_card"><div class="quote-content">'+escapeHtml(c)+'</div>';
      if (block.source) h += '<div class="quote-source">— '+escapeHtml(block.source)+'</div>';
      return h + '</div>';
    }
    if (t === 'timeline') {
      var items = (block.items || []).filter(function(it){ return it && (it.label || it.content); });
      if (!items.length) return '';
      var h = '<div class="block block-timeline">';
      if (block.title) h += '<div class="stat-grid-title">'+escapeHtml(block.title)+'</div>';
      items.forEach(function(it){
        h += '<div class="timeline-item">';
        if (it.label) h += '<div class="tl-label">'+escapeHtml(it.label)+'</div>';
        if (it.content) h += '<div class="tl-content">'+escapeHtml(it.content)+'</div>';
        h += '</div>';
      });
      return h + '</div>';
    }
    if (t === 'chip_list') {
      var items = (block.items || []).filter(function(x){ return String(x || '').trim(); });
      if (!items.length) return '';
      var h = '<div class="block block-chip_list">';
      if (block.title) h += '<div class="chip-list-title">'+escapeHtml(block.title)+'</div>';
      h += '<div class="chips">';
      items.forEach(function(x){ h += '<span class="chip">'+escapeHtml(x)+'</span>'; });
      return h + '</div></div>';
    }
    if (t === 'progress_bar') {
      var items = (block.items || []).filter(function(it){ return it && it.label; });
      if (!items.length) return '';
      var h = '<div class="block block-progress_bar">';
      if (block.title) h += '<div class="stat-grid-title">'+escapeHtml(block.title)+'</div>';
      h += '<div class="progress-list">';
      items.forEach(function(it){
        var maxVal = parseFloat(it.max) || 100;
        var val = parseFloat(it.value) || 0;
        var pct = Math.min(100, Math.max(0, (val / maxVal) * 100));
        var suffix = it.suffix || '';
        var tone = safeTone(it.tone);
        h += '<div class="progress-item">';
        h += '<div class="progress-header">';
        h += '<span class="progress-label">'+escapeHtml(it.label)+'</span>';
        h += '<span class="progress-value tone-'+tone+'">'+escapeHtml(String(it.value))+escapeHtml(suffix)+'</span>';
        h += '</div>';
        h += '<div class="progress-track"><div class="progress-fill tone-'+tone+'" style="width:'+pct+'%"></div></div>';
        h += '</div>';
      });
      return h + '</div></div>';
    }
    if (t === 'mini_kpi_row') {
      var items = (block.items || []).filter(function(it){ return it && it.label && it.value; });
      if (!items.length) return '';
      var h = '<div class="block block-mini_kpi_row"><div class="mini-kpi-row">';
      items.forEach(function(it){
        var tone = safeTone(it.tone);
        h += '<div class="mini-kpi-item">';
        h += '<div class="mini-kpi-label">'+escapeHtml(it.label)+'</div>';
        h += '<div class="mini-kpi-value tone-'+tone+'">'+escapeHtml(String(it.value))+'</div>';
        if (it.trend) h += '<div class="mini-kpi-trend">'+escapeHtml(it.trend)+'</div>';
        h += '</div>';
      });
      return h + '</div></div>';
    }
    if (t === 'divider') {
      var cls = block.label ? ' has-label' : '';
      return '<hr class="block block-divider'+cls+'">' + (block.label ? '<div class="block-divider"><span class="divider-label">'+escapeHtml(block.label)+'</span></div>' : '');
    }
    return '';
  }
  function renderSection(section){
    if (!section) return '';
    var h = '<section id="'+escapeHtml(section.id || ('section-'+Math.random().toString(36).slice(2,8)))+'">';
    var lvl = section.level || 2;
    if (lvl === 3) {
      h += '<h3>'+escapeHtml(section.heading || '')+'</h3>';
    } else {
      h += '<h2>'+escapeHtml(section.heading || '')+'</h2>';
    }
    (section.blocks || []).forEach(function(b){ h += renderBlock(b); });
    return h + '</section>';
  }
  function buildToc(sections){
    var list = document.getElementById('toc-list');
    if (!list || !sections || !sections.length) return;
    sections.forEach(function(s, i){
      var id = s.id || ('section-'+i);
      var a = document.createElement('a');
      a.href = '#' + id;
      a.textContent = s.heading || ('第 '+(i+1)+' 节');
      a.className = (s.level === 3) ? 'lvl-3' : '';
      a.onclick = function(e){
        e.preventDefault();
        var el = document.getElementById(id);
        if (el) el.scrollIntoView({behavior:'smooth', block:'start'});
      };
      list.appendChild(a);
    });
  }
  function renderReferences(refs){
    if (!refs || !refs.length) return;
    var sec = document.getElementById('references');
    var ol = document.getElementById('ref-list');
    refs.forEach(function(r){
      var li = document.createElement('li');
      li.id = 'ref-' + r.n;
      if (r.title) {
        li.innerHTML = '<a href="'+escapeHtml(r.url)+'" target="_blank" rel="noopener">'+escapeHtml(r.title)+'</a> <span style="color:var(--text-soft);font-size:12px">'+escapeHtml(r.url)+'</span>';
      } else {
        li.innerHTML = '<a href="'+escapeHtml(r.url)+'" target="_blank" rel="noopener">'+escapeHtml(r.url)+'</a>';
      }
      ol.appendChild(li);
    });
    sec.style.display = 'block';
  }
  function init(){
    var reportData = document.getElementById('visual-report-data').textContent;
    var refData = document.getElementById('references-data').textContent;
    var report, refs;
    try { report = JSON.parse(reportData); } catch(e) {
      document.getElementById('report-body').innerHTML = '<div class="fallback">可视化报告 JSON 解析失败：'+escapeHtml(e.message)+'</div>';
      return;
    }
    try { refs = JSON.parse(refData); } catch(e) { refs = []; }
    document.title = report.title || '对比看板';
    document.getElementById('report-title').textContent = report.title || '对比看板';
    if (report.subtitle) document.getElementById('report-subtitle').textContent = report.subtitle;
    var meta = document.getElementById('report-meta');
    if (report.current_date || report.topic) {
      meta.textContent = [report.topic, report.current_date].filter(Boolean).join(' · ');
    }
    var heroStatsEl = document.getElementById('hero-stats');
    if (heroStatsEl && report.hero_stats && report.hero_stats.length) {
      report.hero_stats.forEach(function(s){
        var div = document.createElement('div');
        div.className = 'hero-stat';
        div.innerHTML = '<div class="hs-label">'+escapeHtml(s.label)+'</div><div class="hs-value">'+escapeHtml(s.value)+'</div>';
        heroStatsEl.appendChild(div);
      });
    }
    var body = document.getElementById('report-body');
    var sections = report.sections || [];
    sections.forEach(function(s){ body.innerHTML += renderSection(s); });
    buildToc(sections);
    renderReferences(refs);
    window.addEventListener('resize', function(){
      CHART_INSTANCES.forEach(function(c){ try { c.resize(); } catch(e){} });
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }
})();
</script>
</body>
</html>
