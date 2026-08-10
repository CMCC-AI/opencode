# Synchronizing CMCC with DEV

`app-cmcc` is a product extension of `@opencode-ai/app`. It owns DeepInsight branding, CMCC routes, navigation entries, knowledge/expert/plugin features, and their assets. It must not contain a copy of the standard App shell, contexts, session UI, translations, or platform integrations.

## Dependency boundary

- Use `@opencode-ai/app` for the public App host and product-extension contract.
- Use `@opencode-ai/app/extension` for the explicitly supported App capabilities needed by CMCC features.
- Never import App internals through `@/` or copy files from `packages/app/src` into this package.
- When DEV changes an internal App API, adapt `packages/app/src/extension.ts` first. Keep CMCC feature code unchanged unless the product behavior itself needs to change.

## After merging DEV

From the integration branch, run:

```sh
bun install
cd packages/app
bun typecheck
cd ../app-cmcc
bun run check:thin
bun typecheck
bun test
bun run build
```

Then verify these points during review:

1. Keep DEV's implementation for the standard App. Do not resolve conflicts by restoring files formerly copied into `app-cmcc`.
2. Preserve the neutral product-extension hooks in `packages/app`; they must not contain CMCC names, routes, assets, or business rules.
3. Keep all CMCC branding and business features in this package.
4. Align the `app-cmcc` package version with `packages/app/package.json`. `check:thin` enforces this.
5. If App internals moved, repair the narrow `@opencode-ai/app/extension` adapter and rerun the checks above.
6. Review server/API changes separately. A frontend extension cannot hide an incompatible protocol or CMCC-specific server requirement.

## Conflict policy

For standard App code, DEV wins unless a neutral extension hook is required. For CMCC-only code, preserve the CMCC implementation and update it to the current extension contract. This keeps future DEV merges small: normally they update `packages/app`, while `app-cmcc` changes only when its contract or CMCC behavior changes.
