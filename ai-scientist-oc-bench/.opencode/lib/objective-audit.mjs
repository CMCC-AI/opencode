import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { workspacePath } from './research-guidance.mjs'
import { taskUnits, auditResearchContract } from './research-contract.mjs'

const folder = 'outputs/objective-audit'
const ledgerPath = 'outputs/task-deliverables.json'
const text = x => typeof x === 'string' && x.trim().length > 0
const hash = x => crypto.createHash('sha256').update(x).digest('hex')
const encode = x => JSON.stringify(x, null, 2) + '\n'
const requireValue = (ok, why) => { if (!ok) throw new Error(why) }
const read = (w, p) => JSON.parse(fs.readFileSync(workspacePath(w, p), 'utf8'))
function save(w, p, value) {
  const file = workspacePath(w, p)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, encode(value))
}
function definition(item) {
  return { ...Object.fromEntries(['id', 'requirement', 'source_type', 'source', 'source_excerpt_or_rationale',
    'priority', 'acceptance_criteria', 'target_conditions', 'depends_on', 'figure_requirements', 'no_figure_reason'].map(k => [k, item[k]])),
    data_expected: Array.isArray(item.data_requirements) ? item.data_requirements.map(x => ({ dimension: x.dimension, expected: x.expected })) : [] }
}

export function prepareObjectives(workspace) {
  const instructions = fs.readFileSync(workspacePath(workspace, 'INSTRUCTIONS.md'), 'utf8')
  requireValue(text(instructions), 'INSTRUCTIONS.md is empty')
  const file = `${folder}/task-snapshot.json`
  if (fs.existsSync(workspacePath(workspace, file))) {
    requireValue(read(workspace, file).sha256 === hash(instructions), 'Task instructions changed; retain the original objective and use a fresh workspace for a new task')
  } else save(workspace, file, { sha256: hash(instructions), instructions })
  const units = taskUnits(workspace)
  save(workspace, `${folder}/source-units.json`, { units })
  return { task_sha256: hash(instructions), ledger: ledgerPath, source_units: `${folder}/source-units.json`, units, guide: 'templates/task-deliverables.md', schema_version: '3.0' }
}

function validateDefinitions(ledger) {
  requireValue(ledger?.schema_version === '3.0', 'Use task-deliverables schema_version 3.0; migrate existing items explicitly without dropping requirements')
  requireValue(Array.isArray(ledger.items) && ledger.items.length > 0, 'A nonempty task-derived ledger is required')
  requireValue(ledger.items.some(item => item.priority === 'P0'), 'At least one original scientific objective must remain P0')
  const ids = new Set()
  for (const item of ledger.items) {
    requireValue(text(item.id) && !ids.has(item.id), 'Item IDs must be nonempty and unique')
    ids.add(item.id)
    for (const k of ['requirement', 'source', 'source_excerpt_or_rationale']) requireValue(text(item[k]), `${item.id}: missing ${k}`)
    requireValue(['explicit', 'inferred'].includes(item.source_type), `${item.id}: invalid source_type`)
    requireValue(['P0', 'P1', 'P2'].includes(item.priority), `${item.id}: invalid priority`)
    requireValue(Array.isArray(item.acceptance_criteria) && item.acceptance_criteria.length > 0 && item.acceptance_criteria.every(text), `${item.id}: specify acceptance criteria`)
    requireValue(item.target_conditions && typeof item.target_conditions === 'object' && !Array.isArray(item.target_conditions) && Object.keys(item.target_conditions).length > 0, `${item.id}: specify target_conditions (entities, sample size, repeats, protocol, baselines as applicable)`)
    requireValue(Object.values(item.target_conditions).every(text), `${item.id}: target conditions must be explicit strings; explain unspecified conditions`)
    requireValue(Array.isArray(item.depends_on), `${item.id}: specify depends_on`)
  }
  for (const item of ledger.items) for (const id of item.depends_on) requireValue(ids.has(id) && id !== item.id, `${item.id}: invalid dependency ${id}`)
  const visiting = new Set(), visited = new Set()
  const visit = id => {
    requireValue(!visiting.has(id), `Cyclic dependency at ${id}`)
    if (visited.has(id)) return
    visiting.add(id)
    ledger.items.find(x => x.id === id).depends_on.forEach(visit)
    visiting.delete(id); visited.add(id)
  }
  ids.forEach(visit)
}

