import { digest, dimensions } from '../.opencode/lib/research-contract.mjs'
export function completeLedger() {
  return { schema_version:'3.0', overall_status:'completed', execution_status:'succeeded',
    scope_review:{status:'passed',reviewer:'as-research-planner',evidence_paths:['outputs/coverage.md'],units:[{id:'T1',sha256:digest('Evaluate the defined cohort with independent repeated runs.'),disposition:'requirement',rationale:'Cohort comparison is the scientific objective',item_ids:['D1']}]}, items:[{
    id:'D1',requirement:'Evaluate the defined cohort against the matched baseline',source_type:'explicit',
    source:'INSTRUCTIONS.md',source_excerpt_or_rationale:'Evaluate the defined cohort',priority:'P0',
    acceptance_criteria:['Report matched comparison and uncertainty'],target_conditions:{entities:'The full cohort',repeats:'Independent repeated runs'},depends_on:[],
    data_requirements:dimensions.map(dimension=>({dimension,expected:dimension==='entities'?'The full cohort':dimension==='repeats'?'Independent repeated runs':'unspecified',observed:'Fixture input inspection',status:['entities','repeats'].includes(dimension)?'matched':'unspecified',rationale:'Task and actual input were inspected; unspecified conditions are not fabricated',evidence_paths:['outputs/result.json']})),
    figure_requirements:[],no_figure_reason:'This fixture is a numerical comparison only',
    status:'verified',evidence_paths:['outputs/result.json'],report_locations:['Results, Figure 1'],
    result_origin:{kind:'reference_rerun',description:'Official baseline executed this run; provenance disclosed'},
    verification:{reviewer:'as-independent-reviewer',verdict:'passed',
      checks:[{criterion:'Report matched comparison and uncertainty',matched:true,observation:'The result and uncertainty are present',evidence_paths:['outputs/result.json']}],
      conditions:[{name:'entities',expected:'The full cohort',observed:'Full cohort in result file',matched:true,evidence_paths:['outputs/result.json']},
        {name:'repeats',expected:'Independent repeated runs',observed:'Independent run IDs in output',matched:true,evidence_paths:['outputs/result.json']}]}}],
    final_reviews:{reliability:{status:'passed',reviewer:'as-independent-reviewer',evidence_paths:['outputs/reliability.md']},
      goal_coverage:{status:'passed',reviewer:'as-quality-citation-auditor',evidence_paths:['outputs/coverage.md']}} }
}
