import fs from 'node:fs'
import crypto from 'node:crypto'
import { workspacePath, validatePlan, loadCatalog } from './research-guidance.mjs'

const BASE = 'outputs/research-guidance'
const hash = x => crypto.createHash('sha256').update(x).digest('hex')
const text = x => typeof x === 'string' && x.trim().length > 0
const need = (ok, why) => { if (!ok) throw Error(why) }
const read = (w, p) => JSON.parse(fs.readFileSync(workspacePath(w, p), 'utf8'))
const design = c => JSON.stringify([c.objective, c.method_ids, c.procedure, c.success_criteria, c.refutation_criteria, c.goal_contract])
function evidenceHash(w, p) {
  need(/^(code|outputs|report|data|related_work)\//.test(p) || p === 'INSTRUCTIONS.md', 'Use authorized scientific evidence')
  need(!p.split('/').some(s => /^(target_study|evaluation|checklist.*|_?score[.]json)$/i.test(s)), 'Hidden evaluation evidence is forbidden')
  const file = workspacePath(w,p)
  need(fs.statSync(file).isFile() && fs.statSync(file).size > 0, 'Empty scientific evidence: ' + p)
  const fd=fs.openSync(file,'r'), digest=crypto.createHash('sha256'), buffer=Buffer.alloc(1024*1024)
  try { let n; while ((n=fs.readSync(fd,buffer,0,buffer.length,null))>0) digest.update(buffer.subarray(0,n)) }
  finally { fs.closeSync(fd) }
  return digest.digest('hex')
}
function measured(w, spec) {
  const obj = read(w, spec.artifact)
  need(typeof spec.pointer === 'string' && spec.pointer.startsWith('/'), 'Metric requires a JSON pointer')
  const value = spec.pointer.slice(1).split('/').reduce((v, k) => v?.[k.replace(/~1/g, '/').replace(/~0/g, '~')], obj)
  need(typeof value === 'number' && Number.isFinite(value), 'Metric must resolve to a finite number')
  return value
}
export function checkMetricAssertions(w, contract) {
  const failures = []
  for (const m of contract.metrics) {
    if (!m.check) continue
    try {
      const a = measured(w, m.check)
      const b = m.check.reference ? measured(w, m.check.reference) : m.check.threshold
      need(typeof b === 'number' && Number.isFinite(b), 'Metric needs a finite threshold or reference')
      const tests = {lt: () => a < b, lte: () => a <= b, gt: () => a > b, gte: () => a >= b, eq: () => a === b}
      need(tests[m.check.operator], 'Unsupported metric comparison')
      if (!tests[m.check.operator]()) failures.push(`${m.id}: observed ${a} ${m.unit}; required ${m.check.operator} ${b}`)
    } catch (e) { failures.push(`${m.id}: ${e.message}`) }
  }
  return failures
}

export function saveScientificReview(w, input) {
  const plan = read(w, BASE + '/plan.json'), c = plan.claims.find(x => x.id === input.claim_id)
  need(c, 'Unknown scientific claim')
  need(['as-independent-reviewer', 'as-quality-citation-auditor'].includes(input.reviewer), 'An independent scientific reviewer is required')
  need(['matched', 'major_deviation', 'unverified'].includes(input.alignment), 'Review needs goal alignment')
  need(text(input.observation), 'Review requires an observed comparison to the original goal')
  need(Array.isArray(input.criteria) && input.criteria.length === c.goal_contract.metrics.length, 'Review every declared metric exactly once')
  need(new Set(input.criteria.map(x => x.metric_id)).size === input.criteria.length, 'Duplicate metric review')
  for (const m of c.goal_contract.metrics) {
    const r = input.criteria.find(x => x.metric_id === m.id)
    need(r && ['met', 'not_met', 'missing'].includes(r.status) && text(r.observed), 'Missing scientific metric assessment')
    need(r.unit === m.unit, 'Metric units must match the frozen contract; conversion requires explicit evidence')
  }
  need(Array.isArray(input.evidence_paths) && input.evidence_paths.length, 'Scientific review needs actual output evidence')
  need(input.evidence_paths.some(p => c.evidence.includes(p)), 'Review must inspect the evaluated claim evidence')
  const paths = [...new Set(['INSTRUCTIONS.md', ...c.evidence, ...input.evidence_paths])]
  const evidence_hashes = Object.fromEntries(paths.map(p => [p, evidenceHash(w, p)]))
  const record = {...input, design_sha256: hash(design(c)), evidence_hashes, reviewed_at: new Date().toISOString()}
  const file = BASE + '/scientific-reviews/' + hash(c.id).slice(0,24) + '.json'
  fs.mkdirSync(workspacePath(w, BASE + '/scientific-reviews'), {recursive:true})
  if (fs.existsSync(workspacePath(w, file))) {
    fs.mkdirSync(workspacePath(w, BASE + '/scientific-review-history'), {recursive:true})
    fs.copyFileSync(workspacePath(w, file), workspacePath(w, BASE + '/scientific-review-history/' + crypto.randomUUID() + '.json'))
  }
  fs.writeFileSync(workspacePath(w, file), JSON.stringify(record, null, 2) + '\n')
  return {status:'saved', review:file}
}

export function auditScientificQuality(w, {final = true} = {}) {
  const issues = []
  let plan
  try {
    plan = read(w, BASE + '/plan.json')
    validatePlan(plan, loadCatalog(), w)
    const baseline = read(w, BASE + '/goal-baseline.json')
    for (const [id, contract] of Object.entries(baseline)) {
      const c = plan.claims.find(x => x.id === id)
      need(c && JSON.stringify(c.goal_contract) === JSON.stringify(contract), 'Original goal contract removed or altered: ' + id)
    }
  } catch (e) {
    issues.push({claim_id:'planning', problem:e.message})
  }
  if (plan && !issues.length) {
    const instructions = fs.existsSync(workspacePath(w, 'INSTRUCTIONS.md')) ? fs.readFileSync(workspacePath(w, 'INSTRUCTIONS.md'), 'utf8') : ''
    for (const c of plan.claims) {
      if (!final && c.status === 'planned') continue
      const problems = [], g = c.goal_contract
      if (!instructions.includes(g.source_excerpt)) problems.push('Goal source excerpt is not present in original task')
      if (c.status === 'planned') problems.push('Scientific experiment remains unexecuted')
      if (g.intent === 'capability' && c.status !== 'supported') problems.push('Required capability has not been established; a valid negative finding does not complete it')
      const numeric = checkMetricAssertions(w, g)
      problems.push(...numeric)
      const reviewPath = BASE + '/scientific-reviews/' + hash(c.id).slice(0,24) + '.json'

      try {
        if (!final && !fs.existsSync(workspacePath(w,reviewPath))) {
          // Outcome updates can precede independent review. Measured failures remain visible in the audit.
          if (problems.length) {

            issues.push(...problems.map(problem => ({claim_id:c.id,problem})))
          }
          continue
        }
        const review = read(w, reviewPath)
        need(review.design_sha256 === hash(design(c)), 'Scientific review is stale after design changes')
        for (const [p, sha] of Object.entries(review.evidence_hashes)) need(evidenceHash(w, p) === sha, 'Scientific review is stale after evidence changes: ' + p)
        need(c.evidence.every(p => review.evidence_hashes[p]), 'Review does not cover all current evidence')


        need(review.alignment === 'matched', 'Actual experiment substantially deviates from the original goal or alignment is unverified')
        for (const m of g.metrics) {
          const r = review.criteria.find(x => x.metric_id === m.id)
          need(r?.status === 'met' && r.unit === m.unit, 'Scientific criterion not met: ' + m.id)
        }
      } catch (e) { problems.push(e.code === 'ENOENT' ? 'Independent scientific outcome review is missing' : e.message) }
      if (problems.length) {

        issues.push(...problems.map(problem => ({claim_id:c.id, problem})))
      }
    }
    try {
      const ledger = read(w, 'outputs/task-deliverables.json')
      for (const item of ledger.items.filter(x => x.priority === 'P0'))
        need(plan.claims.some(c => c.goal_contract.requirement_ids.includes(item.id)), 'P0 has no scientific goal mapping: ' + item.id)
    } catch (e) { issues.push({claim_id:'planning', problem:e.message}) }
  }
  const result = {status:issues.length ? 'failed' : 'passed', scientific_goal_status:issues.length ? 'incomplete' : final ? 'verified' : 'pending_final_review', issues,
    notice:'Scientific outcome gate combines frozen task contracts, measured metric checks and independent content assessments. It is not an automatic proof of scientific correctness.'}
  fs.mkdirSync(workspacePath(w, BASE), {recursive:true})
  const auditPath = BASE + '/scientific-audit.json'
  fs.writeFileSync(workspacePath(w, auditPath), JSON.stringify(result, null, 2) + '\n')
  return result
}