function checkBaseline(workspace, ledger) {
  const file = `${folder}/requirements-baseline.json`
  if (!fs.existsSync(workspacePath(workspace, file))) return
  const baseline = read(workspace, file)
  for (const original of baseline.items) {
    const current = ledger.items.find(x => x.id === original.id)
    requireValue(current && Object.entries(original).every(([key, value]) => JSON.stringify(definition(current)[key]) === JSON.stringify(value)),
      `${original.id}: original requirement, priority, conditions and acceptance criteria cannot be removed or rewritten; append a new item and record discrepancies instead`)
  }
}

export function writeObjectives(workspace, ledger) {
  prepareObjectives(workspace)
  validateDefinitions(ledger)
  checkBaseline(workspace, ledger)
  const baseline = `${folder}/requirements-baseline.json`
  if (fs.existsSync(workspacePath(workspace, ledgerPath))) {
    const old = fs.readFileSync(workspacePath(workspace, ledgerPath), 'utf8')
    save(workspace, `${folder}/history/${Date.now()}-${crypto.randomUUID()}.json`, JSON.parse(old))
  }
  // New requirements extend the baseline; earlier requirements never disappear.
  save(workspace, baseline, { items: ledger.items.map(definition) })
  save(workspace, ledgerPath, ledger)
  return auditObjectives(workspace)
}

