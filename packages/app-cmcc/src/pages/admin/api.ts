import type { DockApiUser, useDockApi } from "@/context/dockapi"
import type { TokenQuotaSnapshot } from "@/utils/token-quota"
import { CMCC_CASES_UPDATED_EVENT } from "@/utils/cmcc-cases"

export const managementPageSize = 10

export type ManagedUser = {
  id: number
  name: string
  phone: string
  enabled: boolean
  userType: "user" | "admin" | "super_admin"
  vip: boolean
  caseManagementGranted: boolean
  caseManagementAllowed: boolean
  caseDeleteAllowed: boolean
  createdAt: string
  updatedAt: string
}
export type ManagedCase = {
  source: "opencode" | "langgraph"
  caseCode: string
  caseName: string
  caseDescription?: string | null
  category: string
  caseTag: string
  publishStatus: "published" | "unpublished"
  coverUrl: string
  agentType?: string | null
  publishedAt: string
  updatedAt: string
}
export type ManagedPage<T> = { items: T[]; total: number; page: number; size: number }
export type CaseCategory = { code: string; label: string }
export type UserConfiguration = Pick<ManagedUser, "userType" | "vip" | "enabled" | "caseManagementGranted">

export function canManageUser(actor: DockApiUser["userType"], target: ManagedUser["userType"]) {
  return actor === "super_admin" || (actor === "admin" && target === "user")
}

export function userTypeLabel(type: ManagedUser["userType"]) {
  return { user: "普通用户", admin: "管理员", super_admin: "超级管理员" }[type]
}

export function queryPath(path: string, input: Record<string, string | number | boolean | undefined>) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== "") params.set(key, String(value))
  }
  return params.size ? `${path}?${params}` : path
}

export function managementApi(dockapi: ReturnType<typeof useDockApi>) {
  const path = (item: Pick<ManagedCase, "source" | "caseCode">) =>
    `/api/dockapi/case-management/${item.source}/${encodeURIComponent(item.caseCode)}`
  const changed = () => {
    dockapi.cases.invalidate()
    window.dispatchEvent(new Event(CMCC_CASES_UPDATED_EVENT))
  }
  return {
    users: (input: Record<string, string | number | boolean | undefined>) =>
      dockapi.research.request<ManagedPage<ManagedUser>>(queryPath("/api/admin/users", input)),
    user: (id: number) => dockapi.research.request<ManagedUser>(`/api/admin/users/${id}`),
    updateUser: (id: number, input: UserConfiguration) =>
      dockapi.research.request<ManagedUser>(`/api/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
    resetPassword: (id: number, password: string) =>
      dockapi.research.request<void>(`/api/admin/users/${id}/reset-password`, {
        method: "POST",
        body: JSON.stringify({ password }),
      }),
    revokeSessions: (id: number) =>
      dockapi.research.request<void>(`/api/admin/users/${id}/revoke-sessions`, { method: "POST" }),
    quota: (id: number) => dockapi.research.request<TokenQuotaSnapshot>(`/api/admin/users/${id}/token-quota`),
    cases: (input: Record<string, string | number | boolean | undefined>) =>
      dockapi.research.request<ManagedPage<ManagedCase>>(queryPath("/api/dockapi/case-management", input)),
    case: (item: Pick<ManagedCase, "source" | "caseCode">) => dockapi.research.request<ManagedCase>(path(item)),
    categories: () => dockapi.research.request<CaseCategory[]>("/api/dockapi/case-management/categories"),
    async updateCase(item: ManagedCase, input: FormData) {
      const value = await dockapi.research.request<ManagedCase>(path(item), { method: "PATCH", body: input })
      changed()
      return value
    },
    async status(item: ManagedCase, publishStatus: ManagedCase["publishStatus"]) {
      const value = await dockapi.research.request<ManagedCase>(`${path(item)}/status`, {
        method: "PUT",
        body: JSON.stringify({ publishStatus }),
      })
      changed()
      return value
    },
    async remove(item: ManagedCase) {
      const target =
        item.source === "langgraph"
          ? `/api/dockapi/general-deepinsight/cases/${encodeURIComponent(item.caseCode)}`
          : `/api/dockapi/cases/${encodeURIComponent(item.caseCode)}`
      await dockapi.research.request<void>(target, { method: "DELETE" })
      changed()
    },
  }
}
