#!/usr/bin/env node
// 统一图表校验与组装器：输入扁平图表数据（大模型只产数据不产 option），
// 逐图校验，通过则组装确定性 ECharts option（样式固化，模型无法触碰），
// 失败则 ok:false 并给出具体原因，由调用方丢弃或退回生成方重试。
// 契约与各专家团的报告 JSON 结构无关，可被任何渲染脚本或子代理复用。

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CHART_TYPES = ['bar', 'line', 'pie', 'scatter', 'radar', 'gauge', 'candlestick'];
// 默认色板与 deeptrading/deepinsight 报告模板一致；各专家团可通过 options.palette 传入自己的视觉规范
const DEFAULT_PALETTE = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#94a3b8'];

const paletteOf = (options) => {
  const palette = options && options.palette;
  return Array.isArray(palette) && palette.length && palette.every((c) => typeof c === 'string' && c.trim())
    ? palette
    : DEFAULT_PALETTE;
};

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isPercent = (unit) => {
  const u = String(unit || '').trim();
  return u === '%' || u === '％';
};

// ---------- 校验：只做结构判定，不做数值口径判断 ----------

function validateSeriesNumbers(chart, errors) {
  if (!Array.isArray(chart.series) || chart.series.length === 0) {
    errors.push('series 必须是非空数组');
    return null;
  }
  for (const [i, s] of chart.series.entries()) {
    const bad = !s || typeof s !== 'object' || Array.isArray(s)
      || typeof s.name !== 'string' || !s.name.trim()
      || !Array.isArray(s.values) || s.values.length === 0
      || s.values.some((v) => !isNum(v));
    if (bad) {
      errors.push(`series[${i}] 非法：name 须为非空字符串，values 须为非空数字数组（字符串/null/NaN 均不允许）`);
      return null;
    }
  }
  return chart.series;
}

function validateCategories(chart, errors, min) {
  if (!Array.isArray(chart.categories) || chart.categories.length < min) {
    errors.push(`categories 必须是至少 ${min} 项的数组`);
    return null;
  }
  if (chart.categories.some((c) => c == null || (typeof c !== 'string' && !isNum(c)))) {
    errors.push('categories 每一项必须是字符串或数字');
    return null;
  }
  return chart.categories.map(String);
}

function validateBarLike(chart, errors) {
  const categories = validateCategories(chart, errors, 3);
  const series = validateSeriesNumbers(chart, errors);
  if (!categories || !series) return null;
  for (const [i, s] of series.entries()) {
    if (s.values.length !== categories.length) {
      errors.push(`series[${i}]（${s.name}）有 ${s.values.length} 个值，与 categories 的 ${categories.length} 项不一致`);
    }
  }
  if (errors.length) return null;
  return { categories, series };
}

function validatePie(chart, errors) {
  if (Array.isArray(chart.series) && chart.series.length > 1) {
    errors.push('饼图只允许 1 个 series（多维对比请改用 bar/radar）');
  }
  const series = validateSeriesNumbers(chart, errors);
  if (!series) return null;
  const categories = validateCategories(chart, errors, 2);
  if (!categories) return null;
  const values = series[0].values;
  if (values.length !== categories.length) {
    errors.push(`扇区名 ${categories.length} 个与数值 ${values.length} 个不一致`);
  }
  if (values.some((v) => v <= 0)) {
    errors.push('饼图数值必须全部大于 0（0 或负数无法构成占比）');
  }
  if (errors.length) return null;
  if (isPercent(chart.unit)) {
    const total = values.reduce((a, b) => a + b, 0);
    if (Math.abs(total - 100) > 0.5) errors.push(`饼图占比之和为 ${total}，必须等于 100（±0.5）`);
  }
  if (errors.length) return null;
  return { categories, series: [{ name: series[0].name, values }] };
}

