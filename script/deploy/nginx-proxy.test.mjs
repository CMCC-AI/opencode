import assert from "node:assert/strict"
import { test } from "node:test"
import { spawn, execFile } from "node:child_process"
import { promisify } from "node:util"
import { createServer } from "node:http"
import { mkdtemp, mkdir, readFile, writeFile, realpath, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const run = promisify(execFile)
const executable = process.env.NGINX_EXECUTABLE
const configPath = process.env.NGINX_SITE_CONFIG || fileURLToPath(new URL("./nginx-dockapi.conf", import.meta.url))
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const quote = (value) => JSON.stringify(value.replaceAll("\\", "/"))
async function freePort() {
  const server = createServer()
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  const port = server.address().port
  await new Promise((resolve) => server.close(resolve))
  return port
}

test("proxy configuration does not require an independently deployed frontend", async () => {
  const config = await readFile(configPath, "utf8")
  assert.doesNotMatch(config, /admin-headers\.conf|current\/web|cmcc_static_cache|try_files/)
  assert.match(config, /location \/ \{[\s\S]*?proxy_pass http:\/\/127\.0\.0\.1:4096;/)
  assert.match(config, /location \^~ \/api\/ \{[\s\S]*?proxy_pass http:\/\/127\.0\.0\.1:8081;/)
})

test(
  "nginx proxies pages to OpenCode and management requests to DockAPI",
  { skip: !executable, timeout: 30000 },
  async (t) => {
    const root = await mkdtemp(path.join(tmpdir(), "opencode-admin-nginx-test-"))
    const policy = "default-src 'self'; script-src 'self'"
    const html = "<html><body>admin shell from OpenCode</body></html>"
    let apiRequests = 0
    const api = createServer((request, response) => {
      apiRequests++
      response.setHeader("Content-Type", "application/json")
      response.statusCode = request.url === "/api/admin/forbidden" ? 403 : 200
      response.end(JSON.stringify({ url: request.url, headers: request.headers }))
    })
    const opencode = createServer((request, response) => {
      response.setHeader("X-Test-Upstream", "opencode")
      if (request.url === "/global/health") {
        response.setHeader("Content-Type", "application/json")
        response.end(JSON.stringify({ headers: request.headers }))
        return
      }
      if (request.url === "/assets/missing.js") {
        response.statusCode = 404
        response.end("missing")
        return
      }
      if (request.url.startsWith("/assets/")) {
        response.setHeader("Content-Type", "application/javascript")
        response.setHeader("Cache-Control", "public, max-age=31536000, immutable")
        response.end("export default true")
        return
      }
      response.setHeader("Content-Type", "text/html")
      response.setHeader("Content-Security-Policy", policy)
      response.setHeader("Cache-Control", "no-cache")
      response.end(html)
    })
    let child
    let config
    let port
    try {
      await new Promise((resolve) => api.listen(0, "127.0.0.1", resolve))
      await new Promise((resolve) => opencode.listen(0, "127.0.0.1", resolve))
      port = await freePort()
      for (const folder of [path.join(root, "logs"), path.join(root, "temp")]) await mkdir(folder, { recursive: true })
      const template = await readFile(configPath, "utf8")
      const server = template
        .replace("listen 3002;", `listen 127.0.0.1:${port};`)
        .replace("listen [::]:3002;", "")
        .replaceAll("/var/log/nginx/dockapi_access.log", quote(path.join(root, "access.log")))
        .replaceAll("/var/log/nginx/dockapi_error.log", quote(path.join(root, "error.log")))
        .replaceAll("127.0.0.1:8081", `127.0.0.1:${api.address().port}`)
        .replaceAll("127.0.0.1:4096", `127.0.0.1:${opencode.address().port}`)
      config = path.join(root, "nginx.conf")
      await writeFile(
        config,
        `worker_processes 1; daemon off; pid ${quote(path.join(root, "nginx.pid"))};\nevents { worker_connections 64; }\nhttp { default_type application/octet-stream; ${server} }`,
      )
      const args = ["-p", root.replaceAll("\\", "/") + "/", "-c", config]
      await run(executable, ["-t", ...args], { windowsHide: true, timeout: 5000 })
      child = spawn(executable, args, { windowsHide: true, stdio: "ignore" })
      let ready = false
      for (let i = 0; i < 60; i++) {
        ready = await fetch(`http://127.0.0.1:${port}/admin`)
          .then((response) => response.ok)
          .catch(() => false)
        if (ready) break
        await sleep(100)
      }
      assert.ok(ready, "Nginx did not proxy the admin shell")
      const origin = `http://127.0.0.1:${port}`
      await t.test("root keeps the landing redirect", async () => {
        const response = await fetch(origin + "/", { redirect: "manual" })
        assert.equal(response.status, 302)
        assert.equal(new URL(response.headers.get("location"), origin).pathname, "/landing/index.html")
      })
      await t.test("admin routes and business pages preserve OpenCode responses", async () => {
        for (const pathname of [
          "/admin",
          "/admin/",
          "/admin/users",
          "/admin/cases?page=2",
          "/index.html",
          "/app",
          "/landing/index.html",
        ]) {
          const response = await fetch(origin + pathname)
          assert.equal(response.status, 200)
          assert.equal(await response.text(), html)
          assert.equal(response.headers.get("x-test-upstream"), "opencode")
          assert.equal(response.headers.get("content-security-policy"), policy)
          assert.equal(response.headers.get("cache-control"), "no-cache")
        }
      })
      await t.test("frontend resources retain upstream types, caching and missing-file errors", async () => {
        for (const pathname of [
          "/assets/admin-testbuild.js",
          "/assets/worker-testbuild.mjs",
          "/assets/unhashed.js",
          "/brand/logo.svg",
          "/site.webmanifest",
          "/apple-touch-icon-v3.png",
        ]) {
          const response = await fetch(origin + pathname)
          assert.equal(response.status, 200)
          assert.equal(response.headers.get("x-test-upstream"), "opencode")
          if (pathname.startsWith("/assets/")) {
            assert.match(response.headers.get("content-type"), /javascript/)
            assert.match(response.headers.get("cache-control"), /immutable/)
          }
          await response.text()
        }
        assert.equal((await fetch(origin + "/assets/missing.js")).status, 404)
      })
      const headers = {
        Authorization: "Bearer test-only-user-token",
        "X-OpenCode-User-ID": "forged-user",
        "X-DockAPI-Service-Token": "forged-service-token",
      }
      await t.test("DockAPI receives the original route and login token, not internal identity headers", async () => {
        const response = await fetch(origin + "/api/admin/users?page=1&size=20", { headers })
        const data = await response.json()
        assert.equal(data.url, "/api/admin/users?page=1&size=20")
        assert.equal(data.headers.authorization, headers.Authorization)
        assert.equal(data.headers["x-opencode-user-id"], undefined)
        assert.equal(data.headers["x-dockapi-service-token"], undefined)
        assert.equal(data.headers["x-forwarded-port"], String(port))
        assert.equal((await fetch(origin + "/api/admin/forbidden")).status, 403)
      })
      await t.test("internal quota requests never reach DockAPI", async () => {
        const before = apiRequests
        for (const suffix of ["reserve", "finish", "heartbeat"]) {
          assert.equal(
            (await fetch(origin + "/api/internal/token-quota/" + suffix, { method: "POST", headers })).status,
            404,
          )
        }
        assert.equal(apiRequests, before)
      })
      await t.test("OpenCode also rejects client-supplied internal identity headers", async () => {
        const response = await fetch(origin + "/global/health", { headers })
        const data = await response.json()
        assert.equal(data.headers.authorization, headers.Authorization)
        assert.equal(data.headers["x-opencode-user-id"], undefined)
        assert.equal(data.headers["x-dockapi-service-token"], undefined)
      })
      await t.test("admin pages depend on OpenCode while DockAPI stays independently reachable", async () => {
        await new Promise((resolve) => opencode.close(resolve))
        assert.equal((await fetch(origin + "/admin")).status, 502)
        assert.equal((await fetch(origin + "/api/admin/users")).status, 200)
      })
    } finally {
      if (config)
        await run(executable, ["-s", "quit", "-p", root.replaceAll("\\", "/") + "/", "-c", config], {
          windowsHide: true,
          timeout: 5000,
        }).catch(() => child?.kill())
      if (child && child.exitCode === null)
        await Promise.race([new Promise((resolve) => child.once("exit", resolve)), sleep(3000)])
      if (child && child.exitCode === null) {
        child.kill()
        throw new Error("Owned Nginx test process did not stop")
      }
      for (const server of [api, opencode]) {
        server.closeAllConnections()
        await new Promise((resolve) => server.close(resolve))
      }
      const target = await realpath(root)
      const parent = await realpath(tmpdir())
      assert.equal(path.dirname(target).toLowerCase(), parent.toLowerCase())
      assert.ok(path.basename(target).startsWith("opencode-admin-nginx-test-"))
      await rm(target, { recursive: true, force: true })
    }
  },
)
