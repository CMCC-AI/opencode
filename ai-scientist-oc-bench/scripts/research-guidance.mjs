#!/usr/bin/env node
import { auditScientificQuality } from '../.opencode/lib/scientific-quality.mjs'
import { prepareGuidance, auditGuidance } from '../.opencode/lib/research-guidance.mjs'

const [operation, workspace] = process.argv.slice(2)
try {
  if (!workspace || !['prepare', 'audit'].includes(operation)) throw new Error('Usage: node scripts/research-guidance.mjs prepare|audit <workspace>')
  const result = operation === 'prepare' ? prepareGuidance(workspace) : {...auditGuidance(workspace), scientific_quality:auditScientificQuality(workspace)}
  console.log(JSON.stringify(result, null, 2))
  if (result.issues?.length || result.scientific_quality?.status === 'failed') process.exitCode = 1
} catch (error) {
  console.error(`Research guidance: ${error.message}`)
  process.exitCode = 1
}