function validateScatter(chart, errors) {
  if (!Array.isArray(chart.series) || chart.series.length === 0) {
    errors.push('series 必须是非空数组');
    return null;
  }
  for (const [i, s] of chart.series.entries()) {
    const bad = !s || typeof s !== 'object' || Array.isArray(s)
      || typeof s.name !== 'string' || !s.name.trim()
      || !Array.isArray(s.values) || s.values.length < 2
      || s.values.some((p) => !Array.isArray(p) || p.length !== 2 || !isNum(p[0]) || !isNum(p[1]));
    if (bad) {
      errors.push(`series[${i}] 非法：散点图 values 须为 [x, y] 数对（两个数字）且至少 2 对`);
      return null;
    }
  }
  if (chart.x_name != null && typeof chart.x_name !== 'string') errors.push('x_name 必须是字符串');
  if (errors.length) return null;
  return { series: chart.series };
}

function validateRadar(chart, errors) {
  const categories = validateCategories(chart, errors, 3);
  if (Array.isArray(chart.series) && chart.series.length > 6) {
    errors.push('雷达图 series 不超过 6 个，过多不可读');
  }
  const series = validateSeriesNumbers(chart, errors);
  if (!categories || !series) return null;
  for (const [i, s] of series.entries()) {
    if (s.values.length !== categories.length) {
      errors.push(`series[${i}]（${s.name}）有 ${s.values.length} 个值，与雷达维度数 ${categories.length} 不一致`);
    }
  }
  if (errors.length) return null;
  return { categories, series };
}

function validateGauge(chart, errors) {
  const series = validateSeriesNumbers(chart, errors);
  if (!series) return null;
  if (series.length !== 1 || series[0].values.length !== 1) {
    errors.push('仪表盘只允许 1 个 series 且只有 1 个数值（评分/达成率）');
  }
  if (chart.max != null && (!isNum(chart.max) || chart.max <= 0)) errors.push('max 必须是正数');
  if (errors.length) return null;
  return { series: [{ name: series[0].name, values: series[0].values.slice(0, 1) }] };
}

function validateCandlestick(chart, errors) {
  const categories = validateCategories(chart, errors, 5);
  if (!Array.isArray(chart.series) || chart.series.length === 0) {
    errors.push('series 必须是非空数组：第 1 个 series 是 K 线，其余是均线');
    return null;
  }
  if (chart.series.length > 5) errors.push('K线图最多 1 条 K 线 + 4 条均线');
  const k = chart.series[0];
  const badK = !k || typeof k !== 'object' || Array.isArray(k)
    || typeof k.name !== 'string' || !k.name.trim()
    || !Array.isArray(k.values) || k.values.length === 0
    || k.values.some((c) => !Array.isArray(c) || c.length !== 4 || c.some((v) => !isNum(v)));
  if (badK) {
    errors.push('series[0]（K线）非法：values 须为 [open, close, low, high] 数组（每根四个数字）');
    return null;
  }
  for (const [i, c] of k.values.entries()) {
    const [open, close, low, high] = c;
    if (high < Math.max(open, close) || low > Math.min(open, close)) {
      errors.push(`第 ${i + 1} 根 K 线 high/low 与 open/close 矛盾（high 须 ≥ max(open,close)，low 须 ≤ min(open,close)）`);
      break;
    }
  }
  if (categories && k.values.length !== categories.length) {
    errors.push(`K线有 ${k.values.length} 根，与 categories 的 ${categories.length} 个交易日不一致`);
  }
  for (const [i, s] of chart.series.slice(1).entries()) {
    const problems = [];
    if (!s || typeof s !== 'object' || Array.isArray(s) || typeof s.name !== 'string' || !s.name.trim()) {
      problems.push('name 须为非空字符串');
    }
    if (!Array.isArray(s.values)) {
      problems.push('values 须为数组');
    } else {
      if (categories && s.values.length !== categories.length) {
        problems.push(`values 长度 ${s.values.length} 与交易日数 ${categories.length} 不一致`);
      }
      if (s.values.some((v) => v != null && !isNum(v))) problems.push('只允许数字或 null（数据不足的均线点用 null）');
      if (!s.values.some((v) => v != null)) problems.push('全为 null，无可绘数据');
    }
    if (problems.length) {
      errors.push(`series[${i + 1}]（均线）非法：${problems.join('；')}`);
      return null;
    }
  }
  if (errors.length) return null;
  return { categories: categories || [], series: chart.series };
}

