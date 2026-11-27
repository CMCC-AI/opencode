import { tool } from "@opencode-ai/plugin"
import os from "node:os"
import { execFileSync } from "node:child_process"
import { normalizeHardwareProfile } from "../lib/hardware.mjs"

function gpuName() {
  try {
    if (process.platform === "darwin") return execFileSync("system_profiler", ["SPDisplaysDataType"], { encoding: "utf8", timeout: 10000 }).match(/Chipset Model:\s*(.+)/)?.[1]?.trim() || "Apple MPS（需由框架确认）"
    return execFileSync("nvidia-smi", ["--query-gpu=name", "--format=csv,noheader"], { encoding: "utf8", timeout: 5000 }).trim() || "未检测到"
  } catch { return "未检测到" }
}

export default tool({
  description: "检查本机 CPU、内存与可见加速设备，生成中文科研执行能力画像；画像只说明条件，不代表实验已经运行。",
  args: {},
  async execute() { return JSON.stringify(normalizeHardwareProfile({ platform: os.platform(), arch: os.arch(), cpus: os.cpus().length, memoryBytes: os.totalmem(), gpu: gpuName() }), null, 2) },
})
