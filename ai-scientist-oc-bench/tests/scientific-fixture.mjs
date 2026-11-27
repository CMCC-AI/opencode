import fs from 'node:fs'
import path from 'node:path'
import {prepareGuidance, writePlan} from '../.opencode/lib/research-guidance.mjs'
import {saveScientificReview} from '../.opencode/lib/scientific-quality.mjs'

export function completeScientificFixture(w, {verification_command} = {}) {
  prepareGuidance(w)
  const plan=JSON.parse(fs.readFileSync(path.join(w,'outputs/research-guidance/plan-example.json'),'utf8'))
  const c=plan.claims[0]
  c.goal_contract.source_excerpt='Evaluate the defined cohort'
  c.goal_contract.metrics[0]={id:'primary',quantity:'Fixture comparative quality',unit:'dimensionless',definition:'Actual synthetic fixture value, not a scientific benchmark result',acceptance:'Method exceeds matched baseline',direction:'maximize',check:{artifact:'outputs/scientific-fixture.json',pointer:'/method',operator:'gt',reference:{artifact:'outputs/scientific-fixture.json',pointer:'/baseline'}}}
  c.goal_contract.verification_command='node -e "const f=require(\'fs\');const r=JSON.parse(f.readFileSync(\'outputs/scientific-fixture.json\'));if(!(r.method>r.baseline))process.exit(1)"'
  if (verification_command) c.goal_contract.verification_command=verification_command
  c.evidence_plan=[{artifact:'outputs/scientific-fixture.json',report_section:'Results',purpose:'Synthetic integration fixture comparison'}]
  fs.writeFileSync(path.join(w,'outputs/scientific-fixture.json'),JSON.stringify({method:0.8,baseline:0.5}))
  c.status='supported';c.evidence=['outputs/scientific-fixture.json'];c.interpretation='Independent integration fixture only.'
  writePlan(w,plan)
  saveScientificReview(w,{claim_id:c.id,reviewer:'as-independent-reviewer',alignment:'matched',observation:'Fixture matches the declared cohort comparison',criteria:[{metric_id:'primary',status:'met',observed:'Method 0.8 exceeds baseline 0.5',unit:'dimensionless'}],evidence_paths:c.evidence})
  return plan
}
