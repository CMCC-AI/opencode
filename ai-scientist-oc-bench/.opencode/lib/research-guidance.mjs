import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

export function getLibraryRoot() {
  return fileURLToPath(new URL('../research-guidance/', import.meta.url))
}
const folder = 'outputs/research-guidance'
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')
const nonempty = value => typeof value === 'string' && value.trim().length > 0
function requireValue(condition, message) { if (!condition) throw new Error(message) }

// Resolve existing ancestors as well as lexical paths, including output-directory symlinks.
export function workspacePath(workspace, relative) {
  const root = fs.realpathSync(workspace)
  requireValue(nonempty(relative) && !relative.includes('\\') && !path.posix.isAbsolute(relative) &&
    !/^[a-z]:/i.test(relative) && !relative.split('/').includes('..'), 'Use a workspace-relative path without traversal')
  const target = path.resolve(root, relative)
  requireValue(target.startsWith(root + path.sep), 'Path escapes workspace')
  let existing = target
  while (!fs.existsSync(existing)) {
    requireValue(!fs.lstatSync(existing, { throwIfNoEntry: false })?.isSymbolicLink(), 'Broken output link')
    existing = path.dirname(existing)
  }
  const real = fs.realpathSync(existing)
  requireValue(real === root || real.startsWith(root + path.sep), 'Symlink escapes workspace')
  return target
}

function outputPath(workspace, relative) {
  requireValue(/^(code|outputs|report)\//.test(relative), 'Evidence must be under code/, outputs/, or report/')
  return workspacePath(workspace, relative)
}

function save(workspace, relative, value) {
  const target = workspacePath(workspace, relative)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, value, 'utf8')
  return target
}

export function loadCatalog() {
  const catalogPath = path.join(getLibraryRoot(), 'catalog.json')
  requireValue(fs.existsSync(catalogPath), 'Bundled research catalog missing: deploy the complete agent including .opencode/research-guidance/catalog.json')
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'))
  const directions = new Set(catalog.directions.map(x => x.id))
  const methods = new Set(catalog.methods.map(x => x.id))
  requireValue(directions.size === catalog.directions.length && methods.size === catalog.methods.length, 'Duplicate catalog IDs')
  for (const method of catalog.methods) {
    requireValue(directions.has(method.direction), `Unknown direction: ${method.direction}`)
    for (const key of ['title', 'when', 'objective', 'decision', 'limits']) requireValue(nonempty(method[key]), `Missing ${key}`)
    for (const key of ['actions', 'evidence']) requireValue(Array.isArray(method[key]) && method[key].length && method[key].every(nonempty), `Missing ${key}`)
  }
  return catalog
}

export function renderCatalog(catalog) {
  const parts = [`# Research guidance ${catalog.version}`, catalog.policy,
    '## How to use',
    'L1: assess broad directions. L2: select applicable method branches. L3: adapt them into task-specific claims and evidence plans. Selection is semantic and advisory; there is no keyword router or task-ID lookup.',
    'For implementation choices, consult implementation-tool-selection under construct. Map the scientific operation and available inputs to candidate tools, confirm official version-specific APIs and environment suitability, and describe a representative trial in the existing procedure. Tool examples are optional and do not supply acceptance thresholds.',
    'For each claim specify rationale, owner, procedure, success and refutation criteria, planned artifacts, and report sections before execution. Record negative or inconclusive findings honestly. A method can be deferred or inapplicable with reasons. For a library gap, use an explicit task-grounded custom procedure.',
    'Use research-guidance(operation="plan", plan_json=...) to validate and save plan.json. Update claims after experiments; independent scientific review is required. The audit operation checks references plus frozen scientific outcomes and review freshness. See plan-example.json for the contract.']
  for (const direction of catalog.directions) {
    parts.push(`## ${direction.id}: ${direction.title}`, direction.question)
    for (const method of catalog.methods.filter(m => m.direction === direction.id)) {
      parts.push(`### ${method.id}: ${method.title}`, `When: ${method.when}`, `Objective: ${method.objective}`,
        ...method.actions.map(x => `- ${x}`), `Evidence: ${method.evidence.join(' ')}`,
        `Decision: ${method.decision}`, `Limits: ${method.limits}`)
    }
  }
  return parts.join('\n\n') + '\n'
}

