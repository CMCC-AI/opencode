#!/usr/bin/env node
import fs from 'node:fs'
import { prepareObjectives, writeObjectives, auditObjectives } from '../.opencode/lib/objective-audit.mjs'

const [operation, workspace, ledgerFile] = process.argv.slice(2)
try {
  if (!workspace || !['prepare', 'save', 'audit'].includes(operation)) throw new Error('Usage: node scripts/objective-audit.mjs prepare|audit <workspace> OR save <workspace> <ledger-file>')
  const result = operation === 'prepare' ? prepareObjectives(workspace) : operation === 'save'
    ? writeObjectives(workspace, JSON.parse(fs.readFileSync(ledgerFile, 'utf8'))) : auditObjectives(workspace)
  console.log(JSON.stringify(result, null, 2))
  if (operation === 'audit' && result.original_goal !== 'completed') process.exitCode = 20
} catch (error) {
  console.error(`Objective audit: ${error.message}`)
  process.exitCode = 20
}
