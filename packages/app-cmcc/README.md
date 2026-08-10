# DeepInsight App Extension

`@opencode-ai/app-cmcc` is the CMCC product layer for the standard `@opencode-ai/app`. It contains only DeepInsight branding, navigation, product routes, knowledge/expert/plugin features, and CMCC-owned assets.

The application shell, session UI, contexts, settings, translations, and platform behavior come directly from the current standard App workspace package.

## Development

```sh
bun install
cd packages/app-cmcc
bun dev
```

Before submitting a change, run:

```sh
bun run check:thin
bun typecheck
bun test
bun run build
```

`check:thin` rejects copied standard App directories, private `@/` imports, and host-version drift. See [DEV_SYNC.md](./DEV_SYNC.md) for the DEV merge and upgrade workflow.
