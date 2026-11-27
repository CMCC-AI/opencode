import fs from 'node:fs'
import crypto from 'node:crypto'
import { workspacePath } from './research-guidance.mjs'
const text = x => typeof x === 'string' && x.trim().length > 0
export const digest = x => crypto.createHash('sha256').update(x).digest('hex')
export const dimensions = ['entities', 'sample_size', 'repeats', 'protocol', 'units', 'baselines', 'ground_truth']
export function taskUnits(workspace) {
  const raw = fs.readFileSync(workspacePath(workspace, 'INSTRUCTIONS.md'), 'utf8')
  const scope = raw.includes('## Research Task') ? raw.split('## Research Task')[1].split('## Execution Protocol')[0] : raw
  const sources = [['INSTRUCTIONS.md', scope]]
  const intro = workspacePath(workspace, 'Introduction.md')
  if (fs.existsSync(intro)) sources.push(['Introduction.md', fs.readFileSync(intro, 'utf8')])
  return sources.flatMap(([source, body]) => body.split(/\n+/).map(x => x.trim()).filter(x => x && !/^#{1,6} [^\n]+$/.test(x)).map(excerpt => ({ source, excerpt })))
    .map((u, i) => ({ id: `T${i + 1}`, ...u, sha256: digest(u.excerpt) }))
}
export function auditResearchContract(workspace, ledger, checkPaths) {
  const issues = [], gaps = []
  const need = (ok, why) => { if (!ok) issues.push(why) }
  const units = taskUnits(workspace), review = ledger.scope_review
  need(review?.status === 'passed' && text(review.reviewer) && review.reviewer !== 'chief', 'Independent source-to-objective scope review is required before completion')
  for (const u of units) {
    const c = review?.units?.find(x => x.id === u.id && x.sha256 === u.sha256)
    need(c && ['requirement', 'input', 'context'].includes(c.disposition) && text(c.rationale), `${u.id}: missing source coverage or rationale`)
    if (c?.disposition === 'requirement') need(c.item_ids?.length && c.item_ids.every(id => ledger.items.some(x => x.id === id)), `${u.id}: source requirement has no ledger mapping`)
  }
  if (review) checkPaths(review.evidence_paths, 'Scope review')
  for (const item of ledger.items) {
    const label = item.id, rows = Array.isArray(item.data_requirements) ? item.data_requirements : []
    need(Array.isArray(rows) && rows.length === dimensions.length && new Set(rows.map(x => x.dimension)).size === dimensions.length, `${label}: provide all seven data requirement dimensions exactly once`)
    for (const name of dimensions) {
      const row = rows?.find(x => x.dimension === name)
      need(row && text(row.expected) && text(row.observed) && text(row.rationale) && ['matched', 'missing', 'mismatch', 'unspecified', 'not_applicable'].includes(row.status), `${label}: invalid data requirement ${name}`)
      if (!row) continue
      if (item.target_conditions[name]) need(row.expected === item.target_conditions[name], `${label}: data requirement ${name} differs from preserved target condition`)
      if (row.status !== 'not_applicable' && row.status !== 'unspecified') checkPaths(row.evidence_paths, `${label} data ${name}`)
      if (['missing', 'mismatch'].includes(row.status)) {
        gaps.push(label)
        need(text(item.gap) && item.recovery?.attempts?.length, `${label}: data gap ${name} must trigger resource recovery`)
        need(item.status !== 'verified', `${label}: incompatible or missing data cannot be verified`)
      }
      if (row.status === 'unspecified') need(row.expected === 'unspecified', `${label}: do not invent target conditions for ${name}`)
    }
    need(Array.isArray(item.figure_requirements), `${label}: figure_requirements must explicitly list scientific plots or be empty with a reason`)
    if (item.figure_requirements?.length === 0) need(text(item.no_figure_reason), `${label}: explain why no figure is needed`)
    for (const f of item.figure_requirements || []) {
      need(['id', 'purpose', 'variables', 'grouping', 'statistical_unit', 'uncertainty', 'representation'].every(k => text(f[k])), `${label}: incomplete scientific figure contract`)
      if (item.status !== 'verified') continue
      const v = item.verification?.figures?.find(x => x.id === f.id)
      need(v?.matched === true && v.image_inspected === true && text(v.observation) && v.reviewer !== 'chief' && text(v.reviewer), `${label}: actual image content must be independently inspected`)
      if (!v) continue
      checkPaths(v.data_paths, `${label} figure source`, true)
      checkPaths([v.image_path], `${label} figure image`, true)
      try {
        need(/^report\/images\/.+\.png$/.test(v.image_path), `${label}: figure must be a report PNG`)
        const bytes = fs.readFileSync(workspacePath(workspace, v.image_path))
        need(bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])), `${label}: invalid PNG signature`)
        need(v.image_sha256 === digest(bytes), `${label}: image changed since visual review`)
      } catch { issues.push(`${label}: figure image is unavailable`) }
      for (const name of ['variables', 'grouping', 'statistical_unit', 'uncertainty', 'representation']) {
        const c = v.checks?.find(x => x.name === name)
        need(c?.matched === true && c.expected === f[name] && text(c.observed), `${label}: figure ${f.id} failed scientific check ${name}`)
      }
    }
  }
  return { issues, gaps: [...new Set(gaps)] }
}
