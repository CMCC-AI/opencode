import { createSimpleContext } from "@opencode-ai/ui/context"
import { onMount } from "solid-js"
import { createStore } from "solid-js/store"
import type { Session } from "@opencode-ai/sdk/v2/client"
import { usePlatform } from "./platform"
import { Persist, removePersisted } from "@/utils/persist"

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

export function asOpenCodeSession(value: unknown): Session | undefined {
  if (!value || typeof value !== "object") return
  const session = value as Partial<Session>
  if (typeof session.id !== "string") return
  if (typeof session.directory !== "string") return
  if (typeof session.title !== "string") return
  if (!session.time || typeof session.time.created !== "number" || typeof session.time.updated !== "number") return
  return session as Session
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

    let refreshRequest: Promise<AuthResponse> | undefined

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
      const refreshToken = state.refreshToken
      if (!refreshToken) throw new DockApiError("登录已失效", 401)

      refreshRequest = fetch(`${dockApiBaseUrl()}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      })
        .then(readResponse<AuthResponse>)
        .then((auth) => {
          saveTokens(auth)
          return auth
        })
        .catch((error) => {
          clear()
          throw error
        })
        .finally(() => {
          refreshRequest = undefined
        })
      return refreshRequest
    }

    const request = async <T,>(path: string, init?: RequestInit, canRefresh = true): Promise<T> => {
      const headers = new Headers(init?.headers)
      if (init?.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json")
      if (state.accessToken) headers.set("Authorization", `Bearer ${state.accessToken}`)

      const response = await fetch(`${dockApiBaseUrl()}${path}`, { ...init, headers })
      if (response.status === 401 && canRefresh && state.refreshToken) {
        await refresh()
        return request<T>(path, init, false)
      }
      return readResponse<T>(response)
    }

    const loadSessions = async () => {
      const sessions = await request<DockApiSession[]>("/api/dockapi/sessions")
      setState("sessions", sessions)
      return sessions
    }

    const restore = async () => {
      if (!state.accessToken && !state.refreshToken) {
        setState("status", "unauthenticated")
        return
      }
      try {
        const profile = await request<UserProfileResponse>("/api/user/profile")
        setState({ user: profile.user, workspace: profile.workspace })
        await loadSessions()
        setState("status", "authenticated")
      } catch {
        clear()
      }
    }

    onMount(() => {
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
        return import.meta.env.VITE_DOCKAPI_AGENT_TYPE?.trim() || "DeepInsight"
      },
      auth: {
        async login(input: { phone: string; password: string }) {
          const auth = await fetch(`${dockApiBaseUrl()}/api/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
          }).then(readResponse<AuthResponse>)
          saveTokens(auth)
          await loadSessions()
          setState("status", "authenticated")
        },
        register(input: { name: string; phone: string; password: string }) {
          return fetch(`${dockApiBaseUrl()}/api/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
          }).then(readResponse<DockApiUser>)
        },
        async logout() {
          await request<void>("/api/auth/logout", { method: "POST" }).catch(() => undefined)
          clear()
        },
      },
      sessions: {
        list: loadSessions,
        findByOpenCodeId(sessionID: string) {
          return state.sessions.find((session) => session.openCodeSessionId === sessionID)
        },
        async create(input: { query: string; title?: string }) {
          const session = await request<DockApiSession>("/api/dockapi/sessions", {
            method: "POST",
            body: JSON.stringify({
              agentType: import.meta.env.VITE_DOCKAPI_AGENT_TYPE?.trim() || "DeepInsight",
              query: input.query,
              title: input.title,
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
    }
  },
})
