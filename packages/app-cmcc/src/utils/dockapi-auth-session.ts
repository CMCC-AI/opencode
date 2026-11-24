export type DockApiTokens = {
  accessToken: string | undefined
  refreshToken: string | undefined
}

export function sameDockApiTokens(a: DockApiTokens, b: DockApiTokens) {
  return a.accessToken === b.accessToken && a.refreshToken === b.refreshToken
}

function sessionClaim(token: string | undefined, type: "access" | "refresh") {
  const parts = token?.split(".")
  if (parts?.length !== 3) return
  try {
    const claims = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")))
    const version = claims.sv === undefined ? 0 : claims.sv
    if (
      claims.type !== type ||
      typeof claims.sub !== "string" ||
      !/^\d+$/.test(claims.sub) ||
      typeof claims.sid !== "string" ||
      !/^[a-f0-9-]{36}$/.test(claims.sid) ||
      !Number.isSafeInteger(version) ||
      version < 0
    ) return
    return { user: claims.sub, scope: `${claims.sub}:${claims.sid}:${version}` }
  } catch {
    return
  }
}

function sessionOf(tokens: DockApiTokens) {
  const access = sessionClaim(tokens.accessToken, "access")
  if (access && access.scope === sessionClaim(tokens.refreshToken, "refresh")?.scope) return access
}

// Claims only tell the UI whether it can retain its state. DockAPI still validates every credential.
export function sameDockApiSession(a: DockApiTokens, b: DockApiTokens, userId?: number) {
  const current = sessionOf(a)
  return !!current &&
    (userId === undefined || current.user === String(userId)) &&
    current.scope === sessionOf(b)?.scope
}