// Semantic selection by the caller; never consult task IDs or offline provenance.
export function selectCatalog(catalog, {direction_id, method_ids, summary_only = false} = {}) {
  if (direction_id !== undefined)
    requireValue(catalog.directions.some(d => d.id === direction_id), 'Unknown direction_id')
  if (method_ids !== undefined) {
    requireValue(Array.isArray(method_ids) && method_ids.length > 0 && new Set(method_ids).size === method_ids.length,
      'method_ids must be a nonempty unique list')
    for (const id of method_ids) requireValue(catalog.methods.some(m => m.id === id), `Unknown method_id: ${id}`)
  }
  let methods = catalog.methods.filter(m => !direction_id || m.direction === direction_id)
  if (method_ids) {
    requireValue(method_ids.every(id => methods.some(m => m.id === id)), 'Requested method does not belong to direction_id')
    methods = method_ids.map(id => methods.find(m => m.id === id))
  }
  return {version:catalog.version, policy:catalog.policy,
    ...(direction_id ? {direction:catalog.directions.find(d => d.id === direction_id)} : {directions:catalog.directions}),
    methods:summary_only ? methods.map(({id,direction,title,when})=>({id,direction,title,when})) : methods}
}

export function prepareGuidance(workspace) {
  const catalog = loadCatalog()
  const hash = digest(catalog)
  const snapshot = `${folder}/catalog.json`
  const existing = workspacePath(workspace, snapshot)
  if (fs.existsSync(existing)) {
    requireValue(digest(JSON.parse(fs.readFileSync(existing, 'utf8'))) === hash,
      'Workspace uses a different guidance version; use a fresh workspace instead of overwriting it')
  }
  save(workspace, snapshot, JSON.stringify(catalog, null, 2) + '\n')
  save(workspace, `${folder}/catalog.md`, renderCatalog(catalog))
  const example = {
    task_summary: 'Replace this example with a summary grounded in the current task and authorized inputs.',
    direction_decisions: catalog.directions.map(d => ({ direction_id: d.id, status: d.id === 'compare' ? 'selected' : 'deferred',
      reason: 'Replace with a task-specific reason; deferred directions require reassessment when evidence changes.' })),
    claims: [{ id: 'claim-1', objective: 'Test a task-specific comparative claim.', method_ids: ['baseline-comparison'],
      rationale: 'Explain the evidence gap this method addresses.', owner: 'as-experiment-designer',
      procedure: 'Specify actual data, controls, metrics, resources, and commands or protocol.',
      success_criteria: 'Define a task-justified outcome before execution.', refutation_criteria: 'Define what would contradict the claim.',
      evidence_plan: [{ artifact: 'outputs/comparison.json', report_section: 'Results', purpose: 'Record a fair comparison.' }],
      goal_contract: { intent: 'capability', requirement_ids: ['D1'], source_excerpt: 'Replace with an exact excerpt from INSTRUCTIONS.md.',
        target_conditions: 'State original object, dimensions, protocol, budget, reference and evidence level; mark unknowns explicitly.',
        metrics: [{id:'primary', quantity:'Task-specific primary outcome', unit:'dimensionless', definition:'Define the computed quantity and its independent evaluation population.', acceptance:'Derive a scientific criterion from the current task, never a hidden score.', direction:'maximize'}],
        verification_command: 'Replace with an actual scientific metric verifier, not a file-existence check.' },
      status: 'planned', evidence: [], interpretation: '', next_action: 'Run the planned comparison.' }]
  }
  save(workspace, `${folder}/plan-example.json`, JSON.stringify(example, null, 2) + '\n')
  return { version: catalog.version, catalog_sha256: hash, catalog: `${folder}/catalog.md`, plan: `${folder}/plan.json` }
}

function workspaceCatalog(workspace) {
  const catalog = JSON.parse(fs.readFileSync(workspacePath(workspace, `${folder}/catalog.json`), 'utf8'))
  requireValue(digest(catalog) === digest(loadCatalog()), 'Guidance snapshot does not match installed library')
  return catalog
}

