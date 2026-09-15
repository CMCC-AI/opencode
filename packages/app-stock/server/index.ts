import { join, resolve } from "node:path"
import { createOpencodeClient } from "@opencode-ai/sdk/v2/client"
import { analyzeBars, assessBacktest, fetchBars, runSmaCrossBacktest, runSmaSensitivity } from "@opencode-ai/stock-core"
import type {
  AnalyzeResponse,
  BacktestResponse,
  CancelChatResponse,
  ChatResponse,
  HealthResponse,
  ModelReference,
  ModelsResponse,
} from "../src/lib/contracts"
import { parseAnalyzeRequest, parseBacktestRequest, parseCancelChatRequest, parseChatRequest } from "./input"
import { parseStrategyArtifact, safeSessionId, summarizeStrategyArtifact } from "./artifact"

const port = Number(process.env.PORT ?? 4174)
const repositoryRoot = resolve(import.meta.dir, "../../..")
const distRoot = resolve(import.meta.dir, "../dist")
const opencodeUrl = process.env.OPENCODE_SERVER_URL?.trim() || "http://127.0.0.1:4096"
const stockWorkspace = process.env.OPENCODE_STOCK_WORKSPACE?.trim() || repositoryRoot
const artifactRoot = resolve(import.meta.dir, "../python/.artifacts")
const maximumBodyBytes = 128 * 1024
const maximumMarketRequests = 4
const sessionLifetimeMs = 12 * 60 * 60 * 1000
const modelCacheLifetimeMs = 30 * 1000
const stockSessions = new Map<string, { opencodeSessionId: string; lastUsedAt: number }>()
let modelCache: { expiresAt: number; response: ModelsResponse } | undefined
let activeMarketRequests = 0

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

const server = Bun.serve({
  port,
  fetch(request) {
    return route(request).catch((error) => {
      const status = error instanceof HttpError ? error.status : 500
      if (status >= 500) console.error("AlphaLab request failed", error)
      const message = error instanceof HttpError ? error.message : "服务处理请求失败"
      return json({ error: message }, status)
    })
  },
})

console.log(`AlphaLab AI 服务已启动：http://127.0.0.1:${server.port}`)

async function route(request: Request) {
  const url = new URL(request.url)
  if (request.method === "GET" && url.pathname === "/api/health") return health()
  if (request.method === "GET" && url.pathname === "/api/models") return models()
  if (request.method === "GET" && url.pathname.startsWith("/api/artifacts/")) return artifactFile(url.pathname)
  if (request.method === "POST" && url.pathname === "/api/backtest") return backtest(request)
  if (request.method === "POST" && url.pathname === "/api/analyze") return analyze(request)
  if (request.method === "POST" && url.pathname === "/api/chat") return chat(request)
  if (request.method === "POST" && url.pathname === "/api/chat/cancel") return cancelChat(request)
  if (url.pathname.startsWith("/api/")) return json({ error: "接口不存在" }, 404)
  return staticFile(url.pathname)
}

async function models() {
  return json(await loadModels())
}

async function health() {
  const opencodeReady = await fetch(`${opencodeUrl}/global/health`, {
    headers: authorizationHeaders(),
    signal: AbortSignal.timeout(1_500),
  })
    .then((response) => response.ok)
    .catch(() => false)
  const result: HealthResponse = {
    ok: true,
    providers: {
      baostock: await Bun.file(resolve(import.meta.dir, "../python/.venv/bin/python")).exists(),
      akshare: await Bun.file(resolve(import.meta.dir, "../python/uv.lock")).exists(),
      tushare: Boolean(process.env.TUSHARE_TOKEN?.trim()),
      alphaVantage: Boolean(process.env.ALPHA_VANTAGE_API_KEY?.trim()),
    },
    opencode: { configured: opencodeReady },
  }
  return json(result)
}

async function backtest(request: Request) {
  const input = await parseBody(request, parseBacktestRequest)
  return withMarketSlot(async () => {
    const series = await marketData(input)
    const config = {
      fastWindow: input.fastWindow,
      slowWindow: input.slowWindow,
      initialCash: input.initialCash,
      commissionRate: input.commissionRate,
      minimumCommission: input.minimumCommission,
      stampDutyRate: input.stampDutyRate,
      slippageBps: input.slippageBps,
      lotSize: input.lotSize,
    }
    const backtestResult = runSmaCrossBacktest(series.bars, config)
    const sensitivity = runSmaSensitivity(series.bars, config)
    const result: BacktestResponse = {
      data: { provider: series.provider, symbol: series.symbol, adjustment: series.adjustment },
      result: backtestResult,
      evaluation: assessBacktest(backtestResult, sensitivity),
      sensitivity,
      disclaimer: "历史回测不代表未来表现，本结果仅用于研究，不构成投资建议。",
    }
    return json(result)
  })
}

