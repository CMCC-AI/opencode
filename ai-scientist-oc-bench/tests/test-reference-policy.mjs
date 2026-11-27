import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {loadCatalog,renderCatalog} from '../.opencode/lib/research-guidance.mjs'
const root=new URL('../',import.meta.url)
const read=p=>fs.readFileSync(new URL(p,root),'utf8')
test('rendered runtime guidance cannot route users to seeded target sources',()=>{
  const output=renderCatalog(loadCatalog())
  assert.doesNotMatch(output,/https?:\/\/|github\.com|AlphaGeometry|alphafold3|Uncalled4|ByteTrack|FlyVis|\bDELVE\b/i)
  assert.match(output,/reading-only references/)
  assert.match(output,/angstrom/)
  assert.match(output,/PyTorch/)
})
test('every worker and launcher receive the same reading-only policy',()=>{
  const policy=read('benchmark/resource-policy.md')
  assert.match(policy,/Do not clone, install, execute, import or adapt/)
  assert.match(policy,/Do not suppress target-related access/)
  assert.match(read('scripts/ai-scientist-oc-bench'),/resource_policy/)
  for(const file of fs.readdirSync(new URL('.opencode/agents/',root))){
    const prompt=read('.opencode/agents/'+file)
    assert.doesNotMatch(prompt,/允许获取、阅读和运行目标论文|reference-use-v2|reference_run/)
  }
})