export function validatePlan(plan, catalog, workspace) {
  requireValue(plan && nonempty(plan.task_summary), 'Plan requires task_summary')
  requireValue(Array.isArray(plan.direction_decisions), 'Plan requires direction_decisions')
  const decisions = new Map()
  for (const d of plan.direction_decisions) {
    requireValue(catalog.directions.some(x => x.id === d.direction_id) && !decisions.has(d.direction_id), 'Unknown or duplicate direction')
    requireValue(['selected', 'deferred', 'not_applicable'].includes(d.status) && nonempty(d.reason), 'Direction requires status and reason')
    decisions.set(d.direction_id, d)
  }
  requireValue(decisions.size === catalog.directions.length, 'Assess every broad direction; do not select every method by default')
  requireValue(Array.isArray(plan.claims) && plan.claims.length > 0, 'Plan needs at least one research claim')
  const ids = new Set()
  const usedDirections = new Set()
  for (const c of plan.claims) {
    for (const key of ['id', 'objective', 'rationale', 'owner', 'procedure', 'success_criteria', 'refutation_criteria', 'next_action'])
      requireValue(nonempty(c[key]), `Claim requires ${key}`)
    requireValue(!ids.has(c.id), 'Duplicate claim ID'); ids.add(c.id)
    requireValue(Array.isArray(c.method_ids) && new Set(c.method_ids).size === c.method_ids.length, 'Claim requires unique method_ids')
    if (!c.method_ids.length) requireValue(nonempty(c.library_gap), 'Custom procedures require library_gap')
    for (const id of c.method_ids) {
      const method = catalog.methods.find(m => m.id === id)
      requireValue(method, `Unknown method: ${id}`)
      requireValue(decisions.get(method.direction).status === 'selected', `Method ${id} needs a selected direction`)
      usedDirections.add(method.direction)
    }
    const g = c.goal_contract
    requireValue(g && ['capability','hypothesis','delivery'].includes(g.intent), 'Claim requires goal_contract and declared intent')
    requireValue(Array.isArray(g.requirement_ids) && g.requirement_ids.length > 0 && g.requirement_ids.every(nonempty), 'Map original requirement_ids')
    for (const key of ['source_excerpt','target_conditions','verification_command']) requireValue(nonempty(g[key]), 'Goal contract requires ' + key)
    requireValue(Array.isArray(g.metrics) && g.metrics.length > 0 && new Set(g.metrics.map(m=>m.id)).size === g.metrics.length, 'Declare unique scientific metrics')
    for (const m of g.metrics) {
      for (const key of ['id','quantity','unit','definition','acceptance','direction']) requireValue(nonempty(m[key]), 'Metric requires ' + key)
      if (m.check) {
        requireValue(['lt','lte','gt','gte','eq'].includes(m.check.operator), 'Invalid metric operator')
        outputPath(workspace, m.check.artifact)
        requireValue(typeof m.check.pointer === 'string' && m.check.pointer.startsWith('/'), 'Metric check requires JSON pointer')
        if (m.check.reference) { outputPath(workspace,m.check.reference.artifact); requireValue(typeof m.check.reference.pointer === 'string' && m.check.reference.pointer.startsWith('/'), 'Reference requires JSON pointer') }
        else requireValue(Number.isFinite(m.check.threshold), 'Metric threshold must be finite')
      }
    }
    requireValue(Array.isArray(c.evidence_plan) && c.evidence_plan.length > 0, 'Claim needs evidence_plan')
    const artifacts = new Set()
    for (const item of c.evidence_plan) {
      requireValue(nonempty(item.artifact) && nonempty(item.report_section) && nonempty(item.purpose), 'Evidence plan needs artifact, report_section and purpose')
      outputPath(workspace, item.artifact)
      requireValue(!item.artifact.startsWith(folder + '/'), 'Guidance files are not scientific evidence')
      requireValue(!artifacts.has(item.artifact), 'Duplicate planned artifact'); artifacts.add(item.artifact)
    }
    requireValue(['planned', 'supported', 'refuted', 'inconclusive', 'blocked'].includes(c.status), 'Invalid claim status')
    requireValue(Array.isArray(c.evidence) && new Set(c.evidence).size === c.evidence.length, 'Claim requires unique evidence paths')
    for (const artifact of c.evidence) requireValue(artifacts.has(artifact), 'Evidence must occur in evidence_plan; revise the plan explicitly when adding artifacts')
    if (['supported', 'refuted'].includes(c.status)) requireValue(c.evidence.length > 0, 'A resolved claim requires evidence')
    if (c.status !== 'planned') requireValue(nonempty(c.interpretation), 'Evaluated claims require interpretation')
  }
  for (const [id, decision] of decisions)
    requireValue(decision.status !== 'selected' || usedDirections.has(id), `Selected direction ${id} has no claim`)
  return plan
}

