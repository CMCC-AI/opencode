import {completeScientificFixture} from './scientific-fixture.mjs'
import { writeObjectives } from '../.opencode/lib/objective-audit.mjs'
import { completeLedger } from './objective-fixture.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { getLibraryRoot, loadCatalog, prepareGuidance, writePlan, auditGuidance, workspacePath, selectCatalog } from '../.opencode/lib/research-guidance.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
function fixture(t) {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'research guidance '))
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }))
  prepareGuidance(workspace)
  return workspace
}
function example(workspace) {
  return JSON.parse(fs.readFileSync(path.join(workspace, 'outputs/research-guidance/plan-example.json'), 'utf8'))
}
function evidence(workspace, relative, text = 'actual fixture evidence') {
  const target = path.join(workspace, relative)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, text)
}

test('bundled catalog methods are valid hierarchical and bounded without offline dependencies', () => {
  const catalog = loadCatalog()
  assert.equal(catalog.directions.length, 8)
  assert.equal(catalog.methods.length, 61)
  assert.equal(fs.existsSync(path.join(getLibraryRoot(), 'offline')), false)
  assert.doesNotMatch(JSON.stringify(catalog), /Energy_000|Math_001|0\.011719|111\.50|M33|R1-max/)
})

test('preparation copies only runtime catalog and example; retains version across reruns', t => {
  const workspace = fixture(t)
  const prepared = prepareGuidance(workspace)
  assert.match(prepared.catalog_sha256, /^[a-f0-9]{64}$/)
  assert.deepEqual(fs.readdirSync(path.join(workspace, 'outputs/research-guidance')).sort(), ['catalog.json', 'catalog.md', 'plan-example.json'])
  const snapshot = path.join(workspace, 'outputs/research-guidance/catalog.json')
  fs.writeFileSync(snapshot, '{}')
  assert.throws(() => prepareGuidance(workspace), /different guidance version/)
})

test('method index and semantic selection expose full specialized procedures without source lookups', () => {
  const catalog = loadCatalog()
  const index = selectCatalog(catalog,{summary_only:true})
  assert.equal(index.methods.length,catalog.methods.length)
  assert.ok(index.methods.every(m=>m.when && !m.actions && !m.evidence))
  const ids = ['multimodal-model-workflows','llm-symbolic-research','power-system-dispatch','nanopore-signal-analysis']
  const selected = selectCatalog(catalog,{method_ids:ids})
  assert.deepEqual(selected.methods.map(m=>m.id),ids)
  assert.ok(selected.methods.every(m=>m.actions.length && m.evidence.length))
  assert.ok(JSON.stringify(index).length < JSON.stringify(catalog).length / 3)
  assert.throws(()=>selectCatalog(catalog,{method_ids:['Information_002']}),/Unknown method_id/)
  assert.throws(()=>selectCatalog(catalog,{method_ids:[]}),/nonempty unique/)
  assert.throws(()=>selectCatalog(catalog,{method_ids:[ids[0],ids[0]]}),/nonempty unique/)
  assert.throws(()=>selectCatalog(catalog,{direction_id:'compare',method_ids:[ids[0]]}),/does not belong/)
  assert.throws(()=>selectCatalog(catalog,{direction_id:'unknown'}),/Unknown direction/)
})

