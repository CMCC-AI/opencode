import { createSimpleContext } from "@opencode-ai/ui/context"
import { onCleanup, onMount } from "solid-js"
import { createStore } from "solid-js/store"
import type { Session } from "@opencode-ai/sdk/v2/client"
import type { Message, Part, SessionStatus } from "@opencode-ai/sdk/v2"
import { usePlatform } from "./platform"
import { Persist, removePersisted } from "@/utils/persist"
import { showToast } from "@/utils/toast"

const ACCESS_TOKEN_KEY = "dockapi.accessToken"
const REFRESH_TOKEN_KEY = "dockapi.refreshToken"

type ApiResponse<T> = {
  code: number
  message: string
  data: T
}

export type DockApiUser = {
  id: number
  name: string
  phone: string
  enabled: boolean
  casePublishAllowed: boolean
}

export type DockApiWorkspace = {
  id: number
  workspaceKey: string
  directoryPath: string
  status: string
}

export type DockApiSession = {
  id: string
  agentType: string
  query: string
  title: string
  openCodeSessionId: string
  directoryPath: string
  openCodeSession: unknown | null
  openCodeStatus: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export type DockApiCaseSummary = {
  caseCode: string
  caseName: string
  caseTag: string
  category: string
  categoryLabel: string
  agentType: string
  rootAgent: string
  coverUrl: string
  reportCharCount: number
  publishedAt: string
}

export type DockApiCaseGroup = {
  category: string
  label: string
  items: DockApiCaseSummary[]
}

export type DockApiCaseOverview = {
  groups: DockApiCaseGroup[]
}

export type DockApiCaseList = {
  items: DockApiCaseSummary[]
  total: number
  page: number
  size: number
}

export type DockApiCaseDetail = DockApiCaseSummary & {
  query: string
  snapshotVersion: string
  snapshotBytes: number
  artifactBytes: number
}

export type DockApiCaseSnapshotSession = {
  session: Session
  status: SessionStatus
  messages: Array<{ info: Message; parts: Part[] }>
}

export type DockApiCaseArtifact = {
  path: string
  size: number
  contentType: string
}

export type DockApiCaseSnapshot = {
  schemaVersion: number
  caseCode: string
  capturedAt: string
  rootSessionId: string
  query: string
  agentType: string
  rootAgent: string
  sessions: DockApiCaseSnapshotSession[]
  artifacts: DockApiCaseArtifact[]
}

export type DockApiCasePreviewTicket = {
  baseUrl: string
  expiresAt: string
}

export function asOpenCodeSession(value: unknown): Session | undefined {
  if (!value || typeof value !== "object") return
  const session = value as Partial<Session>
  if (typeof session.id !== "string") return
  if (typeof session.directory !== "string") return
  if (typeof session.title !== "string") return
  if (!session.time || typeof session.time.created !== "number" || typeof session.time.updated !== "number") return
  return session as Session
}

const normalizedDirectory = (value: string) => value.replaceAll("\\", "/").replace(/\/+$/, "")

export function isDockApiRuntimeDirectory(userDirectory: string, sessionDirectory: string) {
  const root = normalizedDirectory(userDirectory).toLowerCase()
  const candidate = normalizedDirectory(sessionDirectory).toLowerCase()
  return candidate === root
}

export function dockApiHistorySessions(userDirectory: string, bindings: DockApiSession[]): Session[] {
  return bindings
    .filter((binding) => isDockApiRuntimeDirectory(userDirectory, binding.directoryPath))
    .map((binding) => {
      const session = asOpenCodeSession(binding.openCodeSession)
      if (session) return { ...session, title: binding.title, directory: binding.directoryPath }
      const created = Date.parse(binding.createdAt)
      const updated = Date.parse(binding.updatedAt)
      return {
        id: binding.openCodeSessionId,
        slug: binding.id,
        projectID: binding.directoryPath,
        directory: binding.directoryPath,
        title: binding.title,
        version: "v2",
        time: {
          created: Number.isFinite(created) ? created : 0,
          updated: Number.isFinite(updated) ? updated : Number.isFinite(created) ? created : 0,
        },
      } as Session
    })
}

type AuthResponse = {
  accessToken: string
  refreshToken: string
  tokenType: string
  accessExpiresIn: number
  user: DockApiUser
  workspace: DockApiWorkspace
}

type UserProfileResponse = {
  user: DockApiUser
  workspace: DockApiWorkspace
}

type AuthStatus = "loading" | "authenticated" | "unauthenticated"

export class DockApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = "DockApiError"
  }
}

