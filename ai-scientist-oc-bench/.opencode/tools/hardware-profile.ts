import { tool } from "@opencode-ai/plugin"
import os from "node:os"
import { execFileSync } from "node:child_process"
import { normalizeHardwareProfile } from "../lib/hardware.mjs"

function gpuName() {
  try {
    if (process.platform === "darwin") return execFileSync("system_profiler", ["SPDisplaysDataType"], { encoding: "utf8", timeout: 10000 }).match(/Chipset Model:\s*(.+)/)?.[1]?.trim() || "Apple GPU"
    return execFileSync("nvidia-smi", ["--query-gpu=name", "--format=csv,noheader"], { encoding: "utf8", timeout: 5000 }).trim() || "Not detected"
  } catch { return "Not detected" }
}

export default tool({
  description: "Report local CPU, memory, and visible GPU capability.",
  args: {},
  async execute() {
    return JSON.stringify(normalizeHardwareProfile({ platform: os.platform(), arch: os.arch(), cpus: os.cpus().length, memoryBytes: os.totalmem(), gpu: gpuName() }), null, 2)
  },
})
