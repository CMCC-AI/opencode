# AI Scientist OpenCode Expert Team Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Chinese-first AI Scientist expert-team project that opens directly in OpenCode, accepts `@ai-scientist` requests, dynamically assembles Markdown-defined research experts, persists Research Context, enforces human gates, and delivers traceable research packages.

**Architecture:** Mirror `deepinsight-oc`: one orchestrator Agent calls `as-*` subagents through Task, subagents exchange versioned files through a per-run workspace, and deterministic tools validate academic metadata and artifacts. AutoResearchClaw contributes literature-source ordering, stage contracts, hardware-aware execution, bounded refinement, and citation verification rules without becoming a second runtime.

**Tech Stack:** OpenCode Agent Markdown, OpenCode custom tools in TypeScript, reusable SKILL.md methods, JSON Schema, Bash validation, Node.js built-in tests.

---

### Task 1: Test-first project contract

**Files:**
- Create: `tests/test-scaffold.sh`
- Create: `tests/test-libraries.mjs`

- [ ] **Step 1: Write failing scaffold test**

The shell test must require `opencode.json`, `AGENTS.md`, `README.md`, one `ai-scientist.md`, the twenty current core `as-*` Agent files, five skills, four tool wrappers, five schemas, examples, and a validation script. It must also reject English-only user-facing output rules and unsafe worker Task permissions.

- [ ] **Step 2: Write failing library test**

Use Node's `node:test` to require a three-source academic search order, DOI/arXiv normalization, title similarity, paper deduplication, Chinese result formatting, and hardware profile normalization.

- [ ] **Step 3: Verify RED**

Run: `bash tests/test-scaffold.sh` and `node --test tests/test-libraries.mjs`  
Expected: both fail because the project scaffold and libraries do not exist.

### Task 2: OpenCode project skeleton and contracts

**Files:**
- Create: `opencode.json`
- Create: `AGENTS.md`
- Create: `README.md`
- Create: `.gitignore`
- Create: `.opencode/package.json`
- Create: `contracts/*.schema.json`
- Create: `templates/research-package.md`
- Create: `examples/*.md`

- [ ] **Step 1: Add minimal OpenCode configuration**

Set `subagent_depth` to 5, matching the proven DeepInsight OC parent → orchestrator → worker topology.

- [ ] **Step 2: Define Chinese-first operating contract**

Document `@ai-scientist` entry, Task-only orchestration, Chinese filenames and explanations where appropriate, preservation of unavoidable English identifiers, Research Context layout, human gates, and non-fabrication rules.

- [ ] **Step 3: Add strict schemas**

Define schemas for research project, takeover plan, evidence claim, experiment plan, experiment run, and research package manifest. Every object includes Chinese descriptions and explicit verification states.

### Task 3: Chief Scientist orchestrator

**Files:**
- Create: `.opencode/agents/ai-scientist.md`

- [ ] **Step 1: Define frontmatter and Task boundary**

Allow read/write/edit/bash/question and only `as-*` Task calls; deny direct web search so research goes through a dedicated expert.

- [ ] **Step 2: Implement Chinese workflow**

Create workspace, call project-takeover experts, build `05-takeover-plan.yaml`, execute selected experts by dependency, validate and persist every result, run Gather → Act → Verify → Adjust, enforce G1-G4, and assemble the final research package.

- [ ] **Step 3: Implement adaptive routes**

Include literature review, paper reading, reproduction, Idea-to-paper, experiment continuation, AI coding, writing, and review routes. Do not invoke irrelevant experts.

### Task 4: Four expert groups

**Files:**
- Create: `.opencode/agents/as-intent-router.md`
- Create: `.opencode/agents/as-asset-auditor.md`
- Create: `.opencode/agents/as-research-planner.md`
- Create: `.opencode/agents/as-feasibility-advisor.md`
- Create: `.opencode/agents/as-literature-strategist.md`
- Create: `.opencode/agents/as-literature-researcher.md`
- Create: `.opencode/agents/as-paper-evidence-analyst.md`
- Create: `.opencode/agents/as-research-synthesizer.md`
- Create: `.opencode/agents/as-methodology-designer.md`
- Create: `.opencode/agents/as-experiment-designer.md`
- Create: `.opencode/agents/as-code-data-engineer.md`
- Create: `.opencode/agents/as-experiment-operator.md`
- Create: `.opencode/agents/as-experiment-diagnostician.md`
- Create: `.opencode/agents/as-result-analyst.md`
- Create: `.opencode/agents/as-outline-architect.md`
- Create: `.opencode/agents/as-evidence-writer.md`
- Create: `.opencode/agents/as-figure-citation-editor.md`
- Create: `.opencode/agents/as-independent-reviewer.md`
- Create: `.opencode/agents/as-quality-citation-auditor.md`
- Create: `.opencode/agents/as-research-package-curator.md`

