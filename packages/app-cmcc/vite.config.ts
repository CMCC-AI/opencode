import { sentryVitePlugin } from "@sentry/vite-plugin"
import { defineConfig } from "vite"
import desktopPlugin from "./vite"
import { startDeepXivProxy } from "./scripts/deepxiv-proxy"

const sentry =
  process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT
    ? sentryVitePlugin({
        authToken: process.env.SENTRY_AUTH_TOKEN,
        org: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
        telemetry: false,
        release: {
          name: process.env.SENTRY_RELEASE ?? process.env.VITE_SENTRY_RELEASE,
        },
        sourcemaps: {
          assets: "./dist/**",
          filesToDeleteAfterUpload: "./dist/**/*.map",
        },
      })
    : false

const deepXivProxyPlugin = {
  name: "cmcc:deepxiv-proxy",
  apply: "serve" as const,
  async configureServer(server: import("vite").ViteDevServer) {
    if (!server.httpServer || server.config.env.VITE_DEEPXIV_URL?.trim()) return

    const configuredPort = server.config.env.VITE_DEEPXIV_PROXY_PORT?.trim()
    const proxy = await startDeepXivProxy({
      port: configuredPort ? Number(configuredPort) : undefined,
    })
    server.httpServer.once("close", () => {
      proxy.closeAllConnections()
      proxy.close()
    })
  },
}

export default defineConfig({
  plugins: [
    desktopPlugin,
    deepXivProxyPlugin,
    sentry,
  ] as any,
  server: {
    host: "0.0.0.0",
    allowedHosts: true,
    port: 3000,
  },
  build: {
    target: "esnext",
    sourcemap: true,
  },
})