async function analyze(request: Request) {
  const input = await parseBody(request, parseAnalyzeRequest)
  return withMarketSlot(async () => {
    const series = await marketData(input)
    const result: AnalyzeResponse = {
      data: { provider: series.provider, symbol: series.symbol, adjustment: series.adjustment },
      result: analyzeBars(series.bars),
      disclaimer: "历史行情分析不代表未来表现，本结果仅用于研究，不构成投资建议。",
    }
    return json(result)
  })
}

async function chat(request: Request) {
  const input = await parseBody(request, parseChatRequest)
  const client = createOpencodeClient({
    baseUrl: opencodeUrl,
    directory: stockWorkspace,
    headers: authorizationHeaders(),
  })
  pruneStockSessions()
  const handle = input.sessionId ?? input.requestId ?? crypto.randomUUID()
  const existing = input.sessionId ? stockSessions.get(input.sessionId) : undefined
  if (input.sessionId && !existing) throw new HttpError(409, "股票研究会话已失效，请新建会话后重试")
  const opencodeSessionId = existing?.opencodeSessionId ?? (await createChatSession(client))
  stockSessions.set(handle, { opencodeSessionId, lastUsedAt: Date.now() })
  const prompt = input.strategyContext
    ? `当前策略上下文：\n${input.strategyContext}\n\n用户问题：${input.message}`
    : input.message
  if (input.model) await requireSelectableModel(input.model)
  const previousArtifact = await readArtifactText(opencodeSessionId)
  const response = await client.session.prompt(
    {
      sessionID: opencodeSessionId,
      agent: "stock-analyst",
      ...(input.model ? { model: input.model } : {}),
      parts: [{ type: "text", text: prompt }],
    },
    { throwOnError: true },
  )
  const modelAnswer = response.data.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim()
  const currentArtifact = await readArtifactText(opencodeSessionId)
  const artifact =
    currentArtifact && currentArtifact !== previousArtifact
      ? parseStrategyArtifact(opencodeSessionId, currentArtifact)
      : undefined
  const answer = modelAnswer || (artifact && currentArtifact ? summarizeStrategyArtifact(currentArtifact) : "")
  if (!answer && response.data.info.error?.name === "MessageAbortedError") {
    throw new HttpError(409, "AI 分析已中断，请重试；EPS 回测建议先选择 6 到 12 个月区间")
  }
  if (!answer) throw new Error("OpenCode 没有返回可展示的回答")
  return json({ sessionId: handle, answer, artifact } satisfies ChatResponse)
}

async function readArtifactText(sessionId: string) {
  const file = Bun.file(resolve(artifactRoot, safeSessionId(sessionId), "result.json"))
  return (await file.exists()) ? file.text() : undefined
}

async function artifactFile(pathname: string) {
  const match = pathname.match(/^\/api\/artifacts\/([a-zA-Z0-9_-]+)\/(report\.html|result\.json)$/)
  if (!match) throw new HttpError(404, "策略报告不存在")
  const file = Bun.file(resolve(artifactRoot, match[1]!, match[2]!))
  if (!(await file.exists())) throw new HttpError(404, "策略报告不存在")
  return new Response(file, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": match[2] === "report.html" ? "text/html; charset=utf-8" : "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  })
}

async function requireSelectableModel(model: ModelReference) {
  if (
    (await loadModels()).models.some((item) => item.providerID === model.providerID && item.modelID === model.modelID)
  )
    return
  throw new HttpError(400, "所选模型未连接或不支持工具调用，请刷新模型列表后重试")
}

