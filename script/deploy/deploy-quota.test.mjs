import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { after, before, test } from "node:test"
import { chmod, copyFile, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

const run = promisify(execFile)
const root = fileURLToPath(new URL("../../", import.meta.url))
const secret = "deployment-test-only-0123456789abcdef"
const bash = process.env.BASH_EXECUTABLE || "bash"
let workspace

before(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), "opencode-deploy-quota-test-"))
  for (const directory of ["script/deploy", "mock-bin", ".deploy", ".opencode/experts", ".opencode/skills", "packages/opencode/dist/opencode-linux-x64-baseline/bin"])
    await mkdir(path.join(workspace, directory), { recursive: true })
  for (const file of ["deploy_to_server.sh", "script/deploy/install-single-server.sh", "script/deploy/quota-env.sh", "script/deploy/opencode-cmcc.jsonc"])
    await copyFile(path.join(root, file), path.join(workspace, file))
  const binary = "packages/opencode/dist/opencode-linux-x64-baseline"
  await writeFile(path.join(workspace, binary, "bin/opencode"), "test-only OpenCode binary\n")
  await writeFile(path.join(workspace, binary, "bin/deepxiv-proxy"), "test-only proxy binary\n")
  await writeFile(path.join(workspace, binary, "DEEPXIV_URL"), "http://public.invalid:3100/\n")
  const mock = `#!/usr/bin/env bash
set -euo pipefail
command_name=\${0##*/}
printf '%s ' "$command_name" "$@" >>"$MOCK_COMMANDS"
printf '\\n' >>"$MOCK_COMMANDS"
case "$command_name" in
  bun)
    [[ -z \${DOCKAPI_QUOTA_SERVICE_TOKEN:-}\${OPENCODE_DOCKAPI_QUOTA_ENABLED:-}\${OPENCODE_DOCKAPI_URL:-} ]] || exit 81
    printf '%s' "\${3%/}"
    ;;
  ssh)
    case "$*" in
      *"cat > "*) cat >"$MOCK_QUOTA_CAPTURE" ;;
      *"sha256sum "*) printf 'test-digest\\n' ;;
      *"command -v rsync"*) [[ $MOCK_DELTA == 1 ]] ;;
      *"install-single-server.sh"*) printf 'installed\\n' >>"$MOCK_INSTALL_LOG" ;;
    esac
    ;;
  shasum) printf 'test-digest file\\n' ;;
esac
`
  for (const name of ["bun", "ssh", "scp", "rsync", "shasum"]) {
    const file = path.join(workspace, "mock-bin", name)
    await writeFile(file, mock)
    await chmod(file, 0o755)
  }
})

after(async () => {
  if (!workspace) return
  const target = await realpath(workspace)
  const parent = await realpath(tmpdir())
  assert.equal(path.dirname(target).toLowerCase(), parent.toLowerCase())
  assert.ok(path.basename(target).startsWith("opencode-deploy-quota-test-"))
  await rm(target, { recursive: true, force: true })
})

async function deploy(name, options = {}) {
  const log = path.join(workspace, `${name}.commands.log`)
  const capture = path.join(workspace, `${name}.quota.env`)
  const installed = path.join(workspace, `${name}.installed.log`)
  await writeFile(log, "")
  const env = { ...process.env }
  for (const key of ["OPENCODE_QUOTA_ENV_FILE", "OPENCODE_DOCKAPI_QUOTA_ENABLED", "OPENCODE_DOCKAPI_URL", "DOCKAPI_QUOTA_SERVICE_TOKEN"])
    delete env[key]
  Object.assign(env, {
    DEPLOY_HOST: "test-user@deployment.invalid",
    DEPLOY_ARCH: "x86_64",
    DEPLOY_SKIP_BUILD: "1",
    DEPLOY_BUILD_ONLY: "0",
    DEPLOY_UPLOAD_MODE: options.delta ? "delta" : "bundle",
    OPENCODE_VERSION: name,
    OPENCODE_PUBLIC_HOST: "public.invalid",
    DEEPLIT_PROXY_TARGET: "http://literature.invalid/",
    DEEPLIT_PROXY_PUBLIC_ORIGIN: "http://public.invalid:3100",
    MOCK_BIN: path.join(workspace, "mock-bin"),
    MOCK_COMMANDS: log,
    MOCK_QUOTA_CAPTURE: capture,
    MOCK_INSTALL_LOG: installed,
    MOCK_DELTA: options.delta ? "1" : "0",
    ...options.env,
  })
  const task = run(bash, ["--noprofile", "--norc", "-c", `
export PATH=/usr/bin:/bin:$PATH
if command -v cygpath >/dev/null 2>&1; then MOCK_BIN=$(cygpath -u "$MOCK_BIN"); fi
export PATH="$MOCK_BIN:$PATH"
exec bash --noprofile --norc ./deploy_to_server.sh
`], { cwd: workspace, env, windowsHide: true, timeout: 180000, maxBuffer: 1024 * 1024 })
  task.child.stdin.end()
  const result = await task
  const commands = await readFile(log, "utf8")
  assert.ok(!commands.includes(secret), "the service secret appeared in command arguments")
  assert.ok(!result.stdout.includes(secret) && !result.stderr.includes(secret), "the service secret appeared in logs")
  return { ...result, commands, capture, installed }
}

