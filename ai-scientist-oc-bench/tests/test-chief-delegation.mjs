import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const read = p => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const agent = name => read(`.opencode/agents/${name}.md`)
const front = name => agent(name).split('---')[1]

test('chief can dispatch and read but cannot absorb worker execution or persistence', () => {
  const permissions = front('ai-scientist-benchmark')
  for (const name of ['edit', 'bash', 'question', 'websearch', 'webfetch', 'research-guidance', 'objective-audit'])
    assert.match(permissions, new RegExp(`^  ${name}: deny$`, 'm'))
  assert.match(permissions, /^  read: allow$/m)
  assert.match(permissions, /"\*": deny/)
  assert.match(permissions, /"as-\*": allow/)
  const chief = agent('ai-scientist-benchmark')
  for (const owner of ['as-research-planner', 'as-code-data-engineer', 'as-experiment-operator', 'as-result-analyst', 'as-evidence-writer', 'as-figure-citation-editor', 'as-independent-reviewer', 'as-quality-citation-auditor', 'as-research-package-curator'])
    assert.ok(chief.includes(owner), owner)
  assert.match(chief, /1200/)
  assert.match(chief, /orchestration-state\.md/)
})

test('all workers persist detailed artifacts with bounded replies and no nested dispatch', () => {
  const dir = new URL('../.opencode/agents/', import.meta.url)
  for (const file of fs.readdirSync(dir).filter(f => /^as-.*\.md$/.test(f))) {
    const name = file.slice(0, -3)
    assert.match(front(name), /task: deny/, name)
    assert.match(front(name), /edit: allow/, name)
    assert.match(agent(name), /research-guidance\/delegation\.md/, name)
    assert.match(agent(name), /1200/, name)
  }
})

test('persistence and independent review responsibilities remain separate', () => {
  assert.match(front('as-research-package-curator'), /bash: allow/)
  const curator = agent('as-research-package-curator')
  for (const step of ['objective-audit save', 'research-guidance plan', 'research-guidance review', 'validate-benchmark-output.sh', 'revision_reason'])
    assert.ok(curator.includes(step), step)
  assert.match(curator, /Do not create passing reviews or sign scientific judgments/)
  assert.match(agent('as-evidence-writer'), /Own direct writing and revision of report\/report.md/)
  assert.match(agent('as-figure-citation-editor'), /Do not edit the images/)
  assert.match(agent('as-independent-reviewer'), /Do not edit implementation, raw results or manuscript/)
  assert.match(agent('as-quality-citation-auditor'), /Do not edit research implementation or manuscript/)
})

test('launcher delegates initial and recovery work without chief implementation fallback', () => {
  const launcher = read('scripts/ai-scientist-oc-bench')
  assert.match(launcher, /Act only as chief orchestrator/)
  assert.match(launcher, /as-research-package-curator/)
  assert.match(launcher, /Do not implement or repair files yourself/)
  assert.match(launcher, /run orchestration-state\.md/)
  const protocol = read('.opencode/research-guidance/delegation.md')
  assert.match(protocol, /Parallel assignments must have disjoint write sets/)
  assert.match(protocol, /does not configure provider context limits or guarantee compaction/)
})
