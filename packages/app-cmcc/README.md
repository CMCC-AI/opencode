## Usage

Dependencies for these templates are managed with [pnpm](https://pnpm.io) using `pnpm up -Lri`.

This is the reason you see a `pnpm-lock.yaml`. That said, any package manager will work. This file can safely be removed once you clone a template.

```bash
$ npm install # or pnpm install or yarn install
```

### Learn more on the [Solid Website](https://solidjs.com) and come chat with us on our [Discord](https://discord.com/invite/solidjs)

## Available Scripts

In the project directory, you can run:

### `npm run dev` or `npm start`

Runs the app in the development mode.<br>
Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

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

The page will reload if you make edits.<br>

### `npm run build`

Builds the app for production to the `dist` folder.<br>
It correctly bundles Solid in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.<br>
Your app is ready to be deployed!

## E2E Testing

Playwright starts the Vite dev server automatically via `webServer`, and UI tests expect an opencode backend at `localhost:4096` by default.

```bash
bunx playwright install chromium
bun run test:e2e:local
bun run test:e2e:local -- --grep "settings"
```

Environment options:

- `PLAYWRIGHT_SERVER_HOST` / `PLAYWRIGHT_SERVER_PORT` (backend address, default: `localhost:4096`)
- `PLAYWRIGHT_PORT` (Vite dev server port, default: `3000`)
- `PLAYWRIGHT_BASE_URL` (override base URL, default: `http://localhost:<PLAYWRIGHT_PORT>`)

## Deployment

You can deploy the `dist` folder to any static host provider (netlify, surge, now, etc.)