test('complete agent deploys without a sibling library and ignores obsolete environment options', t => {
  const external = fs.mkdtempSync(path.join(os.tmpdir(), 'external method library '))
  t.after(() => fs.rmSync(external, { recursive: true, force: true }))
  fs.mkdirSync(path.join(external, '.opencode/lib'), { recursive: true })
  fs.mkdirSync(path.join(external, '.opencode/research-guidance'), { recursive: true })
  fs.copyFileSync(path.join(root, '.opencode/lib/research-guidance.mjs'), path.join(external, '.opencode/lib/research-guidance.mjs'))
  const target = path.join(external, '.opencode/research-guidance/catalog.json')
  fs.copyFileSync(path.join(getLibraryRoot(), 'catalog.json'), target)
  const code = 'import { loadCatalog } from "./.opencode/lib/research-guidance.mjs"; console.log(loadCatalog().version)'
  const run = () => spawnSync(process.execPath, ['--input-type=module', '-e', code], {
    cwd: external, encoding: 'utf8', env: { ...process.env, AI_SCIENTIST_METHOD_LIBRARY: '/missing/old-library', AI_SCIENTIST_RESEARCH_GUIDANCE: '0' }
  })
  assert.equal(run().status, 0)
  fs.unlinkSync(target)
  const missing = run()
  assert.notEqual(missing.status, 0)
  assert.match(missing.stderr, /Bundled research catalog missing/)
})

test('task-grounded plan retains history and accepts evidence-backed negative findings', t => {
  const workspace = fixture(t)
  const plan = example(workspace)
  writePlan(workspace, plan)
  evidence(workspace, 'outputs/comparison.json', '{"difference": -0.2}')
  plan.claims[0].status = 'refuted'
  plan.claims[0].evidence = ['outputs/comparison.json']
  plan.claims[0].interpretation = 'The observed effect contradicts the planned improvement.'
  writePlan(workspace, plan)
  assert.equal(fs.readdirSync(path.join(workspace, 'outputs/research-guidance/history')).length, 1)
  const audit = auditGuidance(workspace)
  assert.deepEqual(audit.issues, [])
  assert.deepEqual(audit.unresolved, [])
  assert.equal(audit.scientific_review_required, true)
})

test('reject unknown methods, empty decisions, and undeclared evidence', t => {
  const workspace = fixture(t)
  let plan = example(workspace)
  plan.claims[0].method_ids = ['old-task-answer']
  assert.throws(() => writePlan(workspace, plan), /Unknown method/)
  plan = example(workspace); plan.direction_decisions.pop()
  assert.throws(() => writePlan(workspace, plan), /Assess every/)
  plan = example(workspace); plan.claims[0].evidence = ['outputs/other.json']
  assert.throws(() => writePlan(workspace, plan), /evidence_plan/)
  plan = example(workspace); plan.claims[0].status = 'supported'
  assert.throws(() => writePlan(workspace, plan), /requires evidence/)
})

test('new domains can use explicit custom methods without being forced into library branches', t => {
  const workspace = fixture(t)
  const plan = example(workspace)
  plan.direction_decisions.forEach(d => { d.status = 'not_applicable' })
  plan.claims[0].method_ids = []
  assert.throws(() => writePlan(workspace, plan), /library_gap/)
  plan.claims[0].library_gap = 'A task-specific formal method is not covered by the library.'
  writePlan(workspace, plan)
  assert.equal(auditGuidance(workspace).unresolved[0].status, 'planned')
})

test('changing design requires a recorded reason and preserves original criteria', t => {
  const workspace = fixture(t)
  const plan = example(workspace)
  writePlan(workspace, plan)
  plan.claims[0].success_criteria = 'A revised, task-justified criterion.'
  assert.throws(() => writePlan(workspace, plan), /revision_reason/)
  plan.revision_reason = 'Independent review identified a mismatched measurement definition; rerun evaluation.'
  writePlan(workspace, plan)
  const history = path.join(workspace, 'outputs/research-guidance/history')
  const previous = JSON.parse(fs.readFileSync(path.join(history, fs.readdirSync(history)[0]), 'utf8'))
  assert.notEqual(previous.claims[0].success_criteria, plan.claims[0].success_criteria)
})

