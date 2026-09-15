const cwd = new URL("..", import.meta.url).pathname
const children = [
  Bun.spawn(["bun", "run", "dev:server"], { cwd, stdout: "inherit", stderr: "inherit" }),
  Bun.spawn(["bun", "x", "vite", "--host", "127.0.0.1", "--port", process.env.VITE_PORT ?? "3010", "--strictPort"], {
    cwd,
    stdout: "inherit",
    stderr: "inherit",
  }),
]

function stop() {
  children.forEach((child) => child.kill())
}

process.on("SIGINT", stop)
process.on("SIGTERM", stop)

await Promise.race(children.map((child) => child.exited))
stop()