async function assertBundleHasNoSecret(name) {
  const archive = path.join(workspace, ".deploy", `opencode-cmcc-${name}-x86_64.tar.gz`)
  const task = run(bash, ["--noprofile", "--norc", "-c", `
export PATH=/usr/bin:/bin:$PATH
if command -v cygpath >/dev/null 2>&1; then QUOTA_TEST_ARCHIVE=$(cygpath -u "$QUOTA_TEST_ARCHIVE"); fi
tar --force-local -xOzf "$QUOTA_TEST_ARCHIVE"
`], {
    env: { ...process.env, QUOTA_TEST_ARCHIVE: archive }, windowsHide: true, timeout: 30000, maxBuffer: 2 * 1024 * 1024,
  })
  task.child.stdin.end()
  const result = await task
  assert.ok(!result.stdout.includes(secret), "the secret was included in an offline bundle")
  assert.match(result.stdout, /quota_validate/)
}

test("bundle deployment uploads private quota config over SSH stdin, not in the bundle", async () => {
  const file = path.join(workspace, ".deploy", "quota.env")
  await writeFile(file, `OPENCODE_DOCKAPI_QUOTA_ENABLED=true\nOPENCODE_DOCKAPI_URL=http://127.0.0.1:8081\nDOCKAPI_QUOTA_SERVICE_TOKEN=${secret}\n`)
  const result = await deploy("quota-bundle")
  assert.match(await readFile(result.capture, "utf8"), /OPENCODE_DOCKAPI_QUOTA_ENABLED="true"/)
  assert.ok((await readFile(result.capture, "utf8")).includes(secret))
  assert.match(await readFile(result.installed, "utf8"), /installed/)
  await assertBundleHasNoSecret("quota-bundle")
})

test("delta deployment transfers quota separately and passes only its path to the installer", async () => {
  const result = await deploy("quota-delta", { delta: true })
  assert.match(result.commands, /rsync --archive/)
  assert.match(result.commands, /quota-delta\/quota\.env/)
  assert.ok((await readFile(result.capture, "utf8")).includes(secret))
  assert.match(await readFile(result.installed, "utf8"), /installed/)
})

test("absent local settings preserve server quota configuration", async () => {
  await rm(path.join(workspace, ".deploy", "quota.env"))
  const result = await deploy("quota-preserve")
  assert.match(result.stdout, /preserving server configuration/)
  assert.ok(!result.commands.includes("cat >"))
  await assert.rejects(readFile(result.capture), { code: "ENOENT" })
  assert.match(await readFile(result.installed, "utf8"), /installed/)
})

test("explicit environment enables quota and build-only artifacts still contain no secret", async () => {
  const result = await deploy("quota-offline", { env: {
    DEPLOY_BUILD_ONLY: "1",
    OPENCODE_DOCKAPI_QUOTA_ENABLED: "true",
    OPENCODE_DOCKAPI_URL: "http://dockapi.internal:8081",
    DOCKAPI_QUOTA_SERVICE_TOKEN: secret,
  } })
  assert.ok(!result.commands.includes("ssh "))
  assert.match(result.stdout, /Quota secrets are not included/)
  await assertBundleHasNoSecret("quota-offline")
})

test("invalid or missing explicit quota configuration fails before any SSH call", async () => {
  for (const env of [
    { OPENCODE_DOCKAPI_QUOTA_ENABLED: "true", OPENCODE_DOCKAPI_URL: "http://localhost:8081", DOCKAPI_QUOTA_SERVICE_TOKEN: "short" },
    { OPENCODE_QUOTA_ENV_FILE: path.join(workspace, "absent.env") },
  ]) {
    await assert.rejects(deploy("quota-invalid", { env }))
    assert.equal(await readFile(path.join(workspace, "quota-invalid.commands.log"), "utf8"), "")
  }
})