async function loadModels() {
  if (modelCache && modelCache.expiresAt > Date.now()) return modelCache.response
  const client = createOpencodeClient({
    baseUrl: opencodeUrl,
    directory: stockWorkspace,
    headers: authorizationHeaders(),
  })
  const response = await client.provider.list({ directory: stockWorkspace }, { throwOnError: true })
  const connected = new Set(response.data.connected)
  const models = response.data.all
    .filter((provider) => connected.has(provider.id))
    .flatMap((provider) =>
      Object.values(provider.models)
        .filter(
          (model) =>
            model.status !== "deprecated" &&
            model.capabilities.toolcall &&
            model.capabilities.input.text &&
            model.capabilities.output.text,
        )
        .map((model) => ({
          id: `${provider.id}/${model.id}`,
          providerID: provider.id,
          modelID: model.id,
          name: model.name,
          providerName: provider.name,
          free:
            model.cost.input === 0 &&
            model.cost.output === 0 &&
            model.cost.cache.read === 0 &&
            model.cost.cache.write === 0,
        })),
    )
    .sort(
      (left, right) =>
        Number(right.free) - Number(left.free) ||
        left.providerName.localeCompare(right.providerName) ||
        left.name.localeCompare(right.name),
    )
  const preferred = process.env.OPENCODE_STOCK_MODEL?.trim() || "opencode/big-pickle"
  const defaults = response.data.all
    .filter((provider) => connected.has(provider.id))
    .map((provider) => `${provider.id}/${response.data.default[provider.id]}`)
  const defaultModelId = [preferred, ...defaults].find((id) => models.some((model) => model.id === id)) ?? models[0]?.id
  const result = { models, defaultModelId } satisfies ModelsResponse
  modelCache = { expiresAt: Date.now() + modelCacheLifetimeMs, response: result }
  return result
}

async function cancelChat(request: Request) {
  const input = await parseBody(request, parseCancelChatRequest)
  const existing = stockSessions.get(input.requestId)
  if (!existing) return json({ ok: true } satisfies CancelChatResponse)
  const client = createOpencodeClient({
    baseUrl: opencodeUrl,
    directory: stockWorkspace,
    headers: authorizationHeaders(),
  })
  await client.session.abort({ sessionID: existing.opencodeSessionId }).catch(() => {})
  return json({ ok: true } satisfies CancelChatResponse)
}

async function createChatSession(client: ReturnType<typeof createOpencodeClient>) {
  const response = await client.session.create(
    {
      title: `股票策略研究 ${new Date().toISOString().slice(0, 10)}`,
      agent: "stock-analyst",
      metadata: { product: "app-stock" },
    },
    { throwOnError: true },
  )
  return response.data.id
}

async function parseBody<T>(request: Request, parse: (value: unknown) => T) {
  return readJson(request)
    .then(parse)
    .catch((error) => {
      if (error instanceof HttpError) throw error
      throw new HttpError(400, error instanceof Error ? error.message : "请求体格式错误")
    })
}

async function readJson(request: Request) {
  const declaredSize = Number(request.headers.get("content-length"))
  if (Number.isFinite(declaredSize) && declaredSize > maximumBodyBytes) {
    throw new HttpError(413, "请求内容不能超过 128 KB")
  }
  const body = await request.text()
  if (new TextEncoder().encode(body).byteLength > maximumBodyBytes) throw new HttpError(413, "请求内容不能超过 128 KB")
  return JSON.parse(body) as unknown
}

async function marketData(input: Parameters<typeof fetchBars>[0]) {
  return fetchBars(input).catch((error) => {
    const message = error instanceof Error ? error.message : "行情数据请求失败"
    throw new HttpError(message.startsWith("缺少 ") ? 503 : 502, message)
  })
}

async function withMarketSlot<T>(task: () => Promise<T>) {
  if (activeMarketRequests >= maximumMarketRequests) throw new HttpError(429, "当前回测任务较多，请稍后重试")
  activeMarketRequests++
  return task().finally(() => activeMarketRequests--)
}

function pruneStockSessions() {
  const cutoff = Date.now() - sessionLifetimeMs
  Array.from(stockSessions.entries())
    .filter(([, session]) => session.lastUsedAt < cutoff)
    .forEach(([handle]) => stockSessions.delete(handle))
  Array.from(stockSessions.keys())
    .slice(0, Math.max(0, stockSessions.size - 256))
    .forEach((handle) => stockSessions.delete(handle))
}

function authorizationHeaders() {
  const username = process.env.OPENCODE_SERVER_USERNAME?.trim()
  const password = process.env.OPENCODE_SERVER_PASSWORD
  if (!username || password === undefined) return undefined
  return { Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}` }
}

async function staticFile(pathname: string) {
  const requested = resolve(distRoot, `.${decodeURIComponent(pathname)}`)
  if (requested.startsWith(`${distRoot}/`)) {
    const file = Bun.file(requested)
    if (await file.exists()) return new Response(file)
  }
  const index = Bun.file(join(distRoot, "index.html"))
  if (await index.exists()) return new Response(index, { headers: { "Content-Type": "text/html; charset=utf-8" } })
  return json({ error: "前端尚未构建，请运行 bun run build" }, 503)
}

function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  })
}