- [ ] **Step 1: Define each expert's unique responsibility**

Every Markdown Agent must state its Chinese role, non-responsibilities, required Research Context files, workflow, output contract, evidence rules, and self-check.

- [ ] **Step 2: Apply minimum permissions**

Planning and review experts are read-only; literature expert has academic search/web access; code and experiment experts have scoped edit/bash; every worker has `task: deny`.

- [ ] **Step 3: Map AutoResearchClaw mechanisms**

Carry over literature strategy/collect/screen/extract, hypothesis and design gates, code/resource/run/refine, analysis decision, paper outline/draft/review/revision, quality/archive/export/citation verification as coherent expert responsibilities and Chinese artifacts.

### Task 5: Reusable Chinese research skills

**Files:**
- Create: `.opencode/skills/literature-review/SKILL.md`
- Create: `.opencode/skills/paper-analysis/SKILL.md`
- Create: `.opencode/skills/experimental-methodology/SKILL.md`
- Create: `.opencode/skills/scientific-writing/SKILL.md`
- Create: `.opencode/skills/research-integrity/SKILL.md`

- [ ] **Step 1: Write complete method protocols**

Each skill contains trigger conditions, Chinese workflow, evidence boundary, output checks, and domain limitations. Literature review includes search logs and inclusion/exclusion; experimental methodology includes real/simulation/dry-lab/wet-lab routing; integrity includes citation and experiment anti-fabrication.

### Task 6: Deterministic academic and hardware tools

**Files:**
- Create: `.opencode/lib/academic.mjs`
- Create: `.opencode/lib/hardware.mjs`
- Create: `.opencode/tools/academic-search.ts`
- Create: `.opencode/tools/citation-verify.ts`
- Create: `.opencode/tools/hardware-profile.ts`
- Create: `.opencode/tools/artifact-validate.ts`

- [ ] **Step 1: Implement tested pure libraries**

Provide source order, identifier normalization, title similarity, deduplication, Chinese formatting, and hardware normalization required by `tests/test-libraries.mjs`.

- [ ] **Step 2: Verify GREEN for libraries**

Run: `node --test tests/test-libraries.mjs`  
Expected: all tests pass.

- [ ] **Step 3: Add OpenCode tool wrappers**

Academic search queries public OpenAlex, Semantic Scholar, and arXiv with graceful degradation. Citation verification resolves arXiv/DOI/title and returns Chinese statuses. Hardware tool inspects local runtime. Artifact tool validates file existence and JSON shape without inventing content.

### Task 7: Static validation and OpenCode discovery

**Files:**
- Create: `scripts/validate-ai-scientist.sh`

- [ ] **Step 1: Implement validator**

Check agent count is a flexible range, chief Task allowlist, worker Task denial, Chinese-first instructions, agent output contracts, schemas, skills, tools, route names, G1-G4, experiment truth modes, and referenced files.

- [ ] **Step 2: Verify GREEN for scaffold**

Run: `bash tests/test-scaffold.sh` and `bash scripts/validate-ai-scientist.sh`  
Expected: PASS with counts and no missing contracts.

- [ ] **Step 3: Install local tool dependency**

Run: `npm install` in `.opencode/`.  
Expected: `@opencode-ai/plugin` and `zod` install successfully.

- [ ] **Step 4: Verify OpenCode discovery**

Run: `opencode debug config`, `opencode debug agent ai-scientist`, and sample `as-*` debug commands.  
Expected: chief and workers are discovered with correct mode and permissions.

### Task 8: Final verification and handoff

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Run full verification**

Run all Node tests, scaffold tests, validator, JSON parsing, shell syntax, `git diff --check`, and OpenCode discovery.

- [ ] **Step 2: Document actual run instructions**

Explain opening the directory in OpenCode, restarting after Agent changes, invoking `@ai-scientist`, providing files, reading workspace progress, satisfying human gates, and interpreting real/simulation/design-only results.

- [ ] **Step 3: Commit verified implementation**

```bash
git add .
git commit -m "feat: build Chinese AI Scientist OpenCode expert team"
```
