import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { prepareObjectives, writeObjectives, auditObjectives } from '../.opencode/lib/objective-audit.mjs'

function put(w,p,s='Actual fixture evidence') { const f=path.join(w,p);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,s) }
import { completeLedger } from './objective-fixture.mjs'
function fixture(t) {
  const w=fs.mkdtempSync(path.join(os.tmpdir(),'objective audit '));t.after(()=>fs.rmSync(w,{recursive:true,force:true}))
  put(w,'INSTRUCTIONS.md','Evaluate the defined cohort with independent repeated runs.')
  for(const p of ['outputs/result.json','outputs/reliability.md','outputs/coverage.md'])put(w,p)
  return w
}
test('complete reference rerun passes; pending work stays incomplete',t=>{
  const w=fixture(t),l=completeLedger(); assert.equal(writeObjectives(w,l).original_goal,'completed')
  l.items[0].status='pending';l.overall_status='in_progress';assert.equal(writeObjectives(w,l).original_goal,'incomplete')
})
test('preserves original objective, priorities, conditions and acceptance criteria',t=>{
  const w=fixture(t),l=completeLedger();writeObjectives(w,l)
  for(const change of [x=>x.items.pop(),x=>x.items[0].priority='P2',x=>x.items[0].target_conditions.entities='A convenient subset',x=>x.items[0].acceptance_criteria=['Draw any plot']]){
    const next=structuredClone(l);change(next);assert.throws(()=>writeObjectives(w,next))
  }
  assert.throws(()=>{put(w,'INSTRUCTIONS.md','A smaller task');prepareObjectives(w)},/instructions changed/)
})
test('direct ledger edits cannot bypass the saved baseline',t=>{
  const w=fixture(t),l=completeLedger();writeObjectives(w,l);l.items[0].requirement='A smaller objective';put(w,'outputs/task-deliverables.json',JSON.stringify(l))
  assert.match(auditObjectives(w).issues.join(' '),/cannot be removed or rewritten/)
})
test('missing ledger, fake verification, missing results and condition mismatch fail closed',t=>{
  const w=fixture(t);assert.equal(auditObjectives(w).original_goal,'incomplete')
  const l=completeLedger();writeObjectives(w,l)
  l.items[0].verification.conditions[0].matched=false;assert.match(writeObjectives(w,l).issues.join(' '),/condition entities/)
  l.items[0].verification.conditions[0].matched=true;l.items[0].verification.reviewer='chief';assert.match(writeObjectives(w,l).issues.join(' '),/independent/)
  l.items[0].verification.reviewer='as-independent-reviewer';fs.unlinkSync(path.join(w,'outputs/result.json'));assert.equal(writeObjectives(w,l).original_goal,'incomplete')
})
test('missing core resources require actual recovery evidence; permissions need no unauthorized access',t=>{
  const w=fixture(t),l=completeLedger();l.items[0].status='blocked';l.items[0].gap='Required truth is unavailable';l.overall_status='incomplete'
  assert.match(writeObjectives(w,l).issues.join(' '),/recovery/)
  l.items[0].recovery={state:'permission_blocked',reason:'Task prohibits external inputs',next_action:'Request an authorized future dataset',attempts:[{stage:'restriction_check',action:'Read task restrictions',outcome:'External scientific inputs prohibited',evidence_paths:['outputs/restrictions.md']}]}
  put(w,'outputs/restrictions.md','Actual task restriction was inspected')
  const audit=writeObjectives(w,l);assert.deepEqual(audit.issues,[]);assert.deepEqual(audit.unresolved_p0,['D1']);assert.equal(audit.original_goal,'incomplete')
})
test('valid negative results pass; inconsistent inputs remain incomplete',t=>{
  const w=fixture(t),l=completeLedger();l.items[0].verification.checks[0].observation='The preregistered effect was refuted under matched conditions'
  assert.equal(writeObjectives(w,l).original_goal,'completed')
  l.items[0].status='blocked';l.items[0].gap='Input identity contradicts task assumptions';l.overall_status='incomplete'
  l.items[0].recovery={state:'input_inconsistent',reason:'Actual input has incompatible entities',next_action:'Obtain corrected inputs; preserve the negative-control analysis',attempts:[{stage:'validate',action:'Inspect input identities',outcome:'Identity mismatch confirmed',evidence_paths:['outputs/result.json']}]}
  assert.equal(writeObjectives(w,l).original_goal,'incomplete')
})
test('independent review axes cannot substitute for each other',t=>{
  const w=fixture(t),l=completeLedger();l.final_reviews.goal_coverage.status='failed'
  const result=writeObjectives(w,l)
  assert.match(result.issues.join(' '),/goal_coverage/);assert.equal(result.original_goal,'incomplete');assert.equal(result.evidence_reliability,'reviewed')
})
test('new discoveries extend the baseline, missing review checks and cyclic dependencies fail',t=>{
  const w=fixture(t),l=completeLedger();writeObjectives(w,l)
  const second=structuredClone(l.items[0]);second.id='D2';second.status='pending';second.depends_on=['D1'];l.items.push(second);l.overall_status='in_progress'
  assert.deepEqual(writeObjectives(w,l).unresolved_p0,['D2']);l.items.pop();assert.throws(()=>writeObjectives(w,l),/D2/)
  l.items.push(second);l.items[0].depends_on=['D2'];assert.throws(()=>writeObjectives(w,l),/Cyclic/)
})
test('does not open hidden answer paths, escaping paths or allow code-only verification',t=>{
  const w=fixture(t),l=completeLedger();writeObjectives(w,l)
  for(const p of ['../outside.json','data/target_study/checklist.json','outputs/score.json','code/analysis.py','outputs/objective-audit/audit.json']){
    l.items[0].evidence_paths=[p];assert.equal(writeObjectives(w,l).original_goal,'incomplete')
  }
})
test('CLI returns nonzero for unfinished goals and success for a complete ledger',t=>{
  const w=fixture(t),cli=new URL('../scripts/objective-audit.mjs',import.meta.url)
  const run=()=>spawnSync(process.execPath,[fileURLToPath(cli),'audit',w],{encoding:'utf8'})
  assert.notEqual(run().status,0);writeObjectives(w,completeLedger());assert.equal(run().status,0)
})
