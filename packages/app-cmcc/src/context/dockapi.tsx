import { createSimpleContext } from "@opencode-ai/ui/context"
import { onCleanup, onMount } from "solid-js"
import { createStore } from "solid-js/store"
import type { Session } from "@opencode-ai/sdk/v2/client"
import type { Message, Part, SessionStatus } from "@opencode-ai/sdk/v2"
import { usePlatform } from "./platform"
import { Persist, removePersisted } from "@/utils/persist"
import { showToast } from "@/utils/toast"
import { createCaseListCache } from "@/utils/case-list-cache"
import { createCaseHandoff } from "@/utils/case-handoff"
import { CMCC_CASES_UPDATED_EVENT } from "@/utils/cmcc-cases"
import { parseQuotaSnapshot, requireResearchQuota } from "@/utils/token-quota"
import { sameDockApiSession, sameDockApiTokens, type DockApiTokens } from "@/utils/dockapi-auth-session"

const ACCESS_TOKEN_KEY = "dockapi.accessToken"
const REFRESH_TOKEN_KEY = "dockapi.refreshToken"
const REFRESH_RACE_WAIT_MS = 1500

type ApiResponse<T> = {
  code: number
  message: string
  data: T
}

export type MstockSource = {
  businessSessionId: string
  title: string
  companyName?: string
  ticker?: string
  createdAt: string
}

export type DockApiUser = {
  id: number
  name: string
  phone: string
  enabled: boolean
  casePublishAllowed: boolean
  userType?: "user" | "admin" | "super_admin"
  vip?: boolean
  caseManagementAllowed?: boolean
  caseDeleteAllowed?: boolean
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
  source?: "opencode"
  caseCode: string
  caseName: string
  caseDescription?: string | null
  caseTag: string
  category: string
  categoryLabel: string
  agentType: string
  rootAgent: string
  coverUrl: string
  reportCharCount: number
  publishedAt: string
}

export type DockApiCatalogCaseSummary = DockApiCaseSummary | (Omit<DockApiCaseSummary, "source" | "agentType" | "rootAgent" | "reportCharCount"> & {
  source: "langgraph"
  agentType: null
  rootAgent: null
  reportCharCount: number | null
  caseDescription?: string | null
})

export type DockApiCaseGroup = {
  category: string
  label: string
  items: DockApiCatalogCaseSummary[]
}

export type DockApiCaseOverview = {
  groups: DockApiCaseGroup[]
}

export type DockApiCaseList = {
  items: DockApiCatalogCaseSummary[]
  total: number
  page: number
  size: number
}

export type DockApiCaseQuery = {
  keyword?: string
  category?: string
  sort?: "latest" | "oldest"
  from?: string
  to?: string
  page?: number
  size?: number
}

