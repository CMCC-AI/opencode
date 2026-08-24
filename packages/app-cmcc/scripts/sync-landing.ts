// 一键同步落地页：在 product-statspanel 项目构建，并把产物拷贝到 app-cmcc/public/landing/
// 用法：bun run ./scripts/sync-landing.ts [--skip-build]
// 落地页项目默认取本仓库同级目录（注意目录名中的连字符是 U+2011 非普通减号），可用 LANDING_DIR 覆盖
import { cp, mkdir, rm, stat } from "node:fs/promises"
import path from "node:path"

const skipBuild = process.argv.includes("--skip-build")
const landingDir = process.env.LANDING_DIR ?? path.resolve(import.meta.dir, "../../../..", "product‑statspanel")
const targetDir = path.resolve(import.meta.dir, "../public/landing")

if (!(await stat(landingDir)).isDirectory()) {
  throw new Error(`landing project not found: ${landingDir} (set LANDING_DIR to override)`)
}

if (!skipBuild) {
  const build = Bun.spawnSync({
    cmd: ["cmd", "/c", "npm", "run", "build"],
    cwd: landingDir,
    stdout: "inherit",
    stderr: "inherit",
  })
  if (build.exitCode !== 0) throw new Error(`landing build failed with exit code ${build.exitCode}`)
}

await rm(targetDir, { recursive: true, force: true })
await mkdir(path.join(targetDir, "assets"), { recursive: true })
await cp(path.join(landingDir, "dist", "index.html"), path.join(targetDir, "index.html"))
await cp(path.join(landingDir, "dist", "assets"), path.join(targetDir, "assets"), { recursive: true })

console.log(`landing synced: ${targetDir}`)
