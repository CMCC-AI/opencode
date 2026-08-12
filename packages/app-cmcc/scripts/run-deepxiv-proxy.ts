import { startDeepXivProxy } from "./deepxiv-proxy"

const server = await startDeepXivProxy()

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    server.closeAllConnections()
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(1), 5_000).unref()
  })
}
