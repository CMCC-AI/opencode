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

## DeepXiv embedding

The Vite development server starts a second HTTP listener on port `3100` and
proxies it to DeepLit. The iframe therefore uses the same browser site as
APP-CMCC even when DeepLit runs on another server, so its `SameSite=Lax`
session Cookie survives internal navigation. The iframe is also kept mounted
after its first visit so switching APP-CMCC menus does not discard its runtime
state.

The proxy defaults to `http://81.70.174.140:3000`. Override it when needed:

```bash
DEEPLIT_PROXY_TARGET=http://deep-lit-server:3000 bun dev
```

Use `DEEPLIT_PROXY_TARGET` to change the upstream, and
`VITE_DEEPXIV_PROXY_PORT` to change both the proxy listener and iframe port.
`VITE_DEEPXIV_URL` bypasses the built-in URL and is intended for production
HTTPS deployments where a gateway exposes an equivalent same-site proxy.
When serving the built `dist` directory without Vite, run `bun deepxiv:proxy`
on the APP-CMCC host or provide that gateway separately. An HTTPS APP-CMCC
deployment must terminate TLS for the proxy too and set `VITE_DEEPXIV_URL` to
that HTTPS endpoint at build time. If TLS terminates in front of the standalone
proxy, set `DEEPLIT_PROXY_PUBLIC_ORIGIN` to its browser-visible origin. Set
`DEEPLIT_PROXY_TRUST_FORWARD_HEADERS=true` only when the proxy is reachable
exclusively through a trusted gateway so per-client rate limits use the
gateway-provided address.

`check:thin` rejects copied standard App directories, private `@/` imports, and host-version drift. See [DEV_SYNC.md](./DEV_SYNC.md) for the DEV merge and upgrade workflow.