function caseListPath(input: DockApiCaseQuery) {
  const query = new URLSearchParams()
  query.set("sources", "all")
  if (input.keyword) query.set("keyword", input.keyword)
  if (input.category) query.set("category", input.category)
  if (input.sort) query.set("sort", input.sort)
  if (input.from) query.set("from", input.from)
  if (input.to) query.set("to", input.to)
  if (input.page) query.set("page", String(input.page))
  if (input.size) query.set("size", String(input.size))
  return `/api/dockapi/cases?${query.toString()}`
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

export type DockApiLoadedCase = {
  detail: DockApiCaseDetail
  snapshot: DockApiCaseSnapshot
  previewBaseUrl: string
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

function storedTokens(): DockApiTokens {
  return {
    accessToken: storageGet(ACCESS_TOKEN_KEY) ?? undefined,
    refreshToken: storageGet(REFRESH_TOKEN_KEY) ?? undefined,
  }
}

function isAuthStorageEvent(event: StorageEvent) {
  return event.key === null || event.key === ACCESS_TOKEN_KEY || event.key === REFRESH_TOKEN_KEY
}

function waitForSharedRenewal(previous: DockApiTokens) {
  if (!sameDockApiTokens(previous, storedTokens())) return Promise.resolve()
  return new Promise<void>((resolve) => {
    const finish = () => {
      clearTimeout(timer)
      window.removeEventListener("storage", changed)
      resolve()
    }
    const changed = (event: StorageEvent) => {
      if (isAuthStorageEvent(event) && storedTokens().refreshToken !== previous.refreshToken) finish()
    }
    const timer = setTimeout(finish, REFRESH_RACE_WAIT_MS)
    window.addEventListener("storage", changed)
  })
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
  init: (props: { loadHistory?: boolean }) => {
    const platform = usePlatform()
    const [state, setState] = createStore({
      status: "loading" as AuthStatus,
      ...storedTokens(),
      user: undefined as DockApiUser | undefined,
      workspace: undefined as DockApiWorkspace | undefined,
      sessions: [] as DockApiSession[],
    })

    let authEpoch = 0
    let refreshRequest: Promise<void> | undefined
    let profileRequest: Promise<void> | undefined
    const caseOverview = createCaseListCache<DockApiCaseOverview>()
    const caseLists = createCaseListCache<DockApiCaseList>()
    const caseHandoff = createCaseHandoff<DockApiLoadedCase>()
    const clearCaseCache = () => {
      caseOverview.clear()
      caseLists.clear()
      caseHandoff.clear()
    }
    onCleanup(clearCaseCache)

    const saveTokens = (auth: AuthResponse) => {
      if (state.user?.id !== auth.user.id) clearCaseCache()
      storageSet(ACCESS_TOKEN_KEY, auth.accessToken)
      storageSet(REFRESH_TOKEN_KEY, auth.refreshToken)
      setState({
        accessToken: auth.accessToken,
        refreshToken: auth.refreshToken,
        user: auth.user,
        workspace: auth.workspace,
      })
    }

    const resetAuth = (tokens: DockApiTokens) => {
      authEpoch += 1
      refreshRequest = undefined
      profileRequest = undefined
      // Unmount the authenticated app before its consumers lose the old workspace.
      setState("status", tokens.accessToken || tokens.refreshToken ? "loading" : "unauthenticated")
      clearCaseCache()
      window.dispatchEvent(new Event("dockapi-auth-cleared"))
      removePersisted(Persist.global("tabs"), platform)
      removePersisted(Persist.global("tabs.recent"), platform)
      setState({
        ...tokens,
        user: undefined,
        workspace: undefined,
        sessions: [],
      })
    }

    const clear = () => {
      storageSet(ACCESS_TOKEN_KEY, null)
      storageSet(REFRESH_TOKEN_KEY, null)
      resetAuth({ accessToken: undefined, refreshToken: undefined })
    }

    const syncAuth = (tokens: DockApiTokens) => {
      if (sameDockApiTokens(state, tokens)) return
      if (state.status !== "unauthenticated" && sameDockApiSession(state, tokens, state.user?.id)) {
        setState(tokens)
        return
      }
      resetAuth(tokens)
      void restore()
    }

    const refresh = async () => {
      if (refreshRequest) return refreshRequest
      const epoch = authEpoch
      const refreshToken = state.refreshToken
      if (!refreshToken) throw new DockApiError("登录已失效", 401)

      const checkScope = () => {
        if (epoch !== authEpoch) throw new DockApiError("登录状态已变化", 409)
      }
      const locks = typeof navigator !== "undefined" ? navigator.locks : undefined
      const renew = async () => {
        checkScope()
        const previous = storedTokens()
        syncAuth(previous)
        checkScope()
        if (previous.accessToken && previous.refreshToken !== refreshToken) return
        const followOtherTab = () => {
          checkScope()
          const latest = storedTokens()
          if (sameDockApiTokens(previous, latest)) return false
          syncAuth(latest)
          checkScope()
          return true
        }
        try {
          const auth = await fetch(`${dockApiBaseUrl()}/api/auth/refresh`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refreshToken }),
          }).then(readResponse<AuthResponse>)
          if (!followOtherTab()) saveTokens(auth)
        } catch (error) {
          checkScope()
          if (error instanceof DockApiError && error.status === 401) {
            // On HTTP, another tab may have consumed the one-use token before storing its replacement.
            if (!locks) await waitForSharedRenewal(previous)
            if (followOtherTab()) return
            clear()
          }
          throw error
        }
      }
      const pending = (locks ? locks.request("dockapi-auth-refresh", renew) : Promise.resolve().then(renew))
        .then(() => undefined)
        .finally(() => {
          if (refreshRequest === pending) refreshRequest = undefined
        })
      refreshRequest = pending
      return pending
    }

    const authorizedFetch = async (path: string, init?: RequestInit, canRefresh = true): Promise<Response> => {
      const epoch = authEpoch
      const token = state.accessToken
      const headers = new Headers(init?.headers)
      if (init?.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json")
      }
      if (token) headers.set("Authorization", `Bearer ${token}`)

      const response = await fetch(`${dockApiBaseUrl()}${path}`, { ...init, headers })
      if (epoch !== authEpoch) throw new DockApiError("登录状态已变化", 409)
      if (response.status === 401 && canRefresh && (state.refreshToken || state.accessToken !== token)) {
        if (state.accessToken === token) await refresh()
        if (epoch !== authEpoch) throw new DockApiError("登录状态已变化", 409)
        return authorizedFetch(path, init, false)
      }
      if (response.status === 403 && path !== "/api/user/profile") {
        await reloadProfile().catch(() => undefined)
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

    const reloadProfile = () => {
      if (profileRequest) return profileRequest
      const epoch = authEpoch
      const pending = request<UserProfileResponse>("/api/user/profile")
        .then((profile) => {
          if (epoch !== authEpoch) return
          const previous = state.user
          const changed = previous?.id !== profile.user.id || previous?.userType !== profile.user.userType
            || previous?.casePublishAllowed !== profile.user.casePublishAllowed
            || previous?.caseDeleteAllowed !== profile.user.caseDeleteAllowed
            || previous?.caseManagementAllowed !== profile.user.caseManagementAllowed
          setState({ user: profile.user, workspace: profile.workspace })
          if (changed) clearCaseCache()
        })
        .finally(() => { if (profileRequest === pending) profileRequest = undefined })
      profileRequest = pending
      return pending
    }

    const loadSessions = async () => {
      const sessions = await request<DockApiSession[]>("/api/dockapi/sessions")
      setState("sessions", sessions)
      return sessions
    }

    const loadSessionsSafely = async () => {
      const epoch = authEpoch
      try {
        return await loadSessions()
      } catch (error) {
        if (epoch !== authEpoch) return []
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
        if (props.loadHistory !== false) await loadSessionsSafely()
      } catch (error) {
        if (epoch !== authEpoch) return
        if (error instanceof DockApiError && error.status === 401) {
          const latest = storedTokens()
          if (sameDockApiTokens(state, latest)) clear()
          else {
            syncAuth(latest)
            if (epoch === authEpoch) await restore()
          }
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
        if (isAuthStorageEvent(event)) syncAuth(storedTokens())
      }
      window.addEventListener("storage", sync)
      window.addEventListener(CMCC_CASES_UPDATED_EVENT, clearCaseCache)
      const focus = () => {
        if (state.status === "authenticated") void reloadProfile().catch(() => undefined)
      }
      window.addEventListener("focus", focus)
      onCleanup(() => window.removeEventListener("focus", focus))
      onCleanup(() => window.removeEventListener("storage", sync))
      onCleanup(() => window.removeEventListener(CMCC_CASES_UPDATED_EVENT, clearCaseCache))
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
      get authScope() {
        return authEpoch
      },
      get agentType() {
        return (import.meta.env.VITE_DOCKAPI_AGENT_TYPE?.trim() || "deepinsight").toLowerCase()
      },
      auth: {
        refresh,
        profile: reloadProfile,
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
          if (props.loadHistory !== false) await loadSessionsSafely()
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
            const latest = storedTokens()
            if (sameDockApiTokens(state, latest) || sameDockApiSession(state, latest, state.user?.id)) clear()
            else syncAuth(latest)
          } catch (error) {
            showToast({ variant: "error", title: "退出失败，请重试", description: String(error) })
          }
        },
      },
      research: { request, fetch: authorizedFetch },
      quota: {
        async get() {
          return parseQuotaSnapshot(
            await request<unknown>("/api/dockapi/token-quota", { signal: AbortSignal.timeout(10000) }),
          )
        },
        async checkResearch() {
          requireResearchQuota(
            parseQuotaSnapshot(
              await request<unknown>("/api/dockapi/token-quota", { signal: AbortSignal.timeout(10000) }),
            ),
          )
        },
      },
      sessions: {
        list: loadSessions,
        get(id: string) {
          return request<DockApiSession>(`/api/dockapi/sessions/${encodeURIComponent(id)}`)
        },
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
      mstock: {
        sources(page = 0) {
          return request<{ items: MstockSource[]; nextPage: number | null }>(`/api/dockapi/mstock/sources?page=${page}`)
        },
        prepare(targetBusinessSessionId: string, sourceBusinessSessionIds: string[]) {
          return request<Array<{ businessSessionId: string; title: string; path: string }>>(
            "/api/dockapi/mstock/sources/prepare",
            { method: "POST", body: JSON.stringify({ targetBusinessSessionId, sourceBusinessSessionIds }) },
          )
        },
      },
      cases: {
        invalidate: clearCaseCache,
        cachedOverview() {
          return caseOverview.peek("overview")
        },
        overview() {
          return caseOverview.load("overview", () => request<DockApiCaseOverview>("/api/dockapi/cases/overview?sources=all"))
        },
        cachedList(input: DockApiCaseQuery) {
          return caseLists.peek(caseListPath(input))
        },
        list(input: DockApiCaseQuery) {
          const path = caseListPath(input)
          return caseLists.load(path, () => request<DockApiCaseList>(path))
        },
        detail(caseCode: string, signal?: AbortSignal) {
          return request<DockApiCaseDetail>(`/api/dockapi/cases/${encodeURIComponent(caseCode)}`, { signal })
        },
        async snapshot(caseCode: string, signal?: AbortSignal) {
          const epoch = authEpoch
          const response = await authorizedFetch(
            `/api/dockapi/cases/${encodeURIComponent(caseCode)}/snapshot?delivery=1`,
            { signal },
          )
          if (!response.ok) return readResponse<DockApiCaseSnapshot>(response)
          const snapshot = (await response.json()) as DockApiCaseSnapshot
          if (epoch !== authEpoch) throw new DockApiError("登录状态已变化", 409)
          return snapshot
        },
        get navigationScope() {
          return authEpoch
        },
        stageNavigation(value: DockApiLoadedCase, scope: number) {
          if (state.status !== "authenticated" || scope !== authEpoch) throw new DockApiError("登录状态已变化", 401)
          return caseHandoff.stage(value.detail.caseCode, authEpoch, value)
        },
        takeNavigation(caseCode: string, token: unknown) {
          return caseHandoff.take(caseCode, authEpoch, token)
        },
        discardNavigation(token: string) {
          caseHandoff.clear(token)
        },
        async publish(input: { businessSessionId: string; caseName: string; caseTag: string }) {
          const form = new FormData()
          form.append("caseName", input.caseName)
          form.append("caseTag", input.caseTag)
          const result = await request<DockApiCaseSummary>(
            `/api/dockapi/cases/from-session/${encodeURIComponent(input.businessSessionId)}`,
            { method: "POST", body: form },
          )
          clearCaseCache()
          return result
        },
        async remove(caseCode: string) {
          await request<void>(`/api/dockapi/cases/${encodeURIComponent(caseCode)}`, { method: "DELETE" })
          clearCaseCache()
        },
        previewTicket(caseCode: string, signal?: AbortSignal) {
          return request<DockApiCasePreviewTicket>(
            `/api/dockapi/cases/${encodeURIComponent(caseCode)}/preview-ticket`,
            { method: "POST", signal },
          )
        },
      },
    }
  },
})
