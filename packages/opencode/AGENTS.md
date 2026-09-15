# AI Agent Behavioral Constraints

## Workspace Isolation (CRITICAL)

When dispatching sub-agents via the `task()` tool, **you MUST always specify the `workdir` parameter** pointing to the active session's isolated output directory (`runs/<run_id>/`). Never rely on the default working directory.

### Why this matters

Sub-agents inherit whatever directory the orchestrator process is running in. Without an explicit `workdir`, all file writes by sub-agents end up in the project root instead of the isolated session directory. This pollutes the repository with temporary artifacts and breaks reproducibility.

### Rule

```
✅ CORRECT:  task(description="...", prompt="...", subagent_type="...", workdir="E:/path/to/runs/<run_id>/")
❌ WRONG:    task(description="...", prompt="...", subagent_type="...")   # missing workdir!
```

The `workdir` value must be the absolute path to the `runs/<session-id>/` directory for the current session. All sub-agent outputs will be confined there.

### Session directory structure convention

Each session gets its own isolated workspace under `runs/<uuid>/`:

```
runs/
  <uuid>/
    00-input.json          # Task specification
    artifact-registry.json # Produced artifacts registry
    methodology/           # Theoretical frameworks & derivations
    code/                  # All scripts and source code
    experiments/           # Experimental runs & configurations
    findings/              # Numerical results, diagnostic reports
    writing/               # Drafts and final papers
    visualizations/        # Generated charts and plots
    deliverables/          # Final report packages & manifests
```

### Remediation if violated

If a sub-agent has already written files outside the session directory:
1. Copy all external artifacts into the correct `runs/<uuid>/` subdirectories
2. Delete the external copies from the project root
3. Log the violation in `deliverables/execution_log.json` under `file_boundary_violations`

---

# opencode database guide

## Database

- **Schema**: Drizzle schema lives in `packages/core/src/**/*.sql.ts`.
- **Migrations**: database migrations live in `packages/core` and are applied by core.

## Development server

- Running `bun dev` from `packages/opencode` starts the live interactive TUI. Do not run it as a blocking foreground command when you need to inspect the result.
- Start it in `tmux` instead: `tmux new-session -d -s opencode-dev 'bun dev'`.
- Capture the current TUI output with: `tmux capture-pane -pt opencode-dev`.
- Stop the session explicitly when done: `tmux kill-session -t opencode-dev`.

# Module shape

Do not use `export namespace Foo { ... }` for module organization. It is not
standard ESM, it prevents tree-shaking, and it breaks Node's native TypeScript
runner. Use flat top-level exports combined with a self-reexport at the bottom
of the file:

```ts
// src/foo/foo.ts
export interface Interface { ... }
export class Service extends Context.Service<Service, Interface>()("@opencode/Foo") {}
export const layer = Layer.effect(Service, ...)
export const defaultLayer = layer.pipe(...)

export * as Foo from "./foo"
```

Consumers import the namespace projection:

```ts
import { Foo } from "@/foo/foo"

yield * Foo.Service
Foo.layer
Foo.defaultLayer
```

Namespace-private helpers stay as non-exported top-level declarations in the
same file — they remain inaccessible to consumers (they are not projected by
`export * as`) but are usable by the file's own code.

## When the file is an `index.ts`

If the module is `foo/index.ts` (single-namespace directory), use `"."` for
the self-reexport source rather than `"./index"`:

```ts
// src/foo/index.ts
export const thing = ...

export * as Foo from "."
```

## Multi-sibling directories

For directories with several independent modules (e.g. `src/session/`,
`src/config/`), keep each sibling as its own file with its own self-reexport,
and do not add a barrel `index.ts`. Consumers import the specific sibling:

```ts
import { SessionRetry } from "@/session/retry"
import { SessionStatus } from "@/session/status"
```

Barrels in multi-sibling directories force every import through the barrel to
evaluate every sibling, which defeats tree-shaking and slows module load.

# opencode Effect rules

Use these rules when writing or migrating Effect code.

See `specs/effect/migration.md` for the compact pattern reference and examples.

## Core

- Use `Effect.gen(function* () { ... })` for composition.
- Use `Effect.fn("Domain.method")` for named/traced effects and `Effect.fnUntraced` for internal helpers.
- `Effect.fn` / `Effect.fnUntraced` accept pipeable operators as extra arguments, so avoid unnecessary outer `.pipe()` wrappers.
- Use `Effect.callback` for callback-based APIs.
- Use `Effect.void` instead of `Effect.succeed(undefined)` or `Effect.succeed(void 0)`.
- Prefer `DateTime.nowAsDate` over `new Date(yield* Clock.currentTimeMillis)` when you need a `Date`.

## Module conventions

- In `src/config`, follow the existing self-export pattern at the top of the file (for example `export * as ConfigAgent from "./agent"`) when adding a new config module.

## Schemas and errors

- Use `Schema.Class` for multi-field data.
- Use branded schemas (`Schema.brand`) for single-value types.
- Use `Schema.TaggedErrorClass` for typed errors.
- Use `Schema.Defect` instead of `unknown` for defect-like causes.
- In `Effect.gen` / `Effect.fn`, prefer `yield* new MyError(...)` over `yield* Effect.fail(new MyError(...))` for direct early-failure branches.

## Runtime vs InstanceState

