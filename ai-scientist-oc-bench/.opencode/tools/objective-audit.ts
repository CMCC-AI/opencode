import { tool } from '@opencode-ai/plugin'
import z from 'zod'
import fs from 'node:fs'
import { workspacePath } from '../lib/research-guidance.mjs'
import { prepareObjectives, writeObjectives, auditObjectives } from '../lib/objective-audit.mjs'

export default tool({
  description: 'Preserve task objectives, save the deliverables ledger, and audit recovery, experimental conditions and separate reliability/completion reviews. No hidden checklist access; semantic scientific review remains required.',
  args: { workspace: z.string().min(1), operation: z.enum(['prepare', 'save', 'audit']), ledger_json: z.string().optional(), ledger_path: z.string().optional() },
  async execute(args) {
    if (args.operation === 'prepare') return JSON.stringify(prepareObjectives(args.workspace), null, 2)
    if (args.operation === 'save') {
      if (args.ledger_json && args.ledger_path) throw new Error('Use either ledger_json or ledger_path, not both')
      const relative = args.ledger_path || (args.ledger_json?.startsWith('@') ? args.ledger_json.slice(1) : null)
      if (relative && relative !== 'outputs/task-deliverables.json') throw new Error('ledger_path must be outputs/task-deliverables.json')
      const body = relative ? fs.readFileSync(workspacePath(args.workspace, relative), 'utf8') : args.ledger_json
      if (!body) throw new Error('save requires ledger_path=outputs/task-deliverables.json or a complete ledger_json string; see templates/task-deliverables.md')
      return JSON.stringify(writeObjectives(args.workspace, JSON.parse(body)), null, 2)
    }
    return JSON.stringify(auditObjectives(args.workspace), null, 2)
  },
})
