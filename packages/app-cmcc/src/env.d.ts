interface ImportMetaEnv {
  readonly VITE_OPENCODE_SERVER_HOST: string
  readonly VITE_OPENCODE_SERVER_PORT: string
  readonly VITE_OPENCODE_SERVER_USERNAME?: string
  readonly VITE_OPENCODE_SERVER_PASSWORD?: string
  readonly VITE_OPENCODE_CHANNEL?: "dev" | "beta" | "prod"
  readonly VITE_DEEPTRADING_API_KEY?: string
  readonly VITE_DOCKAPI_URL?: string
  readonly VITE_DOCKAPI_AGENT_TYPE?: string
  readonly VITE_DEEPXIV_PROXY_PORT?: string
  readonly VITE_DEEPXIV_URL?: string

  readonly VITE_SENTRY_DSN?: string
  readonly VITE_SENTRY_ENVIRONMENT?: string
  readonly VITE_SENTRY_RELEASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
  glob<T = unknown>(pattern: string): Record<string, () => Promise<T>>
}

declare module "*.png" {
  const src: string
  export default src
}

declare module "*.svg" {
  const src: string
  export default src
}

declare module "*.webp" {
  const src: string
  export default src
}

export declare module "solid-js" {
  namespace JSX {
    interface Directives {
      sortable: true
    }
  }
}
