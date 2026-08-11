import { join } from "node:path"

const root = join(import.meta.dir, "..")
const source = join(root, "src")

const forbiddenCopies = [
  "app.tsx",
  "context/**/*",
  "i18n/**/*",
  "wsl/**/*",
  "addons/**/*",
  "hooks/**/*",
  "pages/layout.tsx",
  "pages/new-session.tsx",
  "pages/session.tsx",
  "components/prompt-input.tsx",
]

const copied = [
  ...forbiddenCopies.flatMap((pattern) =>
    Array.from(new Bun.Glob(pattern).scanSync({ cwd: source, onlyFiles: true })).map((file) => `src/${file}`),
  ),
  ...["e2e/**/*", "test-browser/**/*", "happydom.ts", "playwright.config.ts"].flatMap((pattern) =>
    Array.from(new Bun.Glob(pattern).scanSync({ cwd: root, onlyFiles: true })).filter(
      (file) => !file.startsWith("e2e/playwright-report/") && !file.startsWith("e2e/test-results/"),
    ),
  ),
]

if (copied.length) {
  throw new Error(`app-cmcc must not copy standard App files:\n${copied.map((file) => `- ${file}`).join("\n")}`)
}

const sourceFiles = Array.from(new Bun.Glob("**/*.{ts,tsx}").scanSync({ cwd: source, onlyFiles: true }))
const privateImports = (
  await Promise.all(
    sourceFiles.map(async (file) => ({
      file,
      private: /(?:from\s+|import\s*\(\s*)["']@\//.test(await Bun.file(join(source, file)).text()),
    })),
  )
).filter((item) => item.private)

if (privateImports.length) {
  throw new Error(
    `CMCC code must use @opencode-ai/app or @opencode-ai/app/extension:\n${privateImports
      .map((item) => `- src/${item.file}`)
      .join("\n")}`,
  )
}

const cmccPackage = await Bun.file(join(root, "package.json")).json()
const appPackage = await Bun.file(join(root, "..", "app", "package.json")).json()

if (cmccPackage.dependencies?.["@opencode-ai/app"] !== "workspace:*") {
  throw new Error("app-cmcc must depend on @opencode-ai/app through workspace:*")
}

if (cmccPackage.version !== appPackage.version) {
  throw new Error(`App version ${appPackage.version} and app-cmcc version ${cmccPackage.version} must stay aligned`)
}

console.log(`CMCC thin-shell check passed against App ${appPackage.version}`)