// ---------- 组装：确定性 option，颜色/布局/坐标轴全部固化 ----------

function axisGrid(legend) {
  // top 36 为 y 轴 name（单位）留出空间：实测 24 时轴名会超出画布顶约 5px，被清晰度检查拦下
  return { left: 8, right: 16, top: 36, bottom: legend ? 40 : 16, containLabel: true };
}

function buildBar(chart, data, palette) {
  const legend = data.series.length > 1 ? { bottom: 0, type: 'scroll' } : undefined;
  const showLabel = data.categories.length <= 8;
  return {
    color: palette,
    tooltip: { trigger: 'axis' },
    legend,
    grid: axisGrid(legend),
    xAxis: {
      type: 'category',
      data: data.categories,
      axisLabel: data.categories.length <= 12
        ? { interval: 0, rotate: data.categories.length > 7 ? 35 : 0 }
        : {},
    },
    yAxis: { type: 'value', name: chart.unit || undefined },
    series: data.series.map((s) => ({
      name: s.name,
      type: 'bar',
      data: s.values,
      barMaxWidth: 40,
      itemStyle: { borderRadius: [3, 3, 0, 0] },
      label: showLabel ? { show: true, position: 'top', formatter: '{c}' } : undefined,
    })),
  };
}

function buildLine(chart, data, palette) {
  const legend = data.series.length > 1 ? { bottom: 0, type: 'scroll' } : undefined;
  const single = data.series.length === 1;
  return {
    color: palette,
    tooltip: { trigger: 'axis' },
    legend,
    grid: axisGrid(legend),
    xAxis: { type: 'category', boundaryGap: false, data: data.categories },
    yAxis: { type: 'value', name: chart.unit || undefined },
    series: data.series.map((s) => ({
      name: s.name,
      type: 'line',
      data: s.values,
      smooth: true,
      symbolSize: 4,
      showSymbol: data.categories.length <= 20,
      lineStyle: { width: 2 },
      areaStyle: single ? { opacity: 0.1 } : undefined,
    })),
  };
}

function buildPie(chart, data, palette) {
  const values = data.series[0].values;
  const total = values.reduce((a, b) => a + b, 0);
  let slices = data.categories.map((name, i) => ({ name, value: values[i] }));
  if (slices.length > 5) {
    // 碎片扇区合并为「其他」，占比总和不变
    const rest = slices.filter((s) => s.value / total < 0.04);
    if (rest.length) {
      slices = [
        ...slices.filter((s) => s.value / total >= 0.04),
        { name: '其他', value: rest.reduce((a, s) => a + s.value, 0) },
      ];
    }
  }
  const unitSuffix = chart.unit ? ' ' + chart.unit : '';
  return {
    color: palette,
    tooltip: { trigger: 'item', formatter: '{b}: {c}' + unitSuffix + '（{d}%）' },
    series: [{
      type: 'pie',
      radius: ['42%', '66%'],
      center: ['50%', '46%'],
      avoidLabelOverlap: true,
      itemStyle: { borderRadius: 4, borderColor: '#fff', borderWidth: 1 },
      label: { formatter: isPercent(chart.unit) ? '{b} {d}%' : '{b}: {c}' },
      data: slices,
    }],
  };
}

