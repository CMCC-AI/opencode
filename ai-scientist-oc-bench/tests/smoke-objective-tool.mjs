import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import tool from '../.opencode/tools/objective-audit.ts'
import { completeLedger } from './objective-fixture.mjs'
const workspace=fs.mkdtempSync(path.join(os.tmpdir(),'objective-tool-'))
try {
  fs.writeFileSync(path.join(workspace,'INSTRUCTIONS.md'),'Evaluate the defined cohort with independent repeated runs.')
  const prepared=JSON.parse(await tool.execute({workspace,operation:'prepare'}))
  assert.match(prepared.task_sha256,/^[a-f0-9]{64}$/)
  assert.equal(JSON.parse(await tool.execute({workspace,operation:'audit'})).original_goal,'incomplete')
  for(const p of ['outputs/result.json','outputs/reliability.md','outputs/coverage.md']) fs.writeFileSync(path.join(workspace,p),'Actual integration fixture evidence')
  assert.equal(JSON.parse(await tool.execute({workspace,operation:'save',ledger_json:JSON.stringify(completeLedger())})).original_goal,'completed')
  assert.equal(JSON.parse(await tool.execute({workspace,operation:'audit'})).contract_status,'passed')
  const ledgerPath=path.join(workspace,'outputs/task-deliverables.json')
  fs.writeFileSync(ledgerPath,JSON.stringify(completeLedger()))
  assert.equal(JSON.parse(await tool.execute({workspace,operation:'save',ledger_path:'outputs/task-deliverables.json'})).original_goal,'completed')
  assert.equal(JSON.parse(await tool.execute({workspace,operation:'save',ledger_json:'@outputs/task-deliverables.json'})).original_goal,'completed')
  await assert.rejects(()=>tool.execute({workspace,operation:'save',ledger_path:'../outside.json'}),/ledger_path/)
  console.log('PASS: actual OpenCode objective-audit tool prepare/save/audit')
} finally {fs.rmSync(workspace,{recursive:true,force:true})}
