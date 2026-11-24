import { expect, test } from "bun:test"
import { sameDockApiSession } from "./dockapi-auth-session"

const sid = "556c867b-4d55-4193-a786-c33753d0cc8d"
const token = (type: string, claims: Record<string, unknown>) =>
  `header.${btoa(JSON.stringify({ sub: "7", sid, type, ...claims })).replace(/=+$/, "")}.signature`
const pair = (claims: Record<string, unknown> = {}) => ({
  accessToken: token("access", claims),
  refreshToken: token("refresh", claims),
})

test("identifies rotation within the same DockAPI login and defaults legacy session versions to zero", () => {
  expect(sameDockApiSession(pair({ jti: "old" }), pair({ jti: "new", sv: 0 }), 7)).toBe(true)
})

test("does not retain a workspace across a different account, login, or session version", () => {
  expect(sameDockApiSession(pair(), pair({ sub: "8" }))).toBe(false)
  expect(sameDockApiSession(pair(), pair({ sid: "3d13b962-6525-47da-a6ef-8e51db0abdd1" }))).toBe(false)
  expect(sameDockApiSession(pair(), pair({ sv: 1 }))).toBe(false)
  expect(sameDockApiSession(pair(), pair(), 8)).toBe(false)
})

test("does not retain a workspace for incomplete, mixed, or unrecognized credentials", () => {
  expect(sameDockApiSession(pair(), { ...pair(), refreshToken: undefined })).toBe(false)
  expect(sameDockApiSession(pair(), { ...pair(), refreshToken: token("refresh", { sub: "8" }) })).toBe(false)
  expect(sameDockApiSession(pair(), { ...pair(), accessToken: token("refresh", {}) })).toBe(false)
  expect(sameDockApiSession(pair(), { ...pair(), accessToken: "opaque-token" })).toBe(false)
})