test('OpenCode tool always executes its internal workflow', t => {
  const workspace = fixture(t)
  const url = pathToFileURL(path.join(root, '.opencode/tools/research-guidance.ts')).href
  const code = `
    import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict';
    const { default: tool } = await import(${JSON.stringify(url)});
    const workspace = ${JSON.stringify(workspace)};
    delete process.env.AI_SCIENTIST_RESEARCH_GUIDANCE;
    const catalog = JSON.parse(await tool.execute({workspace, operation: 'catalog', direction_id: 'compare'}));
    assert.equal(catalog.direction.id, 'compare');
    const index = JSON.parse(await tool.execute({workspace, operation:'catalog', summary_only:true}));
    assert.ok(index.methods.some(m=>m.id === 'llm-symbolic-research'));
    assert.ok(index.methods.every(m=>!m.actions));
    const selected = JSON.parse(await tool.execute({workspace,operation:'catalog',method_ids:['llm-symbolic-research']}));
    assert.equal(selected.methods.length,1);
    assert.match(selected.methods[0].actions.join(' '),/secondquant/);
    await assert.rejects(()=>tool.execute({workspace,operation:'catalog',method_ids:['Information_002']}),/Unknown method_id/);
    const plan_json = fs.readFileSync(path.join(workspace, 'outputs/research-guidance/plan-example.json'), 'utf8');
    assert.equal(JSON.parse(await tool.execute({workspace, operation: 'plan', plan_json})).status, 'saved');
    assert.equal(JSON.parse(await tool.execute({workspace, operation: 'audit'})).scientific_review_required, true);
    process.env.AI_SCIENTIST_RESEARCH_GUIDANCE = '0';
    assert.match(await tool.execute({workspace, operation: 'catalog'}), /Research guidance/);
  `
  const modernNode = Number(process.versions.node.split('.')[0]) >= 22
  const runner = modernNode ? process.execPath : (process.env.BUN_BIN || path.join(os.homedir(), '.bun/bin/bun'))
  const args = modernNode ? ['--experimental-strip-types', '--input-type=module', '-e', code] : ['-e', code]
  const result = spawnSync(runner, args, { cwd: root, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stdout + result.stderr)
})

test('missing and empty artifacts are reported; blocked claims stay visible', t => {
  const workspace = fixture(t)
  const plan = example(workspace)
  const claim = plan.claims[0]
  claim.status = 'supported'; claim.evidence = ['outputs/comparison.json']; claim.interpretation = 'Test fixture assertion.'
  writePlan(workspace, plan)
  assert.equal(auditGuidance(workspace).issues.length, 1)
  evidence(workspace, 'outputs/comparison.json', '')
  assert.equal(auditGuidance(workspace).issues.length, 1)
  claim.status = 'blocked'; claim.evidence = []; claim.interpretation = 'Required observation unavailable.'
  writePlan(workspace, plan)
  assert.equal(auditGuidance(workspace).unresolved[0].status, 'blocked')
})

test('reject traversal, protected input paths, guidance-as-evidence and escaping output symlinks', t => {
  const workspace = fixture(t)
  for (const relative of ['../escape', 'outputs/../../escape', 'C:/escape', '/escape', 'outputs\\escape'])
    assert.throws(() => workspacePath(workspace, relative))
  const plan = example(workspace)
  for (const artifact of ['data/source.csv', 'outputs/research-guidance/catalog.md']) {
    plan.claims[0].evidence_plan[0].artifact = artifact
    assert.throws(() => writePlan(workspace, plan))
  }
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'guidance-outside-'))
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }))
  fs.symlinkSync(outside, path.join(workspace, 'outputs/escape'), process.platform === 'win32' ? 'junction' : 'dir')
  assert.throws(() => workspacePath(workspace, 'outputs/escape/new/file.json'), /Symlink escapes/)
})

test('audit rejects mutated catalog or mismatched plan version', t => {
  const workspace = fixture(t)
  writePlan(workspace, example(workspace))
  const target = path.join(workspace, 'outputs/research-guidance/plan.json')
  const plan = JSON.parse(fs.readFileSync(target, 'utf8')); plan.library_version = 'other'
  fs.writeFileSync(target, JSON.stringify(plan))
  assert.throws(() => auditGuidance(workspace), /version mismatch/)
  fs.writeFileSync(path.join(workspace, 'outputs/research-guidance/catalog.json'), '{}')
  assert.throws(() => auditGuidance(workspace), /snapshot does not match/)
})

