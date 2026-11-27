import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { completeLedger } from './objective-fixture.mjs'
import { writeObjectives } from '../.opencode/lib/objective-audit.mjs'
import { digest } from '../.opencode/lib/research-contract.mjs'
function fixture(t) {
  const w=fs.mkdtempSync(path.join(os.tmpdir(),'research-contract-'))
  t.after(()=>fs.rmSync(w,{recursive:true,force:true}))
  fs.mkdirSync(path.join(w,'outputs'),{recursive:true})
  fs.mkdirSync(path.join(w,'report/images'),{recursive:true})
  fs.writeFileSync(path.join(w,'INSTRUCTIONS.md'),'Evaluate the defined cohort with independent repeated runs.')
  for(const p of ['result.json','reliability.md','coverage.md'])fs.writeFileSync(path.join(w,'outputs',p),'Actual test evidence')
  return w
}
test('source coverage cannot be replaced by a passing final review',t=>{
  const w=fixture(t),l=completeLedger();delete l.scope_review
  assert.match(writeObjectives(w,l).issues.join(' '),/source.*scope review|source coverage/)
})
test('unmapped task paragraphs fail even when a narrow ledger is fully verified',t=>{
  const w=fixture(t),l=completeLedger()
  fs.appendFileSync(path.join(w,'INSTRUCTIONS.md'),'\n\nReport an external validation comparison.')
  assert.match(writeObjectives(w,l).issues.join(' '),/T2: missing source coverage/)
})
test('missing truth triggers recovery and prevents verified status',t=>{
  const w=fixture(t),l=completeLedger(),r=l.items[0].data_requirements.find(x=>x.dimension==='ground_truth')
  r.expected='Independent truth labels';r.status='missing';r.observed='No truth labels in inspected inputs'
  const a=writeObjectives(w,l)
  assert.deepEqual(a.recovery_required,['D1']);assert.equal(a.original_goal,'incomplete')
  assert.match(a.issues.join(' '),/must trigger resource recovery/)
})
test('search and downloads alone do not resolve a scientific resource gap',t=>{
  const w=fixture(t),l=completeLedger(),i=l.items[0]
  i.gap='Required external truth was absent'
  i.recovery={state:'resolved',reason:'Found a source',next_action:'Compare results',attempts:[{stage:'search',action:'Search official sources',outcome:'Candidate found',succeeded:true,evidence_paths:['outputs/result.json']}]}
  assert.match(writeObjectives(w,l).issues.join(' '),/successful acquire evidence/)
  for(const stage of ['acquire','validate','smoke_test','experiment'])i.recovery.attempts.push({stage,action:'Executed '+stage,outcome:'Successful fixture stage',succeeded:true,evidence_paths:['outputs/result.json']})
  assert.equal(writeObjectives(w,l).original_goal,'completed')
})
function figure(l,w) {
  const f={id:'F1',purpose:'Show response coverage over threshold',variables:'Threshold and fraction covered',grouping:'Separate independent cohorts',statistical_unit:'Cohort',uncertainty:'95% interval across independent runs',representation:'Continuous threshold curves'}
  l.items[0].figure_requirements=[f];delete l.items[0].no_figure_reason
  const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64')
  fs.writeFileSync(path.join(w,'report/images/main.png'),bytes)
  const v={id:'F1',matched:true,image_inspected:true,reviewer:'as-figure-citation-editor',observation:'Actual image and underlying data inspected',image_path:'report/images/main.png',image_sha256:digest(bytes),data_paths:['outputs/result.json'],checks:['variables','grouping','statistical_unit','uncertainty','representation'].map(name=>({name,expected:f[name],observed:f[name],matched:true}))}
  l.items[0].verification.figures=[v];return v
}
test('a PNG file alone cannot establish scientific figure completeness',t=>{
  const w=fixture(t),l=completeLedger(),v=figure(l,w)
  v.image_inspected=false
  assert.match(writeObjectives(w,l).issues.join(' '),/actual image content/)
})
test('wrong plot semantics and modified reviewed image fail; matched review passes',t=>{
  const w=fixture(t),l=completeLedger(),v=figure(l,w)
  assert.equal(writeObjectives(w,l).original_goal,'completed')
  v.checks.find(x=>x.name==='representation').matched=false
  assert.match(writeObjectives(w,l).issues.join(' '),/scientific check representation/)
  v.checks.find(x=>x.name==='representation').matched=true
  fs.appendFileSync(path.join(w,'report/images/main.png'),'changed')
  assert.match(writeObjectives(w,l).issues.join(' '),/image changed/)
})
test('credible partial execution keeps reliability separate from original completion',t=>{
  const w=fixture(t),l=completeLedger();l.items[0].status='pending';l.overall_status='incomplete'
  const a=writeObjectives(w,l)
  assert.equal(a.execution_status,'succeeded');assert.equal(a.evidence_reliability,'reviewed');assert.equal(a.original_goal,'incomplete')
})
test('observations may update but original data expectations cannot shrink',t=>{
  const w=fixture(t),l=completeLedger();writeObjectives(w,l)
  l.items[0].data_requirements[0].observed='New inspection of the same full cohort'
  assert.equal(writeObjectives(w,l).original_goal,'completed')
  l.items[0].data_requirements[0].expected='Only the convenient subset'
  assert.throws(()=>writeObjectives(w,l),/cannot be removed or rewritten/)
})
test('local computation recovery does not require an external download',t=>{
  const w=fixture(t),l=completeLedger(),i=l.items[0]
  i.gap='Required comparison had not been computed'
  i.recovery={kind:'computation',state:'resolved',reason:'Recomputed locally',next_action:'Report the comparison',attempts:['validate','experiment'].map(stage=>({stage,action:'Executed '+stage,outcome:'Local calculation succeeded',succeeded:true,evidence_paths:['outputs/result.json']}))}
  assert.equal(writeObjectives(w,l).original_goal,'completed')
})
