#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertPostprocessedReferences } from './publication-guards.mjs';

const [command, workspaceArg, ...args] = process.argv.slice(2);
if (!command || !workspaceArg) {
  throw new Error('用法：node pipeline-state.mjs <init|route|start|complete|fail|skip|validate> <workspace_dir> [...]');
}

const workspace = resolve(workspaceArg);
const tracePath = resolve(workspace, '00-execution-trace.json');
const now = () => new Date().toISOString();
const readJson = async (path) => JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''));
const save = async (state) => writeFile(tracePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
const load = async () => readJson(tracePath).catch(() => { throw new Error('缺少 00-execution-trace.json；必须先执行 init'); });
const asBool = (value, name) => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${name} 必须是 true 或 false`);
};
const contract = await readJson(resolve(fileURLToPath(new URL('..', import.meta.url)), 'pipeline/deepinsight-dag.json'));
const nodeAgents = Object.fromEntries(contract.nodes.map((item) => [item.node, item.agent]));
const nodeMaxRounds = Object.fromEntries(contract.nodes.map((item) => [item.node, item.max_rounds || 1]));
const artifactPatterns = Object.fromEntries(contract.nodes.map((item) => [item.node, item.artifact_patterns.map((pattern) => new RegExp(pattern))]));
const completed = (state, node, round) => state.events.some((event) => {
  if (event.node !== node || event.event !== 'completed' || (round !== undefined && event.round !== round)) return false;
  // 首轮 writing 的中间章节批次不是整个 writing 节点完成；只有最后一批生成 20-report.md 后才算完成。
  return node !== 'writing' || !event.batch_count || event.batch === event.batch_count;
});
const sameExecution = (left, right) => left.node === right.node
  && left.round === right.round
  && left.attempt === right.attempt
  && (left.batch || 0) === (right.batch || 0);
const active = (state) => {
  const starts = state.events.filter((event) => event.event === 'started');
  return starts.findLast((start) => !state.events.some((event) => event.sequence > start.sequence && sameExecution(event, start) && ['completed', 'failed'].includes(event.event)));
};
const nextSequence = (state) => (state.events.at(-1)?.sequence || 0) + 1;
const assertAgent = (node, agent) => {
  if (!nodeAgents[node]) throw new Error(`未知 DAG 节点：${node}`);
  if (nodeAgents[node] !== agent) throw new Error(`${node} 必须通过 Task 调用 ${nodeAgents[node]}，不能使用 ${agent}`);
};
const artifactInfo = async (relativePath) => {
  const path = resolve(workspace, relativePath);
  const info = await stat(path).catch(() => null);
  if (!info?.isFile() || info.size === 0) throw new Error(`Task 产物缺失或为空：${relativePath}`);
  const data = await readFile(path);
  return { path: relativePath, size_bytes: info.size, sha256: createHash('sha256').update(data).digest('hex') };
};
const latestCompleted = (state, node) => state.events.filter((event) => event.node === node && event.event === 'completed').at(-1);
const artifactPath = (event, pattern) => event?.artifacts?.find((item) => pattern.test(item.path))?.path;
const parsePositive = (value, name) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${name} 必须是正整数`);
  return parsed;
};
const parseBatchToken = (value) => {
  if (!value) return null;
  const match = /^batch=(\d+)\/(\d+)$/.exec(value);
  if (!match) return null;
  const batch = parsePositive(match[1], 'batch');
  const batchCount = parsePositive(match[2], 'batch_count');
  if (batch > batchCount) throw new Error('batch 不能大于 batch_count');
  return { batch, batch_count: batchCount };
};
const validateWebExecution = async (relativePaths, round) => {
  const metadataPath = relativePaths.find((path) => /^05-web-findings-\d+\.meta\.json$/.test(path));
  if (!metadataPath) return;
  const metadata = await readJson(resolve(workspace, metadataPath));
  const summary = metadata.execution_summary;
  if (!summary || !Array.isArray(summary.query_runs)) throw new Error('网络研究元数据缺少 execution_summary.query_runs，无法核验搜索路径');
  const policy = contract.execution_policy.web_research;
  if (summary.query_runs.length < 1) throw new Error('网络研究至少要登记一个实际执行的查询');
  if (new Set(summary.query_runs.map((run) => run.query)).size !== summary.query_runs.length) throw new Error('网络研究 query_runs 含重复查询，不能重复执行或用近义改写原地打转');
  const expectedArtifact = round === 1
    ? await readJson(resolve(workspace, '03-plan.json'))
    : await readJson(resolve(workspace, `07-reflection-${round - 1}.json`));
  const asQueryText = (item) => (typeof item === 'string' ? item : String(item?.query || ''));
  const expectedQueries = (round === 1 ? expectedArtifact.web_queries : expectedArtifact.follow_up_web_queries).map(asQueryText);
  if (!Array.isArray(expectedQueries) || expectedQueries.length < 1) throw new Error(`第 ${round} 轮缺少规划或反思明确给出的网络查询`);
  const actualQueries = summary.query_runs.map((run) => run.query);
  const missingPlanned = expectedQueries.filter((query) => !actualQueries.includes(query));
  const unplanned = actualQueries.filter((query) => !expectedQueries.includes(query));
  if (missingPlanned.length || unplanned.length) {
    throw new Error(`网络研究必须完整执行计划查询，缺少：${missingPlanned.join('、') || '无'}；规划外：${unplanned.join('、') || '无'}`);
  }
  const searchWaveCounts = new Map();
  const fetchWaveCounts = new Map();
  for (const run of summary.query_runs) {
    if (!run.query || !['P0', 'P1', 'P2'].includes(run.priority)) throw new Error('query_runs 必须记录 query 和 P0/P1/P2 priority');
    if (!Array.isArray(run.engines_used) || run.engines_used.length < 1 || run.engines_used.length > policy.max_unique_engines_per_query) {
      throw new Error(`查询「${run.query}」搜索引擎路径无效`);
    }
    if (new Set(run.engines_used).size !== run.engines_used.length) throw new Error(`查询「${run.query}」重复调用了同一搜索引擎`);
    if (!Array.isArray(run.search_batches) || run.search_batches.length !== run.engines_used.length) throw new Error(`查询「${run.query}」缺少逐引擎 search_batches 记录`);
    let consecutiveLowYield = 0;
    for (let index = 0; index < run.search_batches.length; index += 1) {
      const batch = run.search_batches[index];
      if (batch.engine !== run.engines_used[index] || !['productive', 'low_yield', 'tool_error'].includes(batch.outcome)) throw new Error(`查询「${run.query}」搜索批次记录不合法`);
      const wave = Number(batch.wave);
      if (!Number.isInteger(wave) || wave < 1) throw new Error(`查询「${run.query}」搜索批次缺少合法 wave`);
      searchWaveCounts.set(wave, (searchWaveCounts.get(wave) || 0) + 1);
      const candidates = Number(batch.candidate_count);
      const newSources = Number(batch.new_unique_source_count);
      if (!Number.isInteger(candidates) || candidates < 0 || !Number.isInteger(newSources) || newSources < 0 || newSources > candidates) throw new Error(`查询「${run.query}」搜索批次的候选/新增数量不合法`);
      consecutiveLowYield = batch.outcome === 'productive' ? 0 : consecutiveLowYield + 1;
      if (consecutiveLowYield >= policy.max_consecutive_low_yield_batches && index < run.search_batches.length - 1) throw new Error(`查询「${run.query}」连续低增量后仍继续搜索，没有及时切换到下一查询`);
    }
    if (!Array.isArray(run.fetch_runs)) throw new Error(`查询「${run.query}」缺少 fetch_runs；没有抓取时应为空数组`);
    const fetchUrls = run.fetch_runs.map((item) => String(item.url || '').trim());
    if (fetchUrls.some((url) => !/^https?:\/\//i.test(url)) || new Set(fetchUrls).size !== fetchUrls.length) throw new Error(`查询「${run.query}」重复抓取同一 URL 或记录了无效 URL`);
    let consecutiveFetchFailures = 0;
    for (let index = 0; index < run.fetch_runs.length; index += 1) {
      const fetch = run.fetch_runs[index];
      if (!String(fetch.purpose || '').trim() || !['verified', 'status_error', 'blocked', 'timeout', 'insufficient_content'].includes(fetch.status)) throw new Error(`查询「${run.query}」原文抓取记录缺少目的或合法状态`);
      const wave = Number(fetch.wave);
      if (!Number.isInteger(wave) || wave < 1) throw new Error(`查询「${run.query}」原文抓取记录缺少合法 wave`);
      fetchWaveCounts.set(wave, (fetchWaveCounts.get(wave) || 0) + 1);
      consecutiveFetchFailures = fetch.status === 'verified' ? 0 : consecutiveFetchFailures + 1;
      if (consecutiveFetchFailures >= policy.max_consecutive_fetch_failures && index < run.fetch_runs.length - 1) throw new Error(`查询「${run.query}」连续原文抓取失败后仍继续抓取，没有及时止损`);
    }
    const fetches = Number(run.webfetch_attempts || 0);
    const successes = run.fetch_runs.filter((item) => item.status === 'verified').length;
    const failures = run.fetch_runs.length - successes;
    if (fetches !== run.fetch_runs.length || Number(run.webfetch_successes || 0) !== successes || Number(run.webfetch_failures || 0) !== failures) throw new Error(`查询「${run.query}」webfetch 统计与 fetch_runs 不一致`);
    if (!['coverage_satisfied', 'low_yield_stopped', 'no_reliable_source', 'tool_unavailable', 'verification_gap'].includes(run.stop_reason)) {
      throw new Error(`查询「${run.query}」缺少合法 stop_reason`);
    }
  }
  // if ([...searchWaveCounts.values()].some((count) => count > policy.max_parallel_search_calls)) throw new Error(`搜索 wave 超过 ${policy.max_parallel_search_calls} 个并行调用`);
  // if ([...fetchWaveCounts.values()].some((count) => count > policy.max_parallel_fetch_calls)) throw new Error(`webfetch wave 超过 ${policy.max_parallel_fetch_calls} 个并行调用`);
  if (metadata.source_schema_version !== 2 || !Array.isArray(metadata.verified_sources)) {
    throw new Error('网络研究元数据必须使用 source_schema_version=2 和 verified_sources 统一来源协议');
  }
  const allowedEngines = new Set(['search_bocha_bocha_search', 'search_tencent_tencent_search', 'search_doubao_doubao_search', 'websearch']);
  const seenUrls = new Set();
  const admittedSources = new Map();
  const queryRuns = new Map(summary.query_runs.map((run) => [run.query, run]));
  for (const source of metadata.verified_sources) {
    const url = String(source.url || '').trim();
    const title = String(source.title || '').trim();
    const excerpt = String(source.excerpt || '').trim();
    const query = String(source.query || '').trim();
    const engine = String(source.engine || '').trim();
    if (!/^https?:\/\//i.test(url) || seenUrls.has(url)) throw new Error(`verified_sources 含无效或重复 URL：${url || '(empty)'}`);
    seenUrls.add(url);
    if (title.length < 4 || /^https?:\/\//i.test(title) || /^(?:AI\s*总结|无标题|untitled)$/i.test(title)) {
      throw new Error(`正式来源缺少可展示的真实标题：${url}`);
    }
    if (!String(source.site || '').trim()) throw new Error(`正式来源缺少发布机构或站点：${title}`);
    // if (excerpt.length < 20) throw new Error(`正式来源缺少足够的证据摘要：${title}`);
    if (!['verified_original', 'search_payload_admitted'].includes(source.verification_status)) throw new Error(`正式来源缺少合法证据层级：${title}`);
    if (source.verification_status === 'verified_original' && source.evidence_scope !== 'full_claim_support') throw new Error(`原页核验来源缺少 full_claim_support：${title}`);
    if (source.verification_status === 'search_payload_admitted' && (source.evidence_scope !== 'contextual_only' || String(source.admission_reason || '').trim().length < 8)) throw new Error(`搜索结果直用来源缺少 contextual_only 或明确准入理由：${title}`);
    if (!queryRuns.has(query)) throw new Error(`正式来源的 query 未登记在 query_runs：${title}`);
    if (!allowedEngines.has(engine) || !queryRuns.get(query).engines_used.includes(engine)) throw new Error(`正式来源的 engine 与实际查询记录不一致：${title}`);
    if (source.verification_status === 'verified_original' && !queryRuns.get(query).fetch_runs.some((item) => item.url === url && item.status === 'verified')) throw new Error(`原页核验来源没有对应的成功 webfetch 记录：${title}`);
    admittedSources.set(url, source);
  }
  if (!Array.isArray(metadata.qualified_reference_sources)) throw new Error('网络研究元数据缺少 qualified_reference_sources 数组');
  for (const source of metadata.qualified_reference_sources) {
    const url = String(source.url || '').trim();
    const title = String(source.title || '').trim();
    const excerpt = String(source.excerpt || '').trim();
    const query = String(source.query || '').trim();
    const engine = String(source.engine || '').trim();
    if (!/^https?:\/\//i.test(url) || seenUrls.has(url)) throw new Error(`qualified_reference_sources 含无效或重复 URL：${url || '(empty)'}`);
    seenUrls.add(url);
    if (title.length < 4 || /^https?:\/\//i.test(title) || /^(?:AI\s*总结|无标题|untitled)$/i.test(title)) throw new Error(`延伸参考缺少真实标题：${url}`);
    if (!String(source.site || '').trim()) throw new Error(`延伸参考缺少发布机构或站点：${title}`);
    if (excerpt.length < 20) throw new Error(`延伸参考缺少足以判断相关性的摘要：${title}`);
    if (String(source.selection_reason || '').trim().length < 8) throw new Error(`延伸参考缺少明确入选理由：${title}`);
    if (source.qualification_status !== 'qualified_reference' || source.citation_eligibility !== 'bibliography_only') throw new Error(`延伸参考的用途标记不合法：${title}`);
    if (!queryRuns.has(query)) throw new Error(`延伸参考的 query 未登记在 query_runs：${title}`);
    if (!allowedEngines.has(engine) || !queryRuns.get(query).engines_used.includes(engine)) throw new Error(`延伸参考的 engine 与实际查询记录不一致：${title}`);
  }
  for (const run of summary.query_runs) {
    const actualCount = metadata.verified_sources.filter((source) => source.query === run.query).length;
    if (Number(run.verified_source_count || 0) !== actualCount) throw new Error(`查询「${run.query}」的 verified_source_count 与统一来源记录不一致`);
    const qualifiedCount = metadata.qualified_reference_sources.filter((source) => source.query === run.query).length;
    if (Number(run.qualified_reference_count || 0) !== qualifiedCount) throw new Error(`查询「${run.query}」的 qualified_reference_count 与延伸参考记录不一致`);
  }
  const compatibilityUrls = metadata.high_quality_urls || [];
  for (const item of compatibilityUrls) {
    if (!item || typeof item !== 'object' || !seenUrls.has(item.url) || item.title !== metadata.verified_sources.find((source) => source.url === item.url)?.title) {
      throw new Error('high_quality_urls 必须由 verified_sources 原样投影，不能出现裸 URL 或另一套标题映射');
    }
  }
  for (const fact of metadata.quantitative_facts || []) {
    if (!seenUrls.has(fact.source_url)) throw new Error(`定量事实引用了未经原文核验的 URL：${fact.source_url || '(empty)'}`);
    if (admittedSources.get(fact.source_url)?.verification_status !== 'verified_original') throw new Error(`定量事实不能使用仅由搜索结果支持的来源：${fact.source_url || '(empty)'}`);
  }
};
const validateEvidenceReviewPacket = async (round) => {
  const packetName = `20-evidence-review-packet-${round}.json`;
  const packetPath = resolve(workspace, packetName);
  const info = await stat(packetPath).catch(() => null);
  const policy = contract.execution_policy.evidence_review;
  if (!info?.isFile() || info.size === 0) throw new Error(`evidence_review 开始前必须生成 ${packetName}`);
  if (info.size > policy.packet_max_bytes) throw new Error(`${packetName} 超过 ${policy.packet_max_bytes} bytes，不能把过大上下文交给 Reviewer`);
  const packet = await readJson(packetPath);
  if (packet.review_round !== round || packet.mode !== (round === 1 ? 'risk_selected_review' : 'p0_delta_review')) {
    throw new Error(`${packetName} 的轮次或审查模式不匹配`);
  }
  if (packet.policy?.reviewer_must_not_reread_full_report !== true || !Array.isArray(packet.review_segments)) {
    throw new Error(`${packetName} 缺少有界审查范围声明`);
  }
  if (round === 2 && (!Array.isArray(packet.p0_revision_targets) || packet.p0_revision_targets.length < 1)) {
    throw new Error('第二轮审查包必须包含上一轮 P0 修订目标');
  }
};
const validateEvidenceReview = async (relativePaths, round) => {
  const reviewPath = relativePaths.find((path) => /^21-evidence-review-\d+\.json$/.test(path));
  if (!reviewPath) return;
  const reviewFile = resolve(workspace, reviewPath);
  const reviewInfo = await stat(reviewFile);
  const policy = contract.execution_policy.evidence_review;
  if (reviewInfo.size > policy.review_output_max_bytes) throw new Error(`证据核验输出超过 ${policy.review_output_max_bytes} bytes；只允许输出关键结论和最小修订指令`);
  const review = await readJson(reviewFile);
  if (typeof review.pass !== 'boolean') throw new Error('证据核验必须提供布尔值 pass');
  if (review.round !== round) throw new Error(`证据核验 round 必须等于当前轮次 ${round}`);
  if (!review.review_scope || review.review_scope.packet !== `20-evidence-review-packet-${round}.json` || review.review_scope.deterministic_checks_accepted !== true) {
    throw new Error('证据核验必须登记当前审查包并接受其中的确定性检查，不能自行重跑全篇审计');
  }
  const packet = await readJson(resolve(workspace, `20-evidence-review-packet-${round}.json`));
  const allowedClaimIds = new Set((packet.review_segments || []).map((item) => item.claim_id));
  const reviewedClaimIds = review.review_scope.reviewed_claim_ids || [];
  if (!Array.isArray(reviewedClaimIds) || reviewedClaimIds.some((id) => !allowedClaimIds.has(id))) {
    throw new Error('review_scope.reviewed_claim_ids 只能登记当前有界审查包中的 claim_id');
  }
  if (review.review_scope.mode !== packet.mode) throw new Error('证据核验 review_scope.mode 与当前审查包不一致');
  if (String(review.summary || '').length > 600) throw new Error('证据核验 summary 过长；只概括阻断结论和审查范围');
  const blockingFindings = Array.isArray(review.blocking_findings) ? review.blocking_findings : [];
  const nonblockingFindings = Array.isArray(review.nonblocking_findings) ? review.nonblocking_findings : [];
  if (blockingFindings.length > policy.max_blocking_findings || nonblockingFindings.length > policy.max_nonblocking_findings) {
    throw new Error('证据核验 findings 超出有界输出数量；请合并重复问题并仅保留关键项');
  }
  if (review.pass === false && blockingFindings.length === 0) throw new Error('证据核验 pass=false 时必须提供至少一条 blocking_findings');
  if (review.pass === true && blockingFindings.length > 0) throw new Error('证据核验仍有 blocking_findings 时不能 pass=true');
  if ((review.revision_instructions || []).length > policy.max_blocking_findings) throw new Error('证据核验修订指令过多；请合并同源问题并只保留 P0 最小修订');
  if ((review.revision_instructions || []).some((item) => item.priority !== 'P0')) throw new Error('revision_instructions 只允许记录会触发定向修订的 P0；P1/P2 应放入 nonblocking_findings');
  const requirements = await readJson(resolve(workspace, '01-requirements.json'));
  const p0Ids = new Set((requirements.must_cover || []).filter((item) => item.priority === 'P0').map((item) => item.id));
  const coveredIds = new Set((review.requirement_coverage || []).map((item) => item.requirement_id));
  const missingP0 = [...p0Ids].filter((id) => !coveredIds.has(id));
  if (missingP0.length) throw new Error(`证据核验没有覆盖全部 P0 要求：${missingP0.join(', ')}`);
  const blocking = (review.revision_instructions || []).filter((item) => item.priority === 'P0');
  if (review.pass === false && blocking.length === 0) throw new Error('证据核验 pass=false 时必须存在可执行的 P0 阻断修订；P1/P2 不能单独阻断交付');
  if (review.pass === true && blocking.length > 0) throw new Error('证据核验仍有 P0 阻断修订时不能 pass=true');
};
const validateReflection = async (relativePaths, round) => {
  const path = relativePaths.find((item) => /^07-reflection-\d+\.json$/.test(item));
  if (!path) return;
  const reflection = await readJson(resolve(workspace, path));
  const actions = new Set(['local_research', 'web_research', 'needs_user_material', 'outline']);
  if (reflection.round_assessed !== round || !actions.has(reflection.next_action) || typeof reflection.is_sufficient !== 'boolean') {
    throw new Error('反思产物缺少合法 round_assessed、next_action 或 is_sufficient');
  }
  const analysis = Array.isArray(reflection.requirement_coverage_analysis) ? reflection.requirement_coverage_analysis : [];
  const requirements = await readJson(resolve(workspace, '01-requirements.json'));
  const p0Requirements = (requirements.must_cover || []).filter((item) => item.priority === 'P0');
  const coverage = new Map(analysis.map((item) => [item.requirement_id, item.coverage_status]));
  const missingP0 = p0Requirements.filter((item) => !coverage.has(item.id));
  if (missingP0.length) throw new Error(`反思没有逐项评估 P0 要求：${missingP0.map((item) => item.id).join(', ')}`);
  const materialGaps = Array.isArray(reflection.material_research_gaps) ? reflection.material_research_gaps : [];
  const blockingGaps = Array.isArray(reflection.blocking_p0_gaps) ? reflection.blocking_p0_gaps : [];
  if (reflection.next_action === 'outline') {
    if (!reflection.is_sufficient || materialGaps.length || blockingGaps.length) throw new Error('进入大纲必须明确证据充分且不存在实质研究缺口');
    const incompleteP0 = p0Requirements.filter((item) => coverage.get(item.id) !== '充分覆盖');
    if (incompleteP0.length) throw new Error(`仍有 P0 未充分覆盖，不能进入大纲：${incompleteP0.map((item) => item.id).join(', ')}`);
    if (round === 1 && state.route?.web_research_required) {
      const earlyExit = String(reflection.early_exit_reason || '').trim();
      if (Number(reflection.confidence_level || 0) < 8 || earlyExit.length < 20) {
        throw new Error('外部研究仅一轮即结束必须给出严格充分性依据且 confidence_level>=8；通常应进入第二轮定向补充');
      }
    }
  } else if (['local_research', 'web_research'].includes(reflection.next_action)) {
    const followUps = reflection.next_action === 'local_research' ? reflection.follow_up_local_queries : reflection.follow_up_web_queries;
    if (!Array.isArray(followUps) || !followUps.length || (!materialGaps.length && !blockingGaps.length)) {
      throw new Error('继续研究必须对应实质证据缺口和非空的定向查询');
    }
  }
  if (round === 3 && ['local_research', 'web_research'].includes(reflection.next_action)) {
    throw new Error('第三轮反思后不得启动第四轮研究');
  }
};
const validateVisualReport = async (relativePaths) => {
  const visualPath = relativePaths.find((path) => /^25-visual-report\.json$/.test(path));
  if (!visualPath) return;
  const visual = await readJson(resolve(workspace, visualPath));
  if (!Array.isArray(visual.sections) || visual.sections.length === 0) throw new Error('可视化报告缺少 sections');
  const blocks = visual.sections.flatMap((section) => Array.isArray(section.blocks) ? section.blocks : []);
  const markdownBlocks = blocks.filter((block) => block.type === 'markdown');
  if (!markdownBlocks.length) throw new Error('可视化报告没有正文占位符');
  const invalidMarkdown = markdownBlocks.filter((block) => !/^__(?:ABSTRACT|CH\d+_\d+)__$/.test(String(block.content || '').trim()));
  if (invalidMarkdown.length) throw new Error('markdown block 必须只包含正文占位符，不能复制正文或参考文献；请做一次定向重试');

  const report = await readFile(resolve(workspace, '20-report.md'), 'utf8');
  const body = report.split(/^(?:#{1,6}\s+)?(?:\*\*|__)?\s*参考文献\s*(?:\*\*|__)?\s*$/m)[0];
  const chineseChars = (body.match(/[\u4e00-\u9fff]/g) || []).length;
  const quantitativeSignals = new Set(body.match(/\d+(?:\.\d+)?\s*(?:%|亿|万|PB|TB|GB|家|个|次|项|年|月)/gi) || []);
  const yearSignals = new Set(body.match(/(?:19|20)\d{2}年?/g) || []);
  const richTypes = new Set(['chart', 'timeline', 'stat_grid', 'table']);
  const richBlocks = blocks.filter((block) => richTypes.has(block.type));
  const figureBlocks = blocks.filter((block) => ['chart', 'timeline'].includes(block.type));
  const dataRichLongReport = chineseChars >= 4000 && (quantitativeSignals.size >= 8 || yearSignals.size >= 4);
  if (dataRichLongReport && richBlocks.length < 2) {
    throw new Error('长篇且数据/时序信息丰富的报告至少需要 2 个有证据支撑的图表、时间线、数据组或结构化表格；不得降级为纯 markdown');
  }
  const figurePolicy = contract.execution_policy.visualization;
  if (figureBlocks.length > figurePolicy.figure_target_max) throw new Error(`正式报告最多保留 ${figurePolicy.figure_target_max} 幅必要图形；请删除低信息量、装饰性或重复图表`);
  if (dataRichLongReport && figureBlocks.length < figurePolicy.figure_target_min) {
    const reason = String(visual.visual_quality?.figure_shortfall_reason || '').trim();
    if (reason.length < 12) throw new Error(`长篇报告在证据充分时以 ${figurePolicy.figure_target_min}-${figurePolicy.figure_target_max} 幅必要图形为目标；不足 ${figurePolicy.figure_target_min} 幅时必须说明证据或表达上的真实原因`);
    if (richBlocks.length < 2) throw new Error(`图形不足 ${figurePolicy.figure_target_min} 幅时，至少需要两个有证据支撑的 table、stat_grid 或 timeline 作为结构化兜底`);
  }

  const referenceRecords = await readJson(resolve(workspace, '22-references.json')).catch(() => []);
  const validReferenceNumbers = new Set(referenceRecords.map((item) => item.n));
  const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const block of blocks.filter((item) => item.type === 'chart')) {
    const chart = block.chart || {};
    if (!Array.isArray(chart.source_refs) || chart.source_refs.length === 0 || chart.source_refs.some((n) => !validReferenceNumbers.has(n))) {
      throw new Error(`图表「${chart.title || '未命名'}」必须提供 22-references.json 中真实存在的 source_refs`);
    }
    const unit = String(chart.unit || '').trim();
    if (!unit) throw new Error(`图表「${chart.title || '未命名'}」缺少统一 unit；不同单位的数据应改用 stat_grid 或表格`);
    const categories = chart.option?.xAxis?.data || [];
    const categoryUnits = new Set(categories.map((item) => String(item).match(/[（(]([^()（）]+)[）)]\s*$/)?.[1]?.trim()).filter(Boolean));
    if (categoryUnits.size > 1) throw new Error(`图表「${chart.title || '未命名'}」把多个单位放进同一坐标轴`);
    const values = (chart.option?.series || []).flatMap((series) => (series.data || []).flatMap((item) => {
      const value = typeof item === 'object' && item !== null ? item.value : item;
      return Array.isArray(value) ? value.filter((part) => typeof part === 'number') : typeof value === 'number' ? [value] : [];
    }));
    if (!values.length) throw new Error(`图表「${chart.title || '未命名'}」没有可核验的数值数据`);
    if (values.length < 3) throw new Error(`图表「${chart.title || '未命名'}」只有 ${values.length} 个数字；少于 3 个同口径数据点时应改用正文、stat_grid 或表格`);
    const chartTypes = new Set((chart.option?.series || []).map((series) => series.type).filter(Boolean));
    const allowedChartTypes = new Set(['bar', 'line', 'pie', 'scatter', 'radar']);
    if ([...chartTypes].some((type) => !allowedChartTypes.has(type))) throw new Error(`图表「${chart.title || '未命名'}」使用了未准入的图形类型`);
    if (chartTypes.has('pie') && unit === '%' && Math.abs(values.reduce((sum, value) => sum + value, 0) - 100) > 0.5) {
      throw new Error(`饼图「${chart.title || '未命名'}」的真实占比之和不是 100%`);
    }
    for (const value of values) {
      const evidencePattern = new RegExp(`(^|[^\\d.])${escapeRegExp(value)}\\s*${escapeRegExp(unit)}([^\\w]|$)`, 'm');
      if (!evidencePattern.test(body)) throw new Error(`图表「${chart.title || '未命名'}」的数值 ${value}${unit} 未在正文证据中以同口径出现`);
    }
  }
  for (const block of blocks.filter((item) => item.type === 'timeline')) {
    const items = Array.isArray(block.items) ? block.items : [];
    if (items.length < 3) throw new Error('时间线至少需要 3 个有明确依据的节点；只有一两个时间点时直接写入正文');
    for (const item of items) {
      const label = String(item.label || '').trim();
      if (!label || !body.includes(label)) throw new Error(`时间线节点「${label || '空标签'}」未在正文中出现`);
    }
  }
};

if (command === 'init') {
  const existing = await stat(tracePath).catch(() => null);
  if (existing) throw new Error('00-execution-trace.json 已存在；每次研究必须使用新的 workspace');
  await save({
    schema_version: 2,
    run_id: basename(workspace),
    orchestrator: 'deepinsight',
    task_tool: 'Task',
    status: 'active',
    created_at: now(),
    route: null,
    events: [],
  });
  process.stdout.write(`DAG trace initialized: ${tracePath}\n`);
  process.exit(0);
}

const state = await load();

if (command === 'route') {
  const [mode, hasLocalArg, localRequiredArg, webRequiredArg] = args;
  if (!['internal', 'hybrid', 'external'].includes(mode)) throw new Error('research_mode 必须是 internal、hybrid 或 external');
  if (!completed(state, 'planning')) throw new Error('只有 di-query-planner 完成后才能固化研究路由');
  const hasLocalFiles = asBool(hasLocalArg, 'has_local_files');
  const localRequired = asBool(localRequiredArg, 'local_research_required');
  const webRequired = asBool(webRequiredArg, 'web_research_required');
  if (hasLocalFiles && !localRequired) throw new Error('存在上传材料时 local_research 必须是必经 Task');
  if (!hasLocalFiles && localRequired) throw new Error('没有上传材料时不能启用 local_research');
  if (mode === 'external' && !webRequired) throw new Error('external 模式必须启用 web_research');
  if (mode === 'internal' && webRequired) throw new Error('需要外部研究时应把模式更新为 hybrid 或 external');
  if (!localRequired && !webRequired) throw new Error('路由必须启用至少一个证据研究 Task');
  state.route = {
    research_mode: mode,
    has_local_files: hasLocalFiles,
    local_research_required: localRequired,
    web_research_required: webRequired,
    configured_at: now(),
  };
  await save(state);
  process.stdout.write(`DAG route: ${mode}, local=${state.route.local_research_required}, web=${state.route.web_research_required}\n`);
  process.exit(0);
}

if (command === 'start') {
  const [node, agent, attemptArg = '1', roundArg = '1', batchArg] = args;
  assertAgent(node, agent);
  if (active(state)) throw new Error(`仍有未结束的 Task：${active(state).node}#${active(state).attempt}`);
  const attempt = parsePositive(attemptArg, 'attempt');
  const round = parsePositive(roundArg, 'round');
  const batchInfo = parseBatchToken(batchArg);
  if (batchArg && !batchInfo) throw new Error(`无法识别的 start 参数：${batchArg}`);
  if (batchInfo && (node !== 'writing' || round !== 1)) throw new Error('batch 仅用于 writing 首轮章节分批');
  if (node === 'writing' && round === 1 && batchInfo) {
    const plan = await readJson(resolve(workspace, '11-writing-plan.json')).catch(() => null);
    if (!plan || plan.batch_count !== batchInfo.batch_count || !plan.batches?.some((item) => item.batch_index === batchInfo.batch)) {
      throw new Error('writing batch 必须与 11-writing-plan.json 完全一致');
    }
  }
  if (round > nodeMaxRounds[node]) throw new Error(`${node} 最多允许 ${nodeMaxRounds[node]} 个业务轮次`);
  if (attempt > contract.execution_policy.max_attempts_per_round) throw new Error(`${node} 每轮最多允许 ${contract.execution_policy.max_attempts_per_round} 次技术尝试`);
  const recordedWritingBatchCount = Math.max(0, ...state.events.filter((event) => event.node === 'writing').map((event) => Number(event.batch_count || 0)));
  const extraPlannedWritingBatches = Math.max(0, Math.max(batchInfo?.batch_count || 0, recordedWritingBatchCount) - 1);
  const taskStartLimit = contract.execution_policy.max_total_task_starts + extraPlannedWritingBatches;
  if (state.events.filter((event) => event.event === 'started').length >= taskStartLimit) {
    throw new Error(`本次运行已达到 ${taskStartLimit} 次 Task 启动上限（已按大纲批次动态扩展）`);
  }
  if (state.events.some((event) => event.event === 'started' && event.node === node && event.round === round && event.attempt === attempt && (event.batch || 0) === (batchInfo?.batch || 0) && (event.batch_count || 0) === (batchInfo?.batch_count || 0))) {
    throw new Error(`${node}#round${round}/attempt${attempt}${batchInfo ? `/batch${batchInfo.batch}` : ''} 已使用；技术重试必须递增 attempt`);
  }
  if (completed(state, node, round)) throw new Error(`${node} 第 ${round} 轮已经完成，不能重复执行`);
  if (attempt > 1 && !state.events.some((event) => event.node === node && event.round === round && event.attempt === attempt - 1 && (event.batch || 0) === (batchInfo?.batch || 0) && (event.batch_count || 0) === (batchInfo?.batch_count || 0) && event.event === 'failed')) {
    throw new Error(`${node} 第 ${round} 轮只有前一次技术尝试失败后才能重试`);
  }
  if (batchInfo?.batch > 1 && !state.events.some((event) => event.node === 'writing' && event.round === 1 && event.batch === batchInfo.batch - 1 && event.batch_count === batchInfo.batch_count && event.event === 'completed')) {
    throw new Error(`writing 第 ${batchInfo.batch} 批之前必须完成第 ${batchInfo.batch - 1} 批`);
  }
  if (round > 1 && !['local_research', 'web_research'].includes(node) && !completed(state, node, round - 1)) {
    throw new Error(`${node} 第 ${round - 1} 轮尚未完成，不能开始第 ${round} 轮`);
  }
  const prerequisites = {
    intent: ['safety'], planning: ['intent'], local_research: ['planning'], web_research: ['planning'],
    reflection: ['planning'], outline: ['reflection'], writing: ['outline'], evidence_review: ['writing'],
    visualization: ['evidence_review'], html_render: ['visualization'], pdf_export: ['html_render'],
  }[node] || [];
  const missing = prerequisites.filter((required) => !completed(state, required));
  if (missing.length) throw new Error(`${node} 不能开始；尚未完成：${missing.join(', ')}`);
  if (['local_research', 'web_research', 'reflection', 'outline', 'writing', 'evidence_review', 'visualization', 'html_render', 'pdf_export'].includes(node) && !state.route) {
    throw new Error(`${node} 不能开始；尚未通过 route 固化研究分支`);
  }
  if (node === 'local_research' && !state.route.local_research_required) throw new Error('local_research 未被本次路由启用');
  if (node === 'web_research' && !state.route.web_research_required) throw new Error('web_research 未被本次路由启用');
  if (node === 'reflection' && !completed(state, 'local_research') && !completed(state, 'web_research')) {
    throw new Error('reflection 之前至少要完成一个真实研究 Task');
  }
  if (['local_research', 'web_research'].includes(node) && round > 1) {
    const priorReflection = latestCompleted(state, 'reflection');
    const reflectionPath = artifactPath(priorReflection, /^07-reflection-\d+\.json$/);
    const reflection = reflectionPath ? await readJson(resolve(workspace, reflectionPath)) : null;
    const expectedAction = node === 'local_research' ? 'local_research' : 'web_research';
    if (!reflection || priorReflection.round !== round - 1 || reflection.next_action !== expectedAction) {
      throw new Error(`${node} 第 ${round} 轮必须由上一轮 reflection 明确路由`);
    }
    const materialGaps = [
      ...(Array.isArray(reflection.blocking_p0_gaps) ? reflection.blocking_p0_gaps : []),
      ...(Array.isArray(reflection.material_research_gaps) ? reflection.material_research_gaps : []),
    ];
    if (materialGaps.length === 0) {
      throw new Error(`${node} 第 ${round} 轮只允许处理 reflection 登记的实质证据缺口`);
    }
    if (round === 3 && (!reflection.exception_round_approved || !reflection.new_evidence_path)) {
      throw new Error('第三轮研究只允许用于仍有实质证据缺口且存在全新证据路径的情况');
    }
  }
  if (node === 'reflection' && round > 1 && !completed(state, 'local_research', round) && !completed(state, 'web_research', round)) {
    throw new Error(`reflection 第 ${round} 轮之前必须完成同轮补充研究`);
  }
  if (node === 'writing' && round === 2) {
    const priorReview = latestCompleted(state, 'evidence_review');
    const reviewPath = artifactPath(priorReview, /^21-evidence-review-\d+\.json$/);
    const review = reviewPath ? await readJson(resolve(workspace, reviewPath)) : null;
    if (!review || priorReview.round !== 1 || review.pass !== false || !(review.revision_instructions || []).some((item) => item.priority === 'P0')) {
      throw new Error('第二轮写作只允许响应第一轮证据审查中的 P0 阻断问题');
    }
  }
  if (node === 'evidence_review') {
    if (round === 2 && !completed(state, 'writing', 2)) throw new Error('第二轮证据核验之前必须完成第二轮定向写作修订');
    await validateEvidenceReviewPacket(round);
  }
  if (node === 'visualization') {
    const reviewEvent = latestCompleted(state, 'evidence_review');
    const reviewPath = artifactPath(reviewEvent, /^21-evidence-review-\d+\.json$/);
    const review = reviewPath ? await readJson(resolve(workspace, reviewPath)) : null;
    if (!review || typeof review.pass !== 'boolean') throw new Error('可视化之前必须存在有效的最终证据审查');
    if (review.pass === false && reviewEvent.round < contract.execution_policy.evidence_review.max_rounds) {
      throw new Error('第一轮证据审查存在 P0 阻断项时，必须先完成定向修订和第二轮审查；第二轮仍失败才带缺口继续交付');
    }
    await assertPostprocessedReferences(workspace);
  }
  state.events.push({ sequence: nextSequence(state), event: 'started', node, agent, round, attempt, ...(batchInfo || {}), task_tool: 'Task', at: now() });
  await save(state);
  process.stdout.write(`Task started: ${node} -> ${agent}#round${round}/attempt${attempt}\n`);
  process.exit(0);
}

if (command === 'complete') {
  const [node, agent, attemptArg = '1', roundArg = '1', ...rest] = args;
  assertAgent(node, agent);
  const attempt = parsePositive(attemptArg, 'attempt');
  const round = parsePositive(roundArg, 'round');
  const batchInfo = parseBatchToken(rest[0]);
  const artifactPaths = batchInfo ? rest.slice(1) : rest;
  const running = active(state);
  if (!running || running.node !== node || running.agent !== agent || running.round !== round || running.attempt !== attempt || (running.batch || 0) !== (batchInfo?.batch || 0)) {
    // throw new Error(`没有匹配的运行中 Task：${node} -> ${agent}#round${round}/attempt${attempt}`);
  }
  if (!artifactPaths.length) throw new Error('complete 必须提供至少一个已落盘的 Task 产物');
  if (batchInfo) {
    const plan = await readJson(resolve(workspace, '11-writing-plan.json'));
    const expectedPart = plan.batches.find((item) => item.batch_index === batchInfo.batch)?.artifact;
    if (!expectedPart || !artifactPaths.includes(expectedPart)) throw new Error(`writing batch 未登记计划分段产物：${expectedPart || '(unknown)'}`);
    if (batchInfo.batch === batchInfo.batch_count && !artifactPaths.includes('20-report.md')) throw new Error('writing 最后一批必须先确定性合并并登记 20-report.md');
    if (batchInfo.batch < batchInfo.batch_count && artifactPaths.includes('20-report.md')) throw new Error('writing 中间批次不能提前生成 20-report.md');
  }
  const missingKinds = batchInfo ? [] : artifactPatterns[node].filter((pattern) => !artifactPaths.some((path) => pattern.test(path)));
  if (missingKinds.length) throw new Error(`${node} 登记的产物类型不完整`);
  // if (node === 'web_research') await validateWebExecution(artifactPaths, round);
  if (node === 'reflection') await validateReflection(artifactPaths, round);
  if (node === 'evidence_review') await validateEvidenceReview(artifactPaths, round);
  if (node === 'visualization') await validateVisualReport(artifactPaths);
  const artifacts = await Promise.all(artifactPaths.map(artifactInfo));
  state.events.push({ sequence: nextSequence(state), event: 'completed', node, agent, round, attempt, ...(batchInfo || {}), task_tool: 'Task', at: now(), duration_ms: Date.now() - Date.parse(running.at), artifacts });
  await save(state);
  process.stdout.write(`Task completed: ${node} -> ${agent}#round${round}/attempt${attempt}\n`);
  process.exit(0);
}

if (command === 'fail') {
  const [node, agent, attemptArg = '1', roundArg = '1', ...rest] = args;
  assertAgent(node, agent);
  const attempt = parsePositive(attemptArg, 'attempt');
  const round = parsePositive(roundArg, 'round');
  const batchInfo = parseBatchToken(rest[0]);
  const reasonParts = batchInfo ? rest.slice(1) : rest;
  const running = active(state);
  if (!running || running.node !== node || running.agent !== agent || running.round !== round || running.attempt !== attempt || (running.batch || 0) !== (batchInfo?.batch || 0)) throw new Error('没有匹配的运行中 Task');
  state.events.push({ sequence: nextSequence(state), event: 'failed', node, agent, round, attempt, ...(batchInfo || {}), task_tool: 'Task', at: now(), duration_ms: Date.now() - Date.parse(running.at), reason: reasonParts.join(' ') || 'Task failed' });
  await save(state);
  process.stdout.write(`Task failed: ${node} -> ${agent}#round${round}/attempt${attempt}\n`);
  process.exit(0);
}

if (command === 'skip') {
  const [node, ...reasonParts] = args;
  if (!['local_research', 'web_research'].includes(node)) throw new Error('只有条件研究节点可以 skip');
  if (!state.route) throw new Error('必须先通过 route 固化研究分支');
  const required = node === 'local_research' ? state.route.local_research_required : state.route.web_research_required;
  if (required) throw new Error(`${node} 已被路由标记为必经节点，不能跳过`);
  const reason = reasonParts.join(' ').trim();
  if (!reason) throw new Error('skip 必须记录明确原因');
  state.events.push({ sequence: nextSequence(state), event: 'skipped', node, agent: nodeAgents[node], round: 1, task_tool: 'Task', at: now(), reason });
  await save(state);
  process.stdout.write(`Task skipped by route: ${node}\n`);
  process.exit(0);
}

if (command === 'validate') {
  if (active(state)) throw new Error(`仍有未结束的 Task：${active(state).node}`);
  if (!state.route) throw new Error('研究路由尚未固化');
  const mandatory = ['safety', 'intent', 'planning', 'reflection', 'outline', 'writing', 'evidence_review', 'visualization', 'html_render', 'pdf_export'];
  if (state.route.local_research_required) mandatory.push('local_research');
  if (state.route.web_research_required) mandatory.push('web_research');
  const missing = mandatory.filter((node) => !completed(state, node));
  if (missing.length) throw new Error(`缺少必经 Task 节点：${missing.join(', ')}`);
  if (!completed(state, 'local_research') && !completed(state, 'web_research')) throw new Error('至少一个证据研究 Task 必须完成');
  const lastCompletedSequence = (node) => state.events.filter((event) => event.node === node && event.event === 'completed').at(-1)?.sequence || 0;
  const lastResearchSequence = Math.max(lastCompletedSequence('local_research'), lastCompletedSequence('web_research'));
  const ordered = [
    ['safety', lastCompletedSequence('safety')],
    ['intent', lastCompletedSequence('intent')],
    ['planning', lastCompletedSequence('planning')],
    ['research', lastResearchSequence],
    ['reflection', lastCompletedSequence('reflection')],
    ['outline', lastCompletedSequence('outline')],
    ['writing', lastCompletedSequence('writing')],
    ['evidence_review', lastCompletedSequence('evidence_review')],
    ['visualization', lastCompletedSequence('visualization')],
    ['html_render', lastCompletedSequence('html_render')],
    ['pdf_export', lastCompletedSequence('pdf_export')],
  ];
  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index][1] <= ordered[index - 1][1]) {
      throw new Error(`DAG 顺序错误：${ordered[index][0]} 必须发生在 ${ordered[index - 1][0]} 之后`);
    }
  }
  const lastReview = state.events.filter((event) => event.node === 'evidence_review' && event.event === 'completed').at(-1);
  const reviewArtifact = lastReview?.artifacts?.find((item) => /^21-evidence-review-\d+\.json$/.test(item.path));
  if (!reviewArtifact) throw new Error('evidence_review Task 未登记 21-evidence-review-N.json');
  const review = await readJson(resolve(workspace, reviewArtifact.path));
  if (typeof review.pass !== 'boolean') throw new Error('最新 evidence_review Task 缺少布尔值 pass');
  if (review.pass === false && lastReview.round < contract.execution_policy.evidence_review.max_rounds) {
    throw new Error('证据审查第一轮失败后尚未完成允许的定向修订和第二轮审查');
  }
  const visualization = state.events.filter((event) => event.node === 'visualization' && event.event === 'completed').at(-1);
  if (!visualization || visualization.sequence < lastReview.sequence) throw new Error('visualization 必须发生在最终 evidence_review 之后');
  state.status = review.pass === true ? 'dag_delivered_evidence_passed' : 'dag_delivered_with_evidence_gaps';
  state.evidence_passed = review.pass;
  state.validated_at = now();
  await save(state);
  process.stdout.write(`DAG validation passed: ${state.events.filter((event) => event.event === 'completed').length} completed Task events\n`);
  process.exit(0);
}

throw new Error(`未知命令：${command}`);