function buildScatter(chart, data, palette) {
  const legend = data.series.length > 1 ? { bottom: 0, type: 'scroll' } : undefined;
  return {
    color: palette,
    tooltip: { trigger: 'item' },
    legend,
    grid: axisGrid(legend),
    xAxis: { type: 'value', name: chart.x_name || undefined, scale: true },
    yAxis: { type: 'value', name: chart.unit || undefined, scale: true },
    series: data.series.map((s) => ({ name: s.name, type: 'scatter', symbolSize: 9, data: s.values })),
  };
}

function buildRadar(chart, data, palette) {
  const legend = data.series.length > 1 ? { bottom: 0, type: 'scroll' } : undefined;
  const fixedMax = isNum(chart.max) && chart.max > 0 ? chart.max : null;
  const indicators = data.categories.map((name, i) => {
    const peak = Math.max(...data.series.map((s) => s.values[i]));
    return { name, max: fixedMax != null ? fixedMax : Math.max(1, Math.ceil(peak * 1.2)) };
  });
  return {
    color: palette,
    legend,
    tooltip: {},
    radar: { indicator: indicators, radius: '62%' },
    series: [{
      type: 'radar',
      symbolSize: 4,
      emphasis: { lineStyle: { width: 3 } },
      data: data.series.map((s) => ({ name: s.name, value: s.values })),
    }],
  };
}

function buildGauge(chart, data, palette) {
  const max = isNum(chart.max) && chart.max > 0 ? chart.max : 100;
  return {
    color: palette,
    series: [{
      type: 'gauge',
      min: 0,
      max,
      progress: { show: true, width: 12 },
      axisLine: { lineStyle: { width: 14 } },
      axisTick: { show: false },
      splitLine: { length: 10, lineStyle: { width: 1 } },
      detail: {
        valueAnimation: true,
        fontSize: 22,
        offsetCenter: [0, '62%'],
        formatter: '{value}' + (chart.unit ? ' ' + chart.unit : ''),
      },
      data: [{ name: data.series[0].name, value: data.series[0].values[0] }],
    }],
  };
}

function buildCandlestick(chart, data, palette) {
  const [k, ...overlays] = data.series;
  const legend = overlays.length ? { bottom: 0, type: 'scroll' } : undefined;
  return {
    color: palette,
    tooltip: { trigger: 'axis' },
    legend,
    grid: axisGrid(legend),
    xAxis: { type: 'category', data: data.categories },
    yAxis: { type: 'value', scale: true, name: chart.unit || undefined },
    series: [
      {
        name: k.name,
        type: 'candlestick',
        data: k.values,
        // A 股惯例红涨绿跌（与国际市场相反），显式固定避免依赖 ECharts 默认
        itemStyle: { color: '#ef4444', color0: '#10b981', borderColor: '#ef4444', borderColor0: '#10b981' },
      },
      ...overlays.map((s) => ({
        name: s.name,
        type: 'line',
        data: s.values,
        symbol: 'none',
        lineStyle: { width: 1.5 },
      })),
    ],
  };
}

// ---------- 调度 ----------

const VALIDATORS = {
  bar: validateBarLike,
  line: validateBarLike,
  pie: validatePie,
  scatter: validateScatter,
  radar: validateRadar,
  gauge: validateGauge,
  candlestick: validateCandlestick,
};

const BUILDERS = {
  bar: buildBar,
  line: buildLine,
  pie: buildPie,
  scatter: buildScatter,
  radar: buildRadar,
  gauge: buildGauge,
  candlestick: buildCandlestick,
};