function storageGet(key: string) {
  if (typeof localStorage === "undefined") return null
  return localStorage.getItem(key)
}

function storageSet(key: string, value: string | null) {
  if (typeof localStorage === "undefined") return
  if (value === null) {
    localStorage.removeItem(key)
    return
  }
  localStorage.setItem(key, value)
}

function dockApiBaseUrl() {
  const configured = import.meta.env.VITE_DOCKAPI_URL?.trim()
  if (configured) return configured.replace(/\/+$/, "")
  if (import.meta.env.DEV) return "http://localhost:8081"
  return location.origin
}

export function dockApiUrl(path: string) {
  if (/^https?:\/\//i.test(path)) return path
  return `${dockApiBaseUrl()}${path.startsWith("/") ? "" : "/"}${path}`
}

async function readResponse<T>(response: Response) {
  const payload = (await response.json().catch(() => undefined)) as ApiResponse<T> | undefined
  if (!response.ok || !payload || payload.code !== 200) {
    throw new DockApiError(payload?.message ?? `DockAPI 请求失败，HTTP ${response.status}`, response.status)
  }
  return payload.data
}

export const { use: useDockApi, provider: DockApiProvider } = createSimpleContext({
  name: "DockApi",
  init: () => {
    const platform = usePlatform()
    const [state, setState] = createStore({
      status: "loading" as AuthStatus,
      accessToken: storageGet(ACCESS_TOKEN_KEY) ?? undefined,
      refreshToken: storageGet(REFRESH_TOKEN_KEY) ?? undefined,
      user: undefined as DockApiUser | undefined,
      workspace: undefined as DockApiWorkspace | undefined,
      sessions: [] as DockApiSession[],
    })

    let authEpoch = 0
    let refreshRequest: Promise<void> | undefined

    const saveTokens = (auth: AuthResponse) => {
      storageSet(ACCESS_TOKEN_KEY, auth.accessToken)
      storageSet(REFRESH_TOKEN_KEY, auth.refreshToken)
      setState({
        accessToken: auth.accessToken,
        refreshToken: auth.refreshToken,
        user: auth.user,
        workspace: auth.workspace,
      })
    }

    const clear = () => {
      authEpoch += 1
      window.dispatchEvent(new Event("dockapi-auth-cleared"))
      storageSet(ACCESS_TOKEN_KEY, null)
      storageSet(REFRESH_TOKEN_KEY, null)
      removePersisted(Persist.global("tabs"), platform)
      removePersisted(Persist.global("tabs.recent"), platform)
      setState({
        status: "unauthenticated",
        accessToken: undefined,
        refreshToken: undefined,
        user: undefined,
        workspace: undefined,
        sessions: [],
      })
    }

    const refresh = async () => {
      if (refreshRequest) return refreshRequest
      const epoch = authEpoch
      const refreshToken = state.refreshToken
      if (!refreshToken) throw new DockApiError("登录已失效", 401)

      const renew = async () => {
        if (epoch !== authEpoch) throw new DockApiError("登录状态已变化", 409)
        const latestRefresh = storageGet(REFRESH_TOKEN_KEY)
        const latestAccess = storageGet(ACCESS_TOKEN_KEY)
        if (latestRefresh && latestAccess && latestRefresh !== refreshToken) {
          setState({ accessToken: latestAccess, refreshToken: latestRefresh })
          return
        }
        const auth = await fetch(`${dockApiBaseUrl()}/api/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        }).then(readResponse<AuthResponse>)
        if (epoch !== authEpoch) throw new DockApiError("登录状态已变化", 409)
        saveTokens(auth)
      }
      // Coordinate refresh-token rotation across tabs when Web Locks are available (HTTPS/localhost).
      refreshRequest = (typeof navigator !== "undefined" && navigator.locks
        ? navigator.locks.request("dockapi-auth-refresh", renew)
        : renew())
        .then(() => undefined)
        .catch((error) => {
          if (epoch === authEpoch) clear()
          throw error
        })
        .finally(() => {
          refreshRequest = undefined
        })
      return refreshRequest
    }

    const authorizedFetch = async (path: string, init?: RequestInit, canRefresh = true): Promise<Response> => {
      const epoch = authEpoch
      const headers = new Headers(init?.headers)
      if (init?.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json")
      }
      if (state.accessToken) headers.set("Authorization", `Bearer ${state.accessToken}`)

      const response = await fetch(`${dockApiBaseUrl()}${path}`, { ...init, headers })
      if (epoch !== authEpoch) throw new DockApiError("登录状态已变化", 409)
      if (response.status === 401 && canRefresh && state.refreshToken) {
        await refresh()
        if (epoch !== authEpoch) throw new DockApiError("登录状态已变化", 409)
        return authorizedFetch(path, init, false)
      }
      return response
    }

    const request = async <T,>(path: string, init?: RequestInit): Promise<T> => {
      const epoch = authEpoch
      const response = await authorizedFetch(path, init)
      const result = await readResponse<T>(response)
      if (epoch !== authEpoch) throw new DockApiError("登录状态已变化", 409)
      return result
    }

    const loadSessions = async () => {
      const sessions = await request<DockApiSession[]>("/api/dockapi/sessions")
      setState("sessions", sessions)
      return sessions
    }

    const loadSessionsSafely = async () => {
      try {
        return await loadSessions()
      } catch (error) {
        console.error("业务历史加载失败", error)
        showToast({
          variant: "error",
          title: "历史会话加载失败",
          description: error instanceof Error ? error.message : String(error),
        })
        return state.sessions
      }
    }

    const restore = async () => {
      const epoch = authEpoch
      if (!state.accessToken && !state.refreshToken) {
        setState("status", "unauthenticated")
        return
      }
      try {
        const profile = await request<UserProfileResponse>("/api/user/profile")
        if (epoch !== authEpoch) return
        setState({ user: profile.user, workspace: profile.workspace })
        setState("status", "authenticated")
        await loadSessionsSafely()
      } catch (error) {
        if (epoch !== authEpoch) return
        if (error instanceof DockApiError && error.status === 401) {
          clear()
          return
        }
        setState("status", "unauthenticated")
        showToast({
          variant: "error",
          title: "登录状态恢复失败",
          description: error instanceof Error ? error.message : String(error),
        })
      }
    }

    onMount(() => {
      const sync = (event: StorageEvent) => {
        if (event.key !== null && event.key !== ACCESS_TOKEN_KEY && event.key !== REFRESH_TOKEN_KEY) return
        authEpoch += 1
        setState({
          status: "loading",
          accessToken: storageGet(ACCESS_TOKEN_KEY) ?? undefined,
          refreshToken: storageGet(REFRESH_TOKEN_KEY) ?? undefined,
          user: undefined,
          workspace: undefined,
          sessions: [],
        })
        void restore()
      }
      window.addEventListener("storage", sync)
      onCleanup(() => window.removeEventListener("storage", sync))
      void restore()
    })

    return {
      state,
      get status() {
        return state.status
      },
      get user() {
        return state.user
      },
      get workspace() {
        return state.workspace
      },
      get agentType() {
        return (import.meta.env.VITE_DOCKAPI_AGENT_TYPE?.trim() || "deepinsight").toLowerCase()
      },
      auth: {
        async login(input: { phone: string; password: string }) {
          const epoch = ++authEpoch
          const auth = await fetch(`${dockApiBaseUrl()}/api/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
          }).then(readResponse<AuthResponse>)
          if (epoch !== authEpoch) throw new DockApiError("登录状态已变化", 409)
          saveTokens(auth)
          setState("status", "authenticated")
          await loadSessionsSafely()
        },
        register(input: { name: string; phone: string; password: string }) {
          return fetch(`${dockApiBaseUrl()}/api/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
          }).then(readResponse<DockApiUser>)
        },
        ssoTicket(requestId: string) {
          return request<{ ticket: string; expiresIn: number }>("/api/auth/sso/ticket", {
            method: "POST",
            body: JSON.stringify({ requestId }),
          })
        },
        async logout() {
          try {
            // Wait for revocation; a network failure must not pretend that SSO logout succeeded.
            await request<void>("/api/auth/logout", { method: "POST" })
            clear()
          } catch (error) {
            showToast({ variant: "error", title: "退出失败，请重试", description: String(error) })
          }
        },
      },
      sessions: {
        list: loadSessions,
        findByOpenCodeId(sessionID: string) {
          return state.sessions.find((session) => session.openCodeSessionId === sessionID)
        },
        async create(input: { agentType: string; query: string; title?: string; artifactDirectory: string }) {
          const session = await request<DockApiSession>("/api/dockapi/sessions", {
            method: "POST",
            body: JSON.stringify({
              agentType: input.agentType,
              query: input.query,
              title: input.title,
              artifactDirectory: input.artifactDirectory,
            }),
          })
          setState("sessions", (sessions) => [session, ...sessions.filter((item) => item.id !== session.id)])
          return session
        },
        async updateTitle(sessionID: string, title: string) {
          const session = state.sessions.find((item) => item.openCodeSessionId === sessionID)
          if (!session) throw new DockApiError("未找到业务会话绑定")
          await request<void>(`/api/dockapi/sessions/${encodeURIComponent(session.id)}`, {
            method: "PATCH",
            body: JSON.stringify({ title }),
          })
          setState("sessions", (item) => item.id === session.id, "title", title)
        },
        async remove(sessionID: string) {
          const session = state.sessions.find((item) => item.openCodeSessionId === sessionID)
          if (!session) throw new DockApiError("未找到业务会话绑定")
          await request<void>(`/api/dockapi/sessions/${encodeURIComponent(session.id)}`, { method: "DELETE" })
          setState("sessions", (sessions) => sessions.filter((item) => item.id !== session.id))
        },
      },
      cases: {
        overview() {
          return request<DockApiCaseOverview>("/api/dockapi/cases/overview")
        },
        list(input: {
          keyword?: string
          category?: string
          sort?: "latest" | "oldest"
          from?: string
          to?: string
          page?: number
          size?: number
        }) {
          const query = new URLSearchParams()
          if (input.keyword) query.set("keyword", input.keyword)
          if (input.category) query.set("category", input.category)
          if (input.sort) query.set("sort", input.sort)
          if (input.from) query.set("from", input.from)
          if (input.to) query.set("to", input.to)
          if (input.page) query.set("page", String(input.page))
          if (input.size) query.set("size", String(input.size))
          return request<DockApiCaseList>(`/api/dockapi/cases?${query.toString()}`)
        },
        detail(caseCode: string) {
          return request<DockApiCaseDetail>(`/api/dockapi/cases/${encodeURIComponent(caseCode)}`)
        },
        async snapshot(caseCode: string) {
          const response = await authorizedFetch(`/api/dockapi/cases/${encodeURIComponent(caseCode)}/snapshot`)
          if (!response.ok) return readResponse<DockApiCaseSnapshot>(response)
          return response.json() as Promise<DockApiCaseSnapshot>
        },
        publish(input: {
          businessSessionId: string
          caseName: string
          caseTag: string
          coverFile: File
        }) {
          const form = new FormData()
          form.append("caseName", input.caseName)
          form.append("caseTag", input.caseTag)
          form.append("coverFile", input.coverFile)
          return request<DockApiCaseSummary>(
            `/api/dockapi/cases/from-session/${encodeURIComponent(input.businessSessionId)}`,
            { method: "POST", body: form },
          )
        },
        previewTicket(caseCode: string) {
          return request<DockApiCasePreviewTicket>(
            `/api/dockapi/cases/${encodeURIComponent(caseCode)}/preview-ticket`,
            { method: "POST" },
          )
        },
      },
    }
  },
})
