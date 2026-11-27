import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {completeScientificFixture} from './scientific-fixture.mjs'
import {writePlan} from '../.opencode/lib/research-guidance.mjs'
import {auditScientificQuality,saveScientificReview} from '../.opencode/lib/scientific-quality.mjs'

function fixture(t, options) {
  const w=fs.mkdtempSync(path.join(os.tmpdir(),'scientific quality '))
  t.after(()=>fs.rmSync(w,{recursive:true,force:true}))
  fs.mkdirSync(path.join(w,'outputs'))
  fs.writeFileSync(path.join(w,'INSTRUCTIONS.md'),'Evaluate the defined cohort against a matched baseline.')
  fs.writeFileSync(path.join(w,'outputs/task-deliverables.json'),JSON.stringify({items:[{id:'D1',priority:'P0'}]}))
  const p=completeScientificFixture(w,options)
  return {w,p}
}
const review=(p,overrides={})=>({claim_id:p.claims[0].id,reviewer:'as-independent-reviewer',alignment:'matched',observation:'Actual method and original task conditions compared',criteria:[{metric_id:'primary',status:'met',observed:'Actual metric checked',unit:'dimensionless'}],evidence_paths:p.claims[0].evidence,...overrides})

test('adequate independently reviewed capability passes',t=>{
  const {w}=fixture(t)
  assert.equal(auditScientificQuality(w).status,'passed')
  assert.equal(fs.existsSync(path.join(w,'outputs/rsi')),false)
})
test('exit-zero outputs and a supported label cannot hide failing numeric effects',t=>{
  const {w,p}=fixture(t)
  fs.writeFileSync(path.join(w,'outputs/scientific-fixture.json'),JSON.stringify({method:0.3,baseline:0.5}))
  saveScientificReview(w,review(p)) // even a falsely positive reviewer is insufficient
  const a=auditScientificQuality(w)
  assert.equal(a.status,'failed');assert.match(JSON.stringify(a.issues),/required gt/)
  assert.equal(a.repair,undefined)
  assert.equal(fs.existsSync(path.join(w,'outputs/rsi')),false)
})
test('bootstrap or a changed oracle with major goal deviation fails despite good metrics',t=>{
  const {w,p}=fixture(t)
  saveScientificReview(w,review(p,{alignment:'major_deviation',observation:'A different sampler/oracle answered an auxiliary question'}))
  assert.match(JSON.stringify(auditScientificQuality(w).issues),/deviates/)
})
test('missing primary result, review or dimensional alignment fails closed',t=>{
  const {w,p}=fixture(t)
  saveScientificReview(w,review(p,{criteria:[{metric_id:'primary',status:'missing',observed:'Requested dimension was not measured',unit:'dimensionless'}]}))
  assert.equal(auditScientificQuality(w,{record:false}).status,'failed')
  fs.rmSync(path.join(w,'outputs/research-guidance/scientific-reviews'),{recursive:true})
  assert.match(JSON.stringify(auditScientificQuality(w,{record:false}).issues),/review is missing/)
  fs.writeFileSync(path.join(w,'outputs/scientific-fixture.json'),JSON.stringify({baseline:0.5}))
  assert.match(JSON.stringify(auditScientificQuality(w,{record:false}).issues),/finite number/)
})
test('an outcome update can await its first review without a paperwork-only interrupt',t=>{
  const {w}=fixture(t)
  fs.rmSync(path.join(w,'outputs/research-guidance/scientific-reviews'),{recursive:true})
  assert.equal(auditScientificQuality(w,{final:false}).status,'passed')
  assert.equal(fs.existsSync(path.join(w,'outputs/rsi')),false)
  assert.equal(auditScientificQuality(w).status,'failed')
})
test('changed results invalidate a previous independent review',t=>{
  const {w}=fixture(t)
  fs.writeFileSync(path.join(w,'outputs/scientific-fixture.json'),JSON.stringify({method:0.9,baseline:0.5}))
  assert.match(JSON.stringify(auditScientificQuality(w,{record:false}).issues),/stale/)
})
test('deleted evidence fails without creating automatic repair state',t=>{
  const {w}=fixture(t)
  fs.unlinkSync(path.join(w,'outputs/scientific-fixture.json'))
  const a=auditScientificQuality(w)
  assert.equal(a.status,'failed')
  assert.equal(a.repair,undefined)
  assert.equal(fs.existsSync(path.join(w,'outputs/rsi')),false)
})
test('a refuted capability does not become goal completion by honest explanation',t=>{
  const {w,p}=fixture(t)
  p.claims[0].status='refuted';p.claims[0].interpretation='Valid negative capability finding'
  writePlan(w,p)
  assert.match(JSON.stringify(auditScientificQuality(w).issues),/capability has not/)
})
test('a predeclared hypothesis can be adequately tested and refuted without forced retry',t=>{
  const {w,p}=fixture(t)
  // New independent workspace: intent cannot be changed after seeing the result.
  const h=fs.mkdtempSync(path.join(os.tmpdir(),'hypothesis '))
  t.after(()=>fs.rmSync(h,{recursive:true,force:true}))
  fs.cpSync(w,h,{recursive:true})
  fs.rmSync(path.join(h,'outputs/research-guidance/goal-baseline.json'))
  fs.rmSync(path.join(h,'outputs/research-guidance/plan.json'))
  p.claims[0].goal_contract.intent='hypothesis'
  p.claims[0].status='refuted';p.claims[0].interpretation='The tested hypothesis is contradicted by adequate evidence'
  writePlan(h,p);saveScientificReview(h,review(p))
  assert.equal(auditScientificQuality(h).status,'passed')
})
test('cannot weaken acceptance, switch intent, units, delete original claim or reset with a new id',t=>{
  const {w,p}=fixture(t)
  for(const change of [q=>q.claims[0].goal_contract.intent='hypothesis',q=>q.claims[0].goal_contract.metrics[0].unit='eV',q=>q.claims[0].goal_contract.metrics[0].check.operator='lt',q=>q.claims[0].id='replacement']){
    const q=structuredClone(p);q.revision_reason='Try to fit existing outputs';change(q)
    assert.throws(()=>writePlan(w,q),/Original goal contracts/)
  }
  assert.throws(()=>saveScientificReview(w,review(p,{criteria:[{metric_id:'primary',status:'met',observed:'Relabeled',unit:'eV'}]})),/units/)
})
test('unmapped original P0 cannot be hidden by successful auxiliary claims',t=>{
  const {w}=fixture(t)
  fs.writeFileSync(path.join(w,'outputs/task-deliverables.json'),JSON.stringify({items:[{id:'D1',priority:'P0'},{id:'D2',priority:'P0'}]}))
  assert.match(JSON.stringify(auditScientificQuality(w).issues),/P0 has no scientific goal mapping/)
})

test('ordinary correction can pass after fresh review without repair machinery',t=>{
  const {w,p}=fixture(t)
  fs.writeFileSync(path.join(w,'outputs/scientific-fixture.json'),JSON.stringify({method:0.3,baseline:0.5}))
  assert.equal(auditScientificQuality(w).status,'failed')
  fs.writeFileSync(path.join(w,'outputs/scientific-fixture.json'),JSON.stringify({method:0.9,baseline:0.5}))
  saveScientificReview(w,review(p))
  assert.equal(auditScientificQuality(w).status,'passed')
  assert.equal(fs.existsSync(path.join(w,'outputs/rsi')),false)
})