const bash = process.env.BASH_BIN || (process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash')
const bashAvailable = spawnSync(bash, ['--version'], { encoding: 'utf8' }).status === 0

test('launcher always injects its internal workflow and audits plans without library configuration', { skip: !bashAvailable }, t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'guidance-launcher-'))
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }))
  const fake = path.join(temp, 'fake-opencode')
  fs.writeFileSync(fake, '#!/usr/bin/env bash\nset -e\nprintf "%s\\n" "$@" > outputs/mock-prompt.txt\n')
  fs.chmodSync(fake, 0o755)
  for (const obsoleteSetting of ['0', '1']) {
    const workspace = path.join(temp, obsoleteSetting)
    fs.mkdirSync(workspace)
    evidence(workspace, 'code/run.py', 'print("fixture")')
    evidence(workspace, 'report/images/result.png', 'nonempty validator fixture; not a scientific image')
    evidence(workspace, 'report/report.md', '# Results\n\n## Methodology\nFixture only.\n\n![Result](images/result.png)\n\n## Limitations\nFixture only.')
    evidence(workspace, 'INSTRUCTIONS.md', 'Evaluate the defined cohort with independent repeated runs.')
    for (const p of ['outputs/result.json', 'outputs/reliability.md', 'outputs/coverage.md']) evidence(workspace, p)
    writeObjectives(workspace, completeLedger())
    prepareGuidance(workspace)
    completeScientificFixture(workspace)
    const args = ['scripts/ai-scientist-oc-bench', '--prompt', 'Study a new question', '--workspace', workspace.replaceAll('\\', '/'), '--opencode-bin', fake.replaceAll('\\', '/')]
    const run = spawnSync(bash, args, { cwd: root, encoding: 'utf8', env: { ...process.env,
      AI_SCIENTIST_RESEARCH_GUIDANCE: obsoleteSetting, AI_SCIENTIST_METHOD_LIBRARY: '/missing/old-library' } })
    assert.equal(run.status, 0, run.stdout + run.stderr)
    const prompt = fs.readFileSync(path.join(workspace, 'outputs/mock-prompt.txt'), 'utf8')
    assert.match(prompt, /Follow the built-in research workflow/)
    assert.doesNotMatch(prompt, /rsi-repair|RSI_STOP|rsi-failure-analyst/)
    assert.equal(fs.existsSync(path.join(workspace,'outputs/rsi')),false)
    const resourcePolicy = fs.readFileSync(path.join(root, 'benchmark/resource-policy.md'), 'utf8').trim()
    assert.ok(prompt.includes(resourcePolicy), 'the full reference-use policy must reach the model')
    assert.match(prompt, /Target-study resources: reading only/)
    assert.match(prompt, /Do not clone, install, execute, import or adapt/)
    assert.match(prompt, /Do not suppress target-related access/)
    assert.match(prompt, /Do not paste or lightly rewrite/)
    assert.doesNotMatch(prompt, /Do not fetch, inspect, copy, translate, import or execute target-study/)
    assert.equal(fs.existsSync(path.join(workspace, 'outputs/research-guidance/audit.json')), true)
  }
})

test('prepared guidance alone cannot satisfy the scientific output contract', { skip: !bashAvailable }, t => {
  const workspace = fixture(t)
  fs.mkdirSync(path.join(workspace, 'code'))
  evidence(workspace, 'report/images/main.png', 'nonempty validator fixture')
  evidence(workspace, 'report/report.md', '## Methodology\n\n## Results\n![Figure](images/main.png)\n\n## Limitations\nFixture only.')
  const args = ['scripts/validate-benchmark-output.sh', workspace.replaceAll('\\', '/')]
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = spawnSync(bash, args, { cwd: root, encoding: 'utf8' })
    assert.equal(result.status, 20)
    assert.match(result.stderr, /no traceable code or output/)
  }
})