export function buildChart(chart, index = 0, options = {}) {
  const id = chart && typeof chart === 'object' && typeof chart.id === 'string' && chart.id.trim()
    ? chart.id
    : `chart-${index + 1}`;
  if (!chart || typeof chart !== 'object' || Array.isArray(chart)) {
    return { index, id, ok: false, errors: ['图表必须是 JSON 对象'] };
  }
  const type = typeof chart.type === 'string' ? chart.type.trim().toLowerCase() : '';
  if (!CHART_TYPES.includes(type)) {
    return { index, id, ok: false, errors: [`type 仅支持 ${CHART_TYPES.join('/')}，当前为「${String(chart.type ?? '')}」`] };
  }
  const errors = [];
  if (typeof chart.title !== 'string' || !chart.title.trim()) errors.push('title 必须是非空字符串');
  if (chart.unit != null && typeof chart.unit !== 'string') errors.push('unit 必须是字符串（全图统一单位）');
  if (chart.description != null && typeof chart.description !== 'string') errors.push('description 必须是字符串');
  if (errors.length) return { index, id, ok: false, errors };
  const data = VALIDATORS[type](chart, errors);
  if (errors.length) return { index, id, ok: false, errors };
  return { index, id, ok: true, option: BUILDERS[type](chart, data, paletteOf(options)) };
}

export function buildCharts(charts, options = {}) {
  if (!Array.isArray(charts)) {
    return { results: [], okCount: 0, failCount: 1, errors: ['输入必须是图表数组，或形如 {"charts": [...]} 的对象'] };
  }
  const results = charts.map((c, i) => buildChart(c, i, options));
  return {
    results,
    okCount: results.filter((r) => r.ok).length,
    failCount: results.filter((r) => !r.ok).length,
  };
}

// 渲染前统一闸门：sections 内的 chart block 若带扁平 data，则校验并注入组装好的 option；
// 校验失败的整块移除（摘要供日志报出，渲染不中断）；自带 option 的旧格式 block 原样保留。
// sections 支持 visual-report 顶层 sections（deeptrading/deepinspect/deepinsight/mstock），
// 也支持传入 report.sections（zhengqi）。
export function injectChartOptions(sections, options = {}) {
  if (!Array.isArray(sections)) return { total: 0, kept: 0, dropped: [] };
  const chartBlocks = [];
  // type=chart 但缺少嵌套 chart 对象的块（例如编排方在 task prompt 里另行发明了图表结构）：
  // 模板无法渲染，必须丢弃，且要计入统计并报出原因——绝不能静默消失
  const malformedBlocks = [];
  for (const section of sections) {
    for (const block of Array.isArray(section && section.blocks) ? section.blocks : []) {
      if (!block || block.type !== 'chart') continue;
      if (block.chart && typeof block.chart === 'object' && !Array.isArray(block.chart)) chartBlocks.push(block);
      else malformedBlocks.push(block);
    }
  }
  const dataBlocks = chartBlocks.filter((b) => b.chart.data != null);
  const legacyBlocks = chartBlocks.filter((b) => b.chart.data == null && b.chart.option != null);
  const dropped = malformedBlocks.map((block) => ({
    title: String(block.title || block.id || '未命名图表'),
    errors: ['chart block 缺少嵌套 chart 对象（契约：{type:"chart", chart:{id,title,type,description,data}}），不符合契约已丢弃'],
  }));
  let kept = legacyBlocks.length;
  if (dataBlocks.length) {
    const { results } = buildCharts(dataBlocks.map((b) => {
      const data = b.chart.data;
      // data 允许自带 id/title/type 整体平铺，也允许只放 unit/categories/series
      return data && typeof data === 'object' && !Array.isArray(data)
        ? { ...b.chart, ...data }
        : { ...b.chart };
    }), options);
    for (const result of results) {
      const block = dataBlocks[result.index];
      if (result.ok) {
        block.chart.option = result.option;
        delete block.chart.data;
        kept++;
      } else {
        dropped.push({ title: block.chart.title || result.id, errors: result.errors });
      }
    }
  }
  for (const block of chartBlocks) {
    if (block.chart.data == null && block.chart.option == null) {
      dropped.push({ title: block.chart.title || '未命名图表', errors: ['chart block 缺少 data（新契约）或 option（旧格式）'] });
    }
  }
  for (const section of sections) {
    if (Array.isArray(section && section.blocks)) {
      section.blocks = section.blocks.filter((b) => !(b && b.type === 'chart' && !(b.chart && b.chart.option)));
    }
  }
  return { total: chartBlocks.length + malformedBlocks.length, kept, dropped };
}