export function writePlan(workspace, input) {
  const catalog = workspaceCatalog(workspace)
  validatePlan(input, catalog, workspace)
  const baselinePath = workspacePath(workspace, folder + '/goal-baseline.json')
  const baseline = fs.existsSync(baselinePath) ? JSON.parse(fs.readFileSync(baselinePath,'utf8')) : {}
  for (const [id, goal] of Object.entries(baseline))
    requireValue(input.claims.some(c=>c.id === id && JSON.stringify(c.goal_contract) === JSON.stringify(goal)), 'Original goal contracts cannot be removed or changed; add a separate claim for a substitute')
  const plan = { ...input, library_version: catalog.version, catalog_sha256: digest(catalog), saved_at: new Date().toISOString() }
  const target = workspacePath(workspace, `${folder}/plan.json`)
  // Preserve prior plans for changes to criteria and research procedures to remain visible.
  if (fs.existsSync(target)) {
    const previous = JSON.parse(fs.readFileSync(target, 'utf8'))
    const design = value => value.claims.map(c => [c.id, c.objective, c.method_ids, c.procedure, c.success_criteria, c.refutation_criteria])
    if (JSON.stringify(design(previous)) !== JSON.stringify(design(plan)))
      requireValue(nonempty(plan.revision_reason), 'Research design changes require revision_reason; do not silently change criteria after observing outcomes')
    save(workspace, `${folder}/history/${crypto.randomUUID()}.json`, fs.readFileSync(target, 'utf8'))
  }
  for (const c of plan.claims) baseline[c.id] ||= c.goal_contract
  save(workspace, folder + '/goal-baseline.json', JSON.stringify(baseline,null,2) + '\n')
  save(workspace, `${folder}/plan.json`, JSON.stringify(plan, null, 2) + '\n')
  return { status: 'saved', plan: `${folder}/plan.json`, claims: plan.claims.length }
}

export function auditGuidance(workspace) {
  const catalog = workspaceCatalog(workspace)
  const plan = JSON.parse(fs.readFileSync(workspacePath(workspace, `${folder}/plan.json`), 'utf8'))
  validatePlan(plan, catalog, workspace)
  requireValue(plan.library_version === catalog.version && plan.catalog_sha256 === digest(catalog), 'Plan library version mismatch')
  const issues = []
  const unresolved = []
  for (const c of plan.claims) {
    if (['planned', 'blocked', 'inconclusive'].includes(c.status)) unresolved.push({ claim_id: c.id, status: c.status, next_action: c.next_action })
    for (const artifact of c.evidence) {
      const target = outputPath(workspace, artifact)
      if (!fs.existsSync(target) || !fs.statSync(target).isFile() || fs.statSync(target).size === 0)
        issues.push({ claim_id: c.id, artifact, problem: 'Evidence file missing, empty, or not a file' })
    }
  }
  const result = { status: issues.length ? 'invalid_references' : 'references_checked', library_version: catalog.version,
    catalog_sha256: digest(catalog), issues, unresolved,
    scientific_review_required: true,
    notice: 'Structural audit only. File presence does not validate content, causal inference, metric correctness, or report coverage. Refuted claims can be valid findings. Review deferred directions, report limitations, and evidence quality independently.' }
  save(workspace, `${folder}/audit.json`, JSON.stringify(result, null, 2) + '\n')
  return result
}