export function auditObjectives(workspace) {
  const issues = [], unresolved = [], recoveryRequired = []
  let reliabilityReviewed = false
  let ledger
  const checkPaths = (paths, label, resultEvidence = false) => {
    if (!Array.isArray(paths) || !paths.length) { issues.push(`${label}: missing evidence paths`); return }
    for (const relative of paths) {
      try {
        requireValue(text(relative), 'Evidence path must be a string')
        // Never open hidden benchmark assets or use audit paperwork as experimental evidence.
        requireValue(['code/', 'outputs/', 'report/', 'data/', 'related_work/'].some(prefix => relative.startsWith(prefix)) &&
          !relative.split('/').some(part => /^(target_study|evaluation|checklist.*|_?score[.]json)$/i.test(part)), 'Not an authorized scientific evidence path')
        if (resultEvidence) requireValue(['outputs/', 'report/'].some(prefix => relative.startsWith(prefix)) &&
          !relative.startsWith(folder + '/') && relative !== ledgerPath, 'Use actual results, not code, input files or objective-audit records')
        const file = workspacePath(workspace, relative)
        requireValue(fs.statSync(file).isFile() && fs.statSync(file).size > 0, 'Missing or empty evidence file')
      } catch (error) { issues.push(`${label}: ${relative}: ${error.message}`) }
    }
  }
  try {
    prepareObjectives(workspace)
    ledger = read(workspace, ledgerPath)
    validateDefinitions(ledger)
    requireValue(fs.existsSync(workspacePath(workspace, `${folder}/requirements-baseline.json`)), 'Register the initial ledger with objective-audit operation=save before experiments')
    checkBaseline(workspace, ledger)
    requireValue(read(workspace, `${folder}/requirements-baseline.json`).items.length === ledger.items.length, 'Register newly discovered requirements with objective-audit save')
    const contract = auditResearchContract(workspace, ledger, checkPaths)
    issues.push(...contract.issues)
    recoveryRequired.push(...contract.gaps)
    for (const item of ledger.items) {
      const label = item.id
      if (item.priority === 'P0' && item.status !== 'verified') unresolved.push(label)
      try {
      requireValue(['pending', 'in_progress', 'ready_for_review', 'verified', 'blocked', 'not_applicable'].includes(item.status), `${label}: invalid status`)
      if (item.status === 'not_applicable') {
        requireValue(item.source_type !== 'explicit' && item.priority !== 'P0', `${label}: required objectives cannot be waived`)
        requireValue(text(item.not_applicable_reason), `${label}: explain not_applicable`)
      }
      if (item.status === 'blocked' || item.gap) {
        recoveryRequired.push(label)
        const r = item.recovery
        requireValue(text(item.gap) && r && text(r.reason) && text(r.next_action), `${label}: gap requires a recovery reason and next action`)
        requireValue(['active', 'exhausted', 'permission_blocked', 'budget_exhausted', 'resolved', 'input_inconsistent'].includes(r.state), `${label}: invalid recovery state`)
        requireValue(Array.isArray(r.attempts) && r.attempts.length > 0, `${label}: record actual recovery or restriction-check attempts`)
        for (const a of r.attempts) {
          requireValue(text(a.action) && text(a.outcome), `${label}: recovery attempt needs action and outcome`)
          checkPaths(a.evidence_paths, `${label} recovery`)
          requireValue(['restriction_check', 'search', 'candidate_audit', 'acquire', 'validate', 'smoke_test', 'experiment'].includes(a.stage), `${label}: recovery attempt needs an explicit execution stage`)
        }
        if (r.state === 'resolved') {
          requireValue(!r.kind || ['resource', 'computation'].includes(r.kind), `${label}: invalid recovery kind`)
          const stages = r.kind === 'computation' ? ['validate', 'experiment'] : ['acquire', 'validate', 'smoke_test', 'experiment']
          for (const stage of stages) requireValue(r.attempts.some(a => a.stage === stage && a.succeeded === true), `${label}: resolved recovery requires successful ${stage} evidence, not search or download alone`)
        }
        if (item.status === 'verified') requireValue(r.state === 'resolved', `${label}: unresolved recovery cannot be verified`)
      }
      if (item.status !== 'verified') continue
      for (const dep of item.depends_on) requireValue(ledger.items.find(x => x.id === dep).status === 'verified', `${label}: dependency ${dep} is not verified`)
      const v = item.verification
      requireValue(v?.verdict === 'passed' && text(v.reviewer) && v.reviewer !== 'chief', `${label}: independent content verification required`)
      checkPaths(item.evidence_paths, label, true)
      requireValue(Array.isArray(item.report_locations) && item.report_locations.length > 0 && item.report_locations.every(text), `${label}: specify report locations`)
      for (const criterion of item.acceptance_criteria) {
        const c = v.checks?.find(x => x.criterion === criterion)
        requireValue(c?.matched === true && text(c.observation), `${label}: acceptance criterion was not checked: ${criterion}`)
        checkPaths(c.evidence_paths, `${label} acceptance`, true)
      }
      for (const [name, expected] of Object.entries(item.target_conditions)) {
        const c = v.conditions?.find(x => x.name === name)
        requireValue(c?.matched === true && c.expected === expected && text(c.observed), `${label}: missing or mismatched target condition ${name}`)
        checkPaths(c.evidence_paths, `${label} condition ${name}`, true)
      }
      requireValue(['input_reanalysis', 'reference_rerun', 'independent_run', 'mixed'].includes(item.result_origin?.kind) && text(item.result_origin.description), `${label}: disclose supplied results, official-code reruns and independent computation`)
      } catch (error) { issues.push(error.message) }
    }
    for (const axis of ['reliability', 'goal_coverage']) {
      try {
      const review = ledger.final_reviews?.[axis]
      requireValue(review?.status === 'passed' && text(review.reviewer) && review.reviewer !== 'chief', `Final ${axis} review is missing or not passed`)
      const before = issues.length
      checkPaths(review.evidence_paths, `Final ${axis} review`)
      if (axis === 'reliability' && before === issues.length) reliabilityReviewed = true
      } catch (error) { issues.push(error.message) }
    }
    if (unresolved.length && ledger.overall_status === 'completed') issues.push('Cannot claim completed while P0 requirements remain unresolved')
  } catch (error) { issues.push(error.message) }
  // A prior failed scientific assessment cannot be overwritten by mechanically
  // complete ledger flags. The release validator recomputes the scientific gate.
  const scientificAudit = workspacePath(workspace, 'outputs/research-guidance/scientific-audit.json')
  if (fs.existsSync(scientificAudit)) {
    try {
      const scientific = JSON.parse(fs.readFileSync(scientificAudit,'utf8'))
      if (scientific.status !== 'passed') issues.push('Scientific outcome or original-goal alignment remains incomplete; repair the scientific deficit, not ledger flags')
    } catch { issues.push('Scientific outcome audit is unreadable') }
  }
  const result = {
    contract_status: issues.length ? 'failed' : 'passed',
    evidence_reliability: reliabilityReviewed ? 'reviewed' : 'not_established',
    original_goal: !issues.length && !unresolved.length ? 'completed' : 'incomplete',
    unresolved_p0: unresolved, recovery_required: [...new Set(recoveryRequired)], issues,
    execution_status: ledger?.execution_status || 'not_established',
    file_delivery: fs.existsSync(workspacePath(workspace, 'report/report.md')) ? 'present' : 'missing',
    report_reliability: reliabilityReviewed ? 'reviewed' : 'not_established',
    scientific_review_required: true,
    limitation: 'Mechanical checks validate preserved definitions and evidence references, not the truth of observations or completeness of task decomposition. Reviewers must inspect inputs, result files, actual images and the original task.'
  }
  save(workspace, `${folder}/audit.json`, result)
  return result
}