// ---------- CLI ----------
// 数组模式（生成阶段自查自纠）：node build-charts.mjs <charts.json | -> [--palette "#a,#b,..."]
// 渲染模式（就地处理 visual-report JSON）：node build-charts.mjs --visual <visual-report.json> [--palette "#a,#b,..."]

const printSummary = (summary) => {
  process.stdout.write(`图表校验：${summary.kept}/${summary.total} 张通过`);
  if (summary.dropped.length) {
    process.stdout.write(`，已丢弃 ${summary.dropped.length} 张：\n`);
    for (const d of summary.dropped) process.stdout.write(`  - 「${d.title}」：${d.errors.join('；')}\n`);
  } else {
    process.stdout.write('\n');
  }
  if (summary.total && !summary.kept) process.stdout.write('警告：全部图表被丢弃，应退回生成方按契约重做图表数据\n');
};

const readStdin = async () => {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  return raw;
};

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const paletteFlag = args.indexOf('--palette');
  const palette = paletteFlag >= 0 && typeof args[paletteFlag + 1] === 'string'
    ? args[paletteFlag + 1].split(',').map((c) => c.trim()).filter(Boolean)
    : undefined;
  const visualFlag = args.indexOf('--visual');

  if (visualFlag >= 0) {
    const file = args[visualFlag + 1];
    if (!file) {
      process.stderr.write('用法：node build-charts.mjs --visual <visual-report.json> [--palette "#a,#b,..."]\n');
      process.exit(2);
    }
    const raw = await readFile(resolve(file), 'utf8');
    let visual;
    try {
      visual = JSON.parse(raw.replace(/^\uFEFF/, ''));
    } catch (e) {
      throw new Error(`输入不是合法 JSON：${e.message}`);
    }
    const sections = Array.isArray(visual.sections)
      ? visual.sections
      : visual.report && Array.isArray(visual.report.sections)
        ? visual.report.sections
        : null;
    if (!sections) throw new Error('可视化 JSON 中找不到 sections（支持顶层 sections 或 report.sections）');
    const summary = injectChartOptions(sections, { palette });
    await writeFile(resolve(file), JSON.stringify(visual, null, 2) + '\n', 'utf8');
    printSummary(summary);
    process.stdout.write(`已写回：${resolve(file)}\n`);
    // 渲染模式不因丢弃而失败退出：坏图表已移除，管道继续，摘要日志供编排方决定是否重做
    process.exit(0);
  }

  const arg = args.find((a) => !a.startsWith('--'));
  if (!arg) {
    process.stderr.write('用法：node build-charts.mjs <charts.json | -> [--palette "#a,#b,..."]，或 node build-charts.mjs --visual <visual-report.json>\n');
    process.exit(2);
  }
  const raw = arg === '-' ? await readStdin() : await readFile(resolve(arg), 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw.replace(/^\uFEFF/, ''));
  } catch (e) {
    throw new Error(`输入不是合法 JSON：${e.message}`);
  }
  const charts = Array.isArray(parsed) ? parsed : parsed && Array.isArray(parsed.charts) ? parsed.charts : null;
  if (!charts) throw new Error('输入必须是图表数组，或形如 {"charts": [...]} 的对象');
  const report = buildCharts(charts, { palette });
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  if (report.failCount > 0) {
    process.stderr.write(`图表校验：${report.okCount}/${charts.length} 通过，${report.failCount} 张不合格（详见 stdout 的 errors 字段）\n`);
    process.exit(1);
  }
  process.stderr.write(`图表校验：${charts.length}/${charts.length} 通过\n`);
}
