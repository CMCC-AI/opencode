export * as ConfigAgent from "./agent"

import path from "path"
import { Exit, Schema } from "effect"
import { Glob } from "@opencode-ai/core/util/glob"
import { ConfigAgentV1 } from "@opencode-ai/core/v1/config/agent"
import { configEntryNameFromPath, configExpertAgentNameFromPath } from "./entry-name"
import * as ConfigMarkdown from "./markdown"
import { ConfigParse } from "./parse"

export async function load(dir: string) {
  const result: Record<string, ConfigAgentV1.Info> = {}
  await loadAgents(result, dir)
  await loadExpertAgents(result, dir, true)

  for (const bundled of await bundledExpertConfigDirs(dir)) {
    await loadExpertAgents(result, bundled, false)
  }

  return result
}

async function loadAgents(result: Record<string, ConfigAgentV1.Info>, dir: string) {
  for (const item of await Glob.scan("{agent,agents}/**/*.md", {
    cwd: dir,
    absolute: true,
    dot: true,
    symlink: true,
  })) {
    const md = await ConfigMarkdown.parse(item).catch(() => undefined)
    if (!md) continue

    const name = configEntryNameFromPath(path.relative(dir, item), ["agent/", "agents/"])

    result[name] = parseAgent(item, name, md, false)
  }
}

async function loadExpertAgents(result: Record<string, ConfigAgentV1.Info>, dir: string, overwrite: boolean) {
  for (const item of await Glob.scan("experts/*/{agent,agents}/**/*.md", {
    cwd: dir,
    absolute: true,
    dot: true,
    symlink: true,
  })) {
    const md = await ConfigMarkdown.parse(item).catch(() => undefined)
    if (!md) continue

    const name = configExpertAgentNameFromPath(path.relative(dir, item))
    if (!overwrite && result[name]) continue
    result[name] = parseAgent(item, name, md, true)
  }
}

async function bundledExpertConfigDirs(current: string) {
  if (process.env.NODE_ENV === "test") return []
  const currentDir = path.resolve(current)
  const candidates = [
    ...(process.env.OPENCODE_BUNDLED_CONFIG_DIR ? [process.env.OPENCODE_BUNDLED_CONFIG_DIR] : []),
    ...ancestorConfigDirs(process.cwd()),
  ]
  const seen = new Set<string>()
  const result: string[] = []

  for (const candidate of candidates) {
    const resolved = path.resolve(candidate)
    if (resolved === currentDir || seen.has(resolved)) continue

    seen.add(resolved)
    result.push(resolved)
  }

  return result
}

function ancestorConfigDirs(start: string) {
  const result: string[] = []

  for (let current = path.resolve(start); ; current = path.dirname(current)) {
    result.push(path.join(current, ".opencode"))
    if (path.dirname(current) === current) return result
  }
}

export async function loadMode(dir: string) {
  const result: Record<string, ConfigAgentV1.Info> = {}
  for (const item of await Glob.scan("{mode,modes}/*.md", {
    cwd: dir,
    absolute: true,
    dot: true,
    symlink: true,
  })) {
    const md = await ConfigMarkdown.parse(item).catch(() => undefined)
    if (!md) continue

    const config = {
      name: configEntryNameFromPath(path.relative(dir, item), ["mode/", "modes/"]),
      ...md.data,
      prompt: md.content.trim(),
    }
    const parsed = Schema.decodeUnknownExit(ConfigAgentV1.Info)(config, { errors: "all", propertyOrder: "original" })
    if (Exit.isSuccess(parsed)) {
      result[config.name] = {
        ...parsed.value,
        mode: "primary" as const,
      }
    }
  }
  return result
}

function parseAgent(
  item: string,
  name: string,
  md: Awaited<ReturnType<typeof ConfigMarkdown.parse>>,
  pathNameWins: boolean,
) {
  const config = pathNameWins
    ? {
        ...md.data,
        name,
        prompt: md.content.trim(),
      }
    : {
        name,
        ...md.data,
        prompt: md.content.trim(),
      }
  return ConfigParse.schema(ConfigAgentV1.Info, config, item)
}
