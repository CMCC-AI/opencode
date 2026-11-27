import { auditScientificQuality, saveScientificReview } from '../lib/scientific-quality.mjs'
import { tool } from '@opencode-ai/plugin'
import z from 'zod'
import { prepareGuidance, renderCatalog, loadCatalog, selectCatalog, writePlan, auditGuidance } from '../lib/research-guidance.mjs'

export default tool({
  description: 'Read research methods, freeze original goal/metric contracts, persist independent outcome reviews, and audit references plus scientific outcomes while reporting unmet capability or major goal deviation. Advisory methods, not an answer key or scientific quality score.',
  args: {
    workspace: z.string().min(1),
    operation: z.enum(['catalog', 'plan', 'review', 'audit']),
    direction_id: z.string().optional(),
    method_ids: z.array(z.string().min(1)).min(1).optional(),
    summary_only: z.boolean().optional(),
    plan_json: z.string().optional(),
    review_json: z.string().optional(),
  },
  async execute(args) {
    if (args.operation === 'catalog') {
      prepareGuidance(args.workspace)
      const catalog = loadCatalog()
      if (args.direction_id !== undefined || args.method_ids !== undefined || args.summary_only)
        return JSON.stringify(selectCatalog(catalog,args),null,2)
      return renderCatalog(catalog)
    }
    if (args.operation === 'plan') {
      if (!args.plan_json) throw new Error('plan requires plan_json; see outputs/research-guidance/plan-example.json')
      const input = JSON.parse(args.plan_json)
      const saved = writePlan(args.workspace, input)
      if (input.claims.some(c=>c.status !== 'planned')) return JSON.stringify({...saved, scientific_quality:auditScientificQuality(args.workspace,{final:false})},null,2)
      return JSON.stringify(saved,null,2)
    }
    if (args.operation === 'review') {
      if (!args.review_json) throw Error('review requires review_json from an independent scientific reviewer')
      const saved = saveScientificReview(args.workspace,JSON.parse(args.review_json))
      return JSON.stringify({...saved, scientific_quality:auditScientificQuality(args.workspace,{final:false})},null,2)
    }
    return JSON.stringify({...auditGuidance(args.workspace), scientific_quality:auditScientificQuality(args.workspace)}, null, 2)
  },
})