- Use `makeRuntime` (from `src/effect/run-service.ts`) for all services. It returns `{ runPromise, runFork, runCallback }` backed by a shared `memoMap` that deduplicates layers.
- Use `InstanceState` (from `src/effect/instance-state.ts`) for per-directory or per-project state that needs per-instance cleanup. It uses `ScopedCache` keyed by directory — each open project gets its own state, automatically cleaned up on disposal.
- If two open directories should not share one copy of the service, it needs `InstanceState`.
- Do the work directly in the `InstanceState.make` closure — `ScopedCache` handles run-once semantics. Don't add fibers, `ensure()` callbacks, or `started` flags on top.
- Use `Effect.addFinalizer` or `Effect.acquireRelease` inside the `InstanceState.make` closure for cleanup (subscriptions, process teardown, etc.).
- Use `Effect.forkScoped` inside the closure for background stream consumers — the fiber is interrupted when the instance is disposed.
- To make a service's `init()` non-blocking, fork `InstanceState.get(state)` at the `init()` call site (e.g. `Effect.forkIn(scope)`), not by forking work inside the `InstanceState.make` closure. Forking inside the closure leaves state incomplete for other methods that read it.
- `src/project/bootstrap.ts` already wraps every service `init()` in `Effect.forkDetach`, so `init()` is fire-and-forget in production. Keep `init()` methods synchronous internally; the caller controls concurrency.

## Effect v4 beta API

- `Effect.fork` and `Effect.forkDaemon` do not exist. Use `Effect.forkIn(scope)` to fork a fiber into a specific scope.

## Preferred Effect services

- In effectified services, prefer yielding existing Effect services over dropping down to ad hoc platform APIs.
- Prefer `FileSystem.FileSystem` instead of raw `fs/promises` for effectful file I/O.
- Prefer `ChildProcessSpawner.ChildProcessSpawner` with `ChildProcess.make(...)` instead of custom process wrappers.
- Prefer `HttpClient.HttpClient` instead of raw `fetch`.
- Prefer `Path.Path`, `Config`, `Clock`, and `DateTime` when those concerns are already inside Effect code.
- For background loops or scheduled tasks, use `Effect.repeat` or `Effect.schedule` with `Effect.forkScoped` in the layer definition.

## Effect.cached for deduplication

Use `Effect.cached` when multiple concurrent callers should share a single in-flight computation rather than storing `Fiber | undefined` or `Promise | undefined` manually. See `specs/effect/migration.md` for the full pattern.

## Callback boundaries

Use `EffectBridge` for native or external callbacks (`@parcel/watcher`, `node-pty`, native `fs.watch`, plugin callbacks, etc.) that need to re-enter Effect services with instance/workspace context.

Plain async code should pass explicit context or stay inside an Effect fiber; do not add ambient instance context shims.

---

# DeepInsight Research Pipeline (CRITICAL)

When executing a deep research task that produces a report requiring HTML and PDF output, **you MUST use the standard pipeline scripts**. Do NOT write your own HTML/PDF conversion tools.

## Standard Execution Order

The pipeline lives in `.opencode/experts/deepinsight/skills/deepinsight-pipeline/scripts/`:

```bash
# 1. Post-process references (convert <cite>URL</cite> → [N], generate 22-references.json)
node "$SKILL_DIR/scripts/postprocess-report.mjs" <workspace_dir>

# 2. Render HTML (fill visual placeholders, inject charts/references, produce 30-report.html)
node "$SKILL_DIR/scripts/render-report.mjs" <workspace_dir>

# 3. Export PDF (headless Chrome print-to-PDF, produce 35-report.pdf)
node "$SKILL_DIR/scripts/export-report-pdf.mjs" <workspace_dir>/30-report.html <workspace_dir>/35-report.pdf
```

Where `$SKILL_DIR` = `.opencode/experts/deepinsight/skills/deepinsight-pipeline` (relative to repo root).

## Required Pre-conditions

Before running `postprocess-report.mjs`, ensure these files exist:
- `20-report.md` — Markdown report with `<cite>URL</cite>` inline citations (NOT `[N]` format)
- `22-references.json` — Generated by postprocess itself from web findings meta files
- `25-visual-report.json` — Visualization design with `__ABSTRACT__`, `__CH{N}_{M}__` placeholders

**Critical formatting rules for `20-report.md`:**
- Chapter headings must start with Arabic digits: `## 1 Title`, NOT `## 第一章 Title`
- Inline citations must use `<cite>https://example.com</cite>` format (not `[1]`)
- A `## 参考文献` section header must exist at the end

**Critical formatting rules for `25-visual-report.json`:**
- Must include `title`, `current_date`, and `layout_version: 2` fields
- Each section's markdown blocks must use placeholder keys only: `__ABSTRACT__`, `__CH1_1__`, etc.
- No raw report text copied into markdown blocks

## Anti-patterns to Avoid

❌ **DO NOT** write custom PowerShell/Node.js scripts to convert Markdown to HTML
❌ **DO NOT** use `msedge.exe --headless --print-to-pdf` directly
❌ **DO NOT** manually create `22-references.json` or `23-reference-state.json`
❌ **DO NOT** skip the postprocess step even if references look correct

These workarounds bypass the integrity checks (SHA-256 hashes, reference validation, visual placeholder verification) built into the pipeline.

If any pre-condition is missing, fix the source file (`20-report.md` or `25-visual-report.json`) to match the expected format, then run the full pipeline in order. Never patch intermediate artifacts outside the pipeline scripts.
