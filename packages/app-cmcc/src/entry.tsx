// @refresh reload

import { init } from "@sentry/solid"
import { render } from "solid-js/web"
import {
  AppBaseProviders,
  AppInterface,
  authFromToken,
  createBrowserDraftStore,
  loadInitialLocale,
  normalizeServerUrl,
  type Platform,
  PlatformProvider,
  ServerConnection,
} from "@opencode-ai/app"
import { cmccProduct } from "@cmcc/product"
import "@cmcc/index.css"
import pkg from "../package.json"

const DEFAULT_SERVER_URL_KEY = "opencode.settings.dat:defaultServerUrl"
const SERVER_URL_PARAM = "server"

const getLocale = () => {
  if (typeof navigator !== "object") return "en" as const
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language]
  for (const language of languages) {
    if (!language) continue
    if (language.toLowerCase().startsWith("zh")) return "zh" as const
  }
  return "en" as const
}

const getRootNotFoundError = () => {
  if (getLocale() === "zh") return "找不到应用挂载节点 #root"
  return "Could not find the application root element #root"
}

const getStorage = (key: string) => {
  if (typeof localStorage === "undefined") return null
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

const setStorage = (key: string, value: string | null) => {
  if (typeof localStorage === "undefined") return
  try {
    if (value !== null) {
      localStorage.setItem(key, value)
      return
    }
    localStorage.removeItem(key)
  } catch {
    return
  }
}

const readDefaultServerUrl = () => getStorage(DEFAULT_SERVER_URL_KEY)
const writeDefaultServerUrl = (url: string | null) => setStorage(DEFAULT_SERVER_URL_KEY, url)

const readServerUrlParam = () => {
  const url = new URLSearchParams(location.search).get(SERVER_URL_PARAM)
  if (!url) return
  return normalizeServerUrl(url)
}

const notify: Platform["notify"] = async (title, description, onClick) => {
  if (!("Notification" in window)) return

  const permission =
    Notification.permission === "default"
      ? await Notification.requestPermission().catch(() => "denied")
      : Notification.permission

  if (permission !== "granted") return

  const inView = document.visibilityState === "visible" && document.hasFocus()
  if (inView) return

  const notification = new Notification(title, {
    body: description ?? "",
    icon: "/deepinsight-favicon.svg",
  })

  notification.onclick = () => {
    window.focus()
    onClick?.()
    notification.close()
  }
}

const openExternal: Platform["openExternal"] = (value) => {
  if (!URL.canParse(value)) return
  const url = new URL(value)
  if (url.protocol !== "http:" && url.protocol !== "https:" && url.protocol !== "mailto:") return
  window.open(url.href, "_blank", "noopener,noreferrer")
}

const restart: Platform["restart"] = async () => {
  window.location.reload()
}

const root = document.getElementById("root")
if (!(root instanceof HTMLElement) && import.meta.env.DEV) {
  throw new Error(getRootNotFoundError())
}

const getCurrentUrl = () => {
  if (location.hostname.includes("opencode.ai")) return "http://localhost:4096"
  if (import.meta.env.DEV) {
    const host = import.meta.env.VITE_OPENCODE_SERVER_HOST ?? "localhost"
    return `http://${host}:${import.meta.env.VITE_OPENCODE_SERVER_PORT ?? "4096"}`
  }
  return location.origin
}

const getDefaultUrl = () => {
  const urlParam = readServerUrlParam()
  if (urlParam) {
    writeDefaultServerUrl(urlParam)
    return urlParam
  }
  const lsDefault = readDefaultServerUrl()
  if (lsDefault && lsDefault !== "http://81.70.49.200:4096") return lsDefault
  return getCurrentUrl()
}

const clearLaunchParams = () => {
  const params = new URLSearchParams(location.search)
  const changed = params.has("auth_token") || params.has(SERVER_URL_PARAM)
  params.delete("auth_token")
  params.delete(SERVER_URL_PARAM)
  if (!changed) return
  history.replaceState(null, "", location.pathname + (params.size ? `?${params}` : "") + location.hash)
}

const platform: Platform = {
  platform: "web",
  draftStore: createBrowserDraftStore(),
  version: pkg.version,
  openExternal,
  restart,
  notify,
  getDefaultServer: async () => {
    const stored = readDefaultServerUrl()
    return stored ? ServerConnection.Key.make(stored) : null
  },
  setDefaultServer: writeDefaultServerUrl,
}

if (import.meta.env.VITE_SENTRY_DSN) {
  init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT ?? import.meta.env.MODE,
    release: import.meta.env.VITE_SENTRY_RELEASE ?? `web@${pkg.version}`,
    initialScope: {
      tags: {
        platform: "web",
      },
    },
    integrations: (integrations) => {
      return integrations.filter(
        (i) =>
          i.name !== "Breadcrumbs" && !(import.meta.env.OPENCODE_CHANNEL === "prod" && i.name === "GlobalHandlers"),
      )
    },
  })
}

if (root instanceof HTMLElement)
  void loadInitialLocale().then((locale) => {
    const auth = authFromToken(new URLSearchParams(location.search).get("auth_token"))
    const defaultUrl = getDefaultUrl()
    clearLaunchParams()
    const servers = Array.from(new Set([getCurrentUrl(), defaultUrl])).map(
      (url): ServerConnection.Http => ({
        type: "http",
        authToken: !!auth,
        http: {
          url,
          ...auth,
        },
      }),
    )
    const canonical = servers.find((item) => item.http.url === getCurrentUrl()) ?? servers[0]
    render(
      () => (
        <PlatformProvider value={platform}>
          <AppBaseProviders locale={locale} product={cmccProduct}>
            <AppInterface
              defaultServer={ServerConnection.Key.make(defaultUrl)}
              canonicalLocalServer={ServerConnection.key(canonical)}
              servers={servers}
              disableHealthCheck
            />
          </AppBaseProviders>
        </PlatformProvider>
      ),
      root,
    )
  })
