import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { test } from "node:test"
import { adminHeaders } from "./static-ui.mjs"

test("admin HTML preserves strict script policy and authorizes only its theme preload", () => {
  const theme = "window.testTheme='light'"
  const headers = adminHeaders(
    `<html><script id="oc-theme-preload-script">${theme}</script><script src="/assets/index-test.js"></script></html>`,
  )
  assert.ok(headers.includes(`'sha256-${createHash("sha256").update(theme).digest("base64")}'`))
  assert.match(headers, /script-src 'self' 'wasm-unsafe-eval'/)
  assert.ok(!/script-src[^;]*'unsafe-inline'/.test(headers))
  assert.match(headers, /X-Frame-Options SAMEORIGIN/)
  assert.match(headers, /Cache-Control no-cache/)
})

test("no inline script is authorized when the known theme script is absent", () => {
  const headers = adminHeaders('<script src="/assets/index-test.js"></script>')
  assert.ok(!headers.includes("sha256-"))
  assert.match(headers, /frame-src 'self';/)
})