test('reference-use policy reaches both the initial and recovery model calls', { skip: !bashAvailable }, t => {
  const workspace = fixture(t)
  evidence(workspace, 'INSTRUCTIONS.md', 'Evaluate the defined cohort with independent repeated runs.')
  for (const p of ['outputs/result.json', 'outputs/reliability.md', 'outputs/coverage.md']) evidence(workspace, p)
  writeObjectives(workspace, completeLedger())
  // Existing ordinary launcher recovery directly corrects the report.
  evidence(workspace, 'code/fix-report.mjs',
    'import fs from "node:fs"; fs.writeFileSync("report/report.md",'+JSON.stringify('## Methodology\nIndependent fixture only.\n## Results\n![Result](images/result.png)\n## Limitations\nFixture only.\n')+');')
  const fake = path.join(workspace, 'fake-opencode')
  fs.writeFileSync(fake, `#!/usr/bin/env bash
set -e
count=1
if [[ -f outputs/mock-count ]]; then count=2; fi
printf '%s' "$count" > outputs/mock-count
printf '%s\\n' "$@" > "outputs/mock-prompt-$count.txt"
if [[ "$count" = 2 ]]; then
  node code/fix-report.mjs
fi
`)
  fs.chmodSync(fake, 0o755)
  evidence(workspace, 'code/run.py', 'print("fixture")')
  evidence(workspace, 'report/images/result.png', 'nonempty validator fixture')
  evidence(workspace, 'report/report.md', 'Intentionally incomplete fixture: recovery is required.')
  completeScientificFixture(workspace)
  const run = spawnSync(bash, ['scripts/ai-scientist-oc-bench', '--prompt', 'Study independently',
    '--workspace', workspace.replaceAll('\\', '/'), '--opencode-bin', fake.replaceAll('\\', '/')],
  { cwd: root, encoding: 'utf8' })
  assert.equal(run.status, 0, run.stdout + run.stderr)
  const policy = fs.readFileSync(path.join(root, 'benchmark/resource-policy.md'), 'utf8').trim()
  for (const attempt of [1, 2]) {
    const prompt = fs.readFileSync(path.join(workspace, `outputs/mock-prompt-${attempt}.txt`), 'utf8')
    assert.ok(prompt.includes(policy), `attempt ${attempt} must carry the complete policy`)
  }
  assert.match(fs.readFileSync(path.join(workspace, 'outputs/mock-prompt-2.txt'), 'utf8'), /bounded recovery pass/)
})

test('missing or empty reference-use policy stops launch before any model call', { skip: !bashAvailable }, t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'missing-resource-policy-'))
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }))
  fs.mkdirSync(path.join(temp, 'scripts'))
  fs.mkdirSync(path.join(temp, 'benchmark'))
  fs.copyFileSync(path.join(root, 'scripts/ai-scientist-oc-bench'), path.join(temp, 'scripts/ai-scientist-oc-bench'))
  const workspace = path.join(temp, 'workspace')
  fs.mkdirSync(workspace)
  const fake = path.join(temp, 'fake-opencode')
  fs.writeFileSync(fake, '#!/usr/bin/env bash\nprintf called > model-called\n')
  fs.chmodSync(fake, 0o755)
  for (const empty of [false, true]) {
    if (empty) fs.writeFileSync(path.join(temp, 'benchmark/resource-policy.md'), '')
    const run = spawnSync(bash, [path.join(temp, 'scripts/ai-scientist-oc-bench').replaceAll('\\', '/'),
      '--prompt', 'Study independently', '--workspace', workspace.replaceAll('\\', '/'),
      '--opencode-bin', fake.replaceAll('\\', '/')], { cwd: root, encoding: 'utf8' })
    assert.equal(run.status, 66, run.stdout + run.stderr)
    assert.match(run.stderr, /external-resource policy is missing or empty/)
    assert.equal(fs.existsSync(path.join(workspace, 'model-called')), false)
  }
})
