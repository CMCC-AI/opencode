export function normalizeHardwareProfile(raw = {}) {
  const memoryGB = Math.round((Number(raw.memoryBytes || 0) / 1024 ** 3) * 10) / 10
  const gpu = raw.gpu || "未检测到"
  return {
    操作系统: raw.platform || "未知",
    架构: raw.arch || "未知",
    cpu核心数: Number(raw.cpus || 0),
    内存GB: memoryGB,
    加速设备: gpu,
    建议执行形态: gpu !== "未检测到" || memoryGB >= 8 ? "本地计算或缩比实验" : "设计方案、轻量验证或外部计算资源",
    真实性要求: "只有实际运行且保存日志与指标的任务才能标记为实验支持",
  }
}
