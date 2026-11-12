import assert from "node:assert/strict"
import { test } from "node:test"
import { spawn, execFile } from "node:child_process"
import { promisify } from "node:util"
import { createServer } from "node:http"
import { mkdtemp, mkdir, readFile, writeFile, realpath, rm, access } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { adminHeaders } from "./static-ui.mjs"

const run = promisify(execFile)
const executable = process.env.NGINX_EXECUTABLE
const configPath = fileURLToPath(new URL("./nginx-dockapi.conf", import.meta.url))
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const quote = (value) => JSON.stringify(value.replaceAll("\\", "/"))
async function freePort() {
  const server = createServer()
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  const port = server.address().port
  await new Promise((resolve) => server.close(resolve))
  return port
}

test(
  "nginx serves admin and its assets with the research process unavailable",
  { skip: !executable, timeout: 30000 },
  async () => {
    const root = await mkdtemp(path.join(tmpdir(), "opencode-admin-nginx-test-"))
    const web = path.join(root, "web")
    const api = createServer((request, response) => {
      response.setHeader("Content-Type", "application/json")
      response.end('{"code":200,"data":"test-only DockAPI"}')
    })
    let child
    let config
    let port
    try {
      await new Promise((resolve) => api.listen(0, "127.0.0.1", resolve))
      port = await freePort()
      const unavailable = await freePort()
      const mimeCandidates = [
        process.env.NGINX_MIME_TYPES,
        path.join(path.dirname(executable), "conf/mime.types"),
        "/etc/nginx/mime.types",
      ].filter(Boolean)
      let mime
      for (const candidate of mimeCandidates) {
        if (
          await access(candidate).then(
            () => true,
            () => false,
          )
        ) {
          mime = candidate
          break
        }
      }
      assert.ok(mime, "Nginx MIME types are required")
      for (const folder of [
        web,
        path.join(root, "logs"),
        path.join(root, "temp"),
        path.join(web, "assets"),
        path.join(web, "brand"),
      ])
        await mkdir(folder, { recursive: true })
      const html =
        '<html><script id="oc-theme-preload-script">window.theme="light"</script><script src="/assets/admin-testbuild.js"></script><body>admin shell test</body></html>'
      await writeFile(path.join(web, "index.html"), html)
      await writeFile(path.join(web, "admin-headers.conf"), adminHeaders(html))
      await writeFile(path.join(web, "assets/admin-testbuild.js"), "window.adminLoaded=true")
      await writeFile(path.join(web, "assets/unhashed.js"), "window.testOnly=true")
      await writeFile(path.join(web, "assets/worker-testbuild.mjs"), "export default true")
      await writeFile(path.join(web, "brand/logo.svg"), '<svg xmlns="http://www.w3.org/2000/svg"/>')
      const template = await readFile(configPath, "utf8")
      const server = template
        .replace("listen 3002;", `listen 127.0.0.1:${port};`)
        .replace("listen [::]:3002;", "")
        .replaceAll("/opt/opencode-cmcc/current/web/admin-headers.conf", quote(path.join(web, "admin-headers.conf")))
        .replace("root /opt/opencode-cmcc/current/web;", `root ${quote(web)};`)
        .replaceAll("/var/log/nginx/dockapi_access.log", quote(path.join(root, "access.log")))
        .replaceAll("/var/log/nginx/dockapi_error.log", quote(path.join(root, "error.log")))
        .replaceAll("127.0.0.1:8081", `127.0.0.1:${api.address().port}`)
        .replaceAll("127.0.0.1:4096", `127.0.0.1:${unavailable}`)
      config = path.join(root, "nginx.conf")
      await writeFile(
        config,
        `worker_processes 1; daemon off; pid ${quote(path.join(root, "nginx.pid"))};\nevents { worker_connections 64; }\nhttp { include ${quote(mime)}; default_type application/octet-stream; ${server} }`,
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
      assert.ok(ready, "Nginx did not serve the independent admin shell")
      const origin = `http://127.0.0.1:${port}`
      for (const pathname of ["/admin", "/admin/users", "/admin/cases"]) {
        const response = await fetch(origin + pathname)
        assert.equal(response.status, 200)
        assert.equal(await response.text(), html)
        assert.match(response.headers.get("content-security-policy"), /sha256-/)
        assert.equal(response.headers.get("cache-control"), "no-cache")
      }
      const hashed = await fetch(origin + "/assets/admin-testbuild.js")
      assert.equal(hashed.status, 200)
      assert.match(hashed.headers.get("content-type"), /javascript/)
      assert.match(hashed.headers.get("cache-control"), /immutable/)
      assert.equal((await fetch(origin + "/assets/unhashed.js")).headers.get("cache-control"), "no-cache")
      assert.match((await fetch(origin + "/assets/worker-testbuild.mjs")).headers.get("content-type"), /javascript/)
      assert.equal((await fetch(origin + "/brand/logo.svg")).status, 200)
      assert.equal((await fetch(origin + "/assets/missing.js")).status, 404)
      assert.equal((await fetch(origin + "/api/health")).status, 200)
      assert.equal((await fetch(origin + "/global/health")).status, 502)
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
      await new Promise((resolve) => api.close(resolve))
      const target = await realpath(root)
      const parent = await realpath(tmpdir())
      assert.equal(path.dirname(target).toLowerCase(), parent.toLowerCase())
      assert.ok(path.basename(target).startsWith("opencode-admin-nginx-test-"))
      await rm(target, { recursive: true, force: true })
    }
  },
)
