#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile, stat } from 'node:fs/promises';
import { basename, resolve, relative, sep } from 'node:path';

const [command, workspaceArg, ...args] = process.argv.slice(2);
if (!command || !workspaceArg) {
  throw new Error('用法：node pipeline-state.mjs <init|gate|route|start|complete|fail|skip|validate> <workspace> [...]');
}

const skillRoot = resolve(import.meta.dirname, '..');
const contract = JSON.parse(await readFile(resolve(skillRoot, 'pipeline/deepgeo-dag.json'), 'utf8'));
const workspace = resolve(workspaceArg);
const tracePath = resolve(workspace, '00-control/execution-trace.json');
const nodes = new Map(contract.nodes.map((item) => [item.node, item]));
const domainNodes = contract.nodes.filter((item) => item.parallel_group === 'domain_analysis').map((item) => item.node);
const now = () => new Date().toISOString();

function assertInside(root, target) {
  const rel = relative(root, target);
  if (!rel || rel.startsWith(`..${sep}`) || rel === '..' || resolve(root, rel) !== target) throw new Error(`路径越界：${target}`);
}

async function readJson(path) { return JSON.parse(await readFile(path, 'utf8')); }
async function load() { return readJson(tracePath); }
async function save(state) { await writeFile(tracePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8'); }
function nextSequence(state) { return state.events.length ? Math.max(...state.events.map((event) => event.sequence)) + 1 : 1; }
function positive(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${label} 必须是正整数`);
  return parsed;
}
function completed(state, node, round) {
  return state.events.some((event) => event.event === 'completed' && event.node === node && (round === undefined || event.round === round));
}
function latestCompleted(state, node) { return state.events.filter((event) => event.event === 'completed' && event.node === node).at(-1); }
function running(state) { return state.events.filter((start) => start.event === 'started' && !state.events.some((end) => end.sequence > start.sequence && end.execution_id === start.execution_id && ['completed', 'failed'].includes(end.event))); }
function gatePassed(state, gate) { return state.gates?.[gate]?.status === 'passed'; }
function enabled(state, node) {
  const spec = nodes.get(node);
  if (!spec) return false;
  if (!domainNodes.includes(node)) return true;
  return state.route?.enabled_nodes?.includes(node) === true;
}
function requiredGate(state, gate) { return state.route?.required_gates?.includes(gate) === true; }
function postReviewStarts(state) { return state.events.filter((event) => event.event === 'started' && event.round > 1).length; }

async function artifactInfo(relativePath) {
  const target = resolve(workspace, relativePath);
  assertInside(workspace, target);
  const info = await stat(target);
  if (!info.isFile() || info.size === 0) throw new Error(`产物不存在或为空：${relativePath}`);
  const content = await readFile(target);
  if (relativePath.endsWith('.json')) JSON.parse(content.toString('utf8'));
  return { path: relativePath, bytes: info.size, sha256: createHash('sha256').update(content).digest('hex') };
}

async function countPersistedIntermediateFiles(directory = workspace) {
  let count = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === '.DS_Store' || entry.name === '.scratch') continue;
    const target = resolve(directory, entry.name);
    const rel = relative(workspace, target).split(sep).join('/');
    if (entry.isDirectory()) {
      if (rel === '06-visuals/publication') continue;
      count += await countPersistedIntermediateFiles(target);
    } else if (!['07-report/report.md', '07-report/report.html', '07-report/report.pdf'].includes(rel)) {
      count += 1;
    }
  }
  return count;
}

function assertNodeAgent(node, agent) {
  const spec = nodes.get(node);
  if (!spec) throw new Error(`未知 DAG 节点：${node}`);
  if (spec.agent !== agent) throw new Error(`${node} 必须由 ${spec.agent} 执行，不能使用 ${agent}`);
}

function assertPrerequisites(state, node, round) {
  const spec = nodes.get(node);
  if (node === 'data_readiness' && !gatePassed(state, 'G1')) throw new Error('data_readiness 之前必须通过 G1');
  if (domainNodes.includes(node) && requiredGate(state, 'G2') && !gatePassed(state, 'G2')) throw new Error(`${node} 之前必须通过 G2`);
  if (node === 'business_strategy' && requiredGate(state, 'G3') && !gatePassed(state, 'G3')) throw new Error('business_strategy 之前必须通过 G3');
  for (const dependency of spec.depends_on) {
    if (dependency === 'domain_analysis') {
      const missing = domainNodes.filter((item) => enabled(state, item) && !completed(state, item));
      if (missing.length) throw new Error(`${node} 之前尚未完成领域节点：${missing.join(', ')}`);
      continue;
    }
    if (!completed(state, dependency)) throw new Error(`${node} 之前必须完成 ${dependency}`);
  }
  if (round > 1) {
    if (!completed(state, node, round - 1)) throw new Error(`${node} 第 ${round - 1} 轮尚未完成`);
    const review = latestCompleted(state, 'independent_review');
    if (!review || review.round !== round - 1) throw new Error('第二轮只能由上一轮独立审查触发');
  }
}

if (command === 'init') {
  if (await stat(tracePath).catch(() => null)) throw new Error('execution-trace 已存在；每次运行必须使用新 Workspace');
  const { mkdir } = await import('node:fs/promises');
  await mkdir(resolve(workspace, '00-control'), { recursive: true });
  await writeFile(tracePath, `${JSON.stringify({
    schema_version: 1,
    run_id: basename(workspace),
    orchestrator: 'deepgeo',
    status: 'active',
    created_at: now(),
    gates: {},
    route: null,
    events: [],
  }, null, 2)}\n`, 'utf8');
  process.stdout.write(`DeepGeo trace initialized: ${tracePath}\n`);
  process.exit(0);
}

const state = await load();

if (command === 'gate') {
  const [gate, status, ...noteParts] = args;
  if (!contract.gates.some((item) => item.gate === gate)) throw new Error(`未知人工闸门：${gate}`);
  if (!['passed', 'rejected', 'not_required'].includes(status)) throw new Error('gate status 必须是 passed、rejected 或 not_required');
  if (!noteParts.join(' ').trim()) throw new Error('人工闸门必须记录用户决定或不需要的依据');
  state.gates[gate] = { status: status === 'not_required' ? 'passed' : status, original_status: status, note: noteParts.join(' '), at: now() };
  if (status === 'rejected') state.status = 'waiting_or_stopped_by_human';
  await save(state);
  process.stdout.write(`${gate}: ${status}\n`);
  process.exit(0);
}

if (command === 'route') {
  if (!completed(state, 'data_readiness')) throw new Error('只有 data_readiness 完成后才能固化运行子图');
  const planRelative = args[0] || '01-brief/run-plan.json';
  const planPath = resolve(workspace, planRelative);
  assertInside(workspace, planPath);
  const plan = await readJson(planPath);
  if (!['xr_cinema', 'scenic_park', 'custom'].includes(plan.scenario)) throw new Error('run plan scenario 不合法');
  const unknown = plan.enabled_nodes.filter((node) => !nodes.has(node));
  if (unknown.length) throw new Error(`run plan 含未知节点：${unknown.join(', ')}`);
  const enabledDomains = domainNodes.filter((node) => plan.enabled_nodes.includes(node));
  if (enabledDomains.length < 2) throw new Error('位置决策至少启用两个领域分析节点');
  if (plan.enabled_nodes.includes('market_research') && !plan.network_authorized) throw new Error('启用 market_research 必须明确 network_authorized=true');
  if (!Array.isArray(plan.required_gates) || plan.required_gates.some((gate) => !['G1', 'G2', 'G3', 'G4'].includes(gate))) throw new Error('required_gates 不合法');
  state.route = {
    scenario: plan.scenario,
    enabled_nodes: [...new Set(plan.enabled_nodes)],
    required_gates: [...new Set(plan.required_gates)],
    network_authorized: Boolean(plan.network_authorized),
    plan_path: planRelative,
    configured_at: now(),
  };
  await save(state);
  process.stdout.write(`DeepGeo route: ${state.route.scenario}; domains=${enabledDomains.join(',')}\n`);
  process.exit(0);
}

if (command === 'start') {
  const [node, agent, attemptArg = '1', roundArg = '1'] = args;
  assertNodeAgent(node, agent);
  const attempt = positive(attemptArg, 'attempt');
  const round = positive(roundArg, 'round');
  const spec = nodes.get(node);
  if (round > spec.max_rounds) throw new Error(`${node} 最多 ${spec.max_rounds} 轮`);
  if (attempt > contract.execution_policy.max_attempts_per_round) throw new Error(`${node} 每轮最多 ${contract.execution_policy.max_attempts_per_round} 次尝试`);
  if (domainNodes.includes(node) && !state.route) throw new Error('领域分析之前必须 route');
  if (!enabled(state, node)) throw new Error(`${node} 未被本次 run plan 启用`);
  if (completed(state, node, round)) throw new Error(`${node} 第 ${round} 轮已经完成`);
  if (attempt > 1 && !state.events.some((event) => event.event === 'failed' && event.node === node && event.round === round && event.attempt === attempt - 1)) throw new Error('只有前一次失败后才能增加 attempt');
  assertPrerequisites(state, node, round);
  if (round > 1 && postReviewStarts(state) >= contract.execution_policy.max_post_review_task_starts) {
    throw new Error(`审查后最多启动 ${contract.execution_policy.max_post_review_task_starts} 个 Task（一次责任修复 + 一次定向复核）；请保留为内部草稿，不得继续级联返工`);
  }
  const active = running(state);
  if (active.length) {
    const parallelAllowed = spec.parallel_group === 'domain_analysis' && active.every((item) => nodes.get(item.node)?.parallel_group === 'domain_analysis');
    if (!parallelAllowed) throw new Error(`存在运行中节点：${active.map((item) => item.node).join(', ')}`);
    if (active.length >= contract.execution_policy.max_parallel_domain_agents) throw new Error('并行领域专家数量超过上限');
  }
  if (state.events.filter((event) => event.event === 'started').length >= contract.execution_policy.max_total_task_starts) throw new Error('Task 启动次数达到预算上限');
  const executionId = `${node}-r${round}-a${attempt}`;
  if (state.events.some((event) => event.execution_id === executionId)) throw new Error(`执行标识已使用：${executionId}`);
  state.events.push({ sequence: nextSequence(state), execution_id: executionId, event: 'started', node, agent, attempt, round, parallel_group: spec.parallel_group, at: now() });
  await save(state);
  process.stdout.write(`Task started: ${executionId}\n`);
  process.exit(0);
}

if (command === 'complete') {
  const [node, agent, attemptArg = '1', roundArg = '1', ...artifactPaths] = args;
  assertNodeAgent(node, agent);
  const attempt = positive(attemptArg, 'attempt');
  const round = positive(roundArg, 'round');
  const executionId = `${node}-r${round}-a${attempt}`;
  if (!running(state).some((event) => event.execution_id === executionId)) throw new Error(`没有匹配的运行中 Task：${executionId}`);
  if (!artifactPaths.length) throw new Error('complete 必须登记产物');
  const spec = nodes.get(node);
  const patterns = spec.artifact_patterns.map((pattern) => new RegExp(pattern));
  const missing = patterns.filter((pattern) => !artifactPaths.some((item) => pattern.test(item)));
  if (missing.length) throw new Error(`${node} 产物类型不完整`);
  const artifacts = await Promise.all(artifactPaths.map(artifactInfo));
  if (node === 'report_editing') {
    const preflight = await readJson(resolve(workspace, '07-report/preflight-quality.json'));
    if (preflight.status !== 'passed' || Number(preflight.summary?.p0) !== 0) {
      throw new Error('报告确定性预检未通过；必须在当前 report_editing Task 内一次性修复全部 P0，不能把问题留给独立审查');
    }
    const hashes = preflight.artifact_hashes;
    if (!hashes || !hashes['07-report/report.md'] || !hashes['06-visuals/chart-manifest.json']) throw new Error('预检缺少报告或图表清单哈希，无法证明检查对应最终版本');
    for (const [relativePath, expected] of Object.entries(hashes)) {
      const current = await artifactInfo(relativePath);
      if (current.sha256 !== expected) throw new Error(`预检后产物发生变化，必须重新集中预检：${relativePath}`);
    }
  }
  const started = state.events.find((event) => event.execution_id === executionId && event.event === 'started');
  state.events.push({ sequence: nextSequence(state), execution_id: executionId, event: 'completed', node, agent, attempt, round, at: now(), duration_ms: Date.now() - Date.parse(started.at), artifacts });
  await save(state);
  process.stdout.write(`Task completed: ${executionId}\n`);
  process.exit(0);
}

if (command === 'fail') {
  const [node, agent, attemptArg = '1', roundArg = '1', ...reasonParts] = args;
  assertNodeAgent(node, agent);
  const attempt = positive(attemptArg, 'attempt');
  const round = positive(roundArg, 'round');
  const executionId = `${node}-r${round}-a${attempt}`;
  if (!running(state).some((event) => event.execution_id === executionId)) throw new Error(`没有匹配的运行中 Task：${executionId}`);
  state.events.push({ sequence: nextSequence(state), execution_id: executionId, event: 'failed', node, agent, attempt, round, at: now(), reason: reasonParts.join(' ') || 'Task failed' });
  await save(state);
  process.stdout.write(`Task failed: ${executionId}\n`);
  process.exit(0);
}

if (command === 'skip') {
  const [node, ...reasonParts] = args;
  if (!domainNodes.includes(node)) throw new Error('只有条件领域节点可以 skip');
  if (!state.route) throw new Error('skip 之前必须 route');
  if (enabled(state, node)) throw new Error(`${node} 已启用，不能 skip`);
  const reason = reasonParts.join(' ').trim();
  if (!reason) throw new Error('skip 必须记录原因');
  state.events.push({ sequence: nextSequence(state), execution_id: `${node}-skip`, event: 'skipped', node, agent: nodes.get(node).agent, round: 1, attempt: 0, at: now(), reason });
  await save(state);
  process.stdout.write(`Task skipped: ${node}\n`);
  process.exit(0);
}

if (command === 'validate') {
  if (running(state).length) throw new Error(`仍有运行中节点：${running(state).map((item) => item.node).join(', ')}`);
  if (!state.route) throw new Error('运行子图尚未固化');
  const required = contract.nodes.filter((spec) => !domainNodes.includes(spec.node) || enabled(state, spec.node)).map((spec) => spec.node);
  const missing = required.filter((node) => !completed(state, node));
  if (missing.length) throw new Error(`缺少必经节点：${missing.join(', ')}`);
  const unrecordedSkips = domainNodes.filter((node) => !enabled(state, node) && !state.events.some((event) => event.event === 'skipped' && event.node === node));
  if (unrecordedSkips.length) throw new Error(`条件节点缺少 skip 记录：${unrecordedSkips.join(', ')}`);
  if (requiredGate(state, 'G4') && !gatePassed(state, 'G4')) throw new Error('正式发布之前必须通过 G4');
  const reviewEvent = latestCompleted(state, 'independent_review');
  const releaseArtifact = reviewEvent?.artifacts?.find((item) => item.path === '08-review/release-decision.json');
  if (!releaseArtifact) throw new Error('独立审查缺少 release-decision.json');
  const release = await readJson(resolve(workspace, releaseArtifact.path));
  if (release.p0_count !== 0 || release.decision !== 'pass') throw new Error('P0 未清零，只能形成内部草稿，不能通过正式发布校验');
  const intermediateCount = await countPersistedIntermediateFiles();
  const intermediateBudget = Number(contract.execution_policy.max_persisted_intermediate_files || 24);
  if (intermediateCount > intermediateBudget) throw new Error(`正式中间文件 ${intermediateCount} 个，超过清洁 Workspace 上限 ${intermediateBudget}；请把逐配方结果和临时转换移入 .scratch，并合并重复台账`);
  const order = ['task_governance', 'data_readiness', 'decision_model', 'business_strategy', 'decision_synthesis', 'report_editing', 'independent_review'];
  const sequence = (node) => latestCompleted(state, node)?.sequence || 0;
  for (let index = 1; index < order.length; index += 1) {
    if (sequence(order[index]) <= sequence(order[index - 1])) throw new Error(`DAG 顺序错误：${order[index]}`);
  }
  state.status = 'dag_validated_release_ready';
  state.validated_at = now();
  await save(state);
  process.stdout.write(`DeepGeo DAG validated: ${required.length} required nodes completed\n`);
  process.exit(0);
}

throw new Error(`未知命令：${command}`);
