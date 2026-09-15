import { resolve } from "node:path"
import type { Bar } from "./types"

const pythonRoot = resolve(import.meta.dir, "../../packages/app-stock/python")
const executable = resolve(pythonRoot, ".venv/bin/python")
const bridge = resolve(pythonRoot, "market_data.py")
const proxyEnvironmentVariables = new Set(["http_proxy", "https_proxy", "all_proxy", "no_proxy"])

export async function runFreeMarketData(args: string[], signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("数据任务已停止", "AbortError")
  const timeoutMs = args[0] === "eps-backtest" ? 5 * 60 * 1_000 : 45 * 1_000
  const process = Bun.spawn([executable, bridge, ...args], {
    cwd: pythonRoot,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...Object.fromEntries(
        Object.entries(Bun.env).filter(
          ([key, value]) => value !== undefined && !proxyEnvironmentVariables.has(key.toLowerCase()),
        ),
      ),
      PYTHONUNBUFFERED: "1",
      NO_PROXY: "*",
      no_proxy: "*",
    },
  })
  let timedOut = false
  const abort = () => process.kill()
  const timeout = setTimeout(() => {
    timedOut = true
    process.kill()
  }, timeoutMs)
  signal?.addEventListener("abort", abort, { once: true })
  const [stdout, stderr, status] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]).finally(() => {
    clearTimeout(timeout)
    signal?.removeEventListener("abort", abort)
  })
  if (signal?.aborted) throw new DOMException("数据任务已停止", "AbortError")
  if (timedOut) {
    const progress = stderr.trim().split("\n").filter(Boolean).slice(-4).join("\n")
    throw new Error(
      `免费数据任务超过 ${timeoutMs / 60_000} 分钟，已自动停止；缓存已经保存，请向用户报告进度，不要在本轮自动重试。${progress ? `\n最后进度：\n${progress}` : ""}`,
    )
  }
  if (status !== 0) throw new Error(stderr.trim() || stdout.trim() || `免费行情数据进程退出，状态码 ${status}`)
  if (!stdout.trim()) throw new Error("免费行情数据进程没有返回结果")
  return stdout.trim()
}

export async function fetchFreeBars(input: {
  provider: "baostock" | "akshare" | "westock"
  symbol: string
  startDate: string
  endDate: string
  signal?: AbortSignal
}) {
  const value: unknown = JSON.parse(
    await runFreeMarketData(
      [
        "bars",
        "--provider",
        input.provider,
        "--symbol",
        input.symbol,
        "--start-date",
        input.startDate,
        "--end-date",
        input.endDate,
      ],
      input.signal,
    ),
  )
  if (!Array.isArray(value)) throw new Error("免费行情数据格式错误")
  return value.map((item): Bar => {
    if (typeof item !== "object" || item === null) throw new Error("免费行情数据行格式错误")
    const row = item as Record<string, unknown>
    return {
      symbol: requiredString(row.code, "股票代码"),
      date: requiredString(row.date, "交易日期"),
      open: requiredNumber(row.open, "开盘价"),
      high: requiredNumber(row.high, "最高价"),
      low: requiredNumber(row.low, "最低价"),
      close: requiredNumber(row.close, "收盘价"),
      volume: requiredNumber(row.volume, "成交量"),
      amount: optionalNumber(row.amount),
    }
  })
}

function requiredString(value: unknown, label: string) {
  if (typeof value !== "string" || !value) throw new Error(`${label}格式错误`)
  return value
}

function requiredNumber(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${label}格式错误`)
  return value
}

function optionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}
