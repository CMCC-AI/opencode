const repositoryRoot = new URL("..", import.meta.url).pathname
const children = [
  Bun.spawn(["bun", "run", "dev:cmcc"], { cwd: repositoryRoot, stdout: "inherit", stderr: "inherit" }),
  Bun.spawn(["bun", "run", "dev:stock"], { cwd: repositoryRoot, stdout: "inherit", stderr: "inherit" }),
]

function stop() {
  children.forEach((child) => child.kill())
}

process.on("SIGINT", stop)
process.on("SIGTERM", stop)

await Promise.race(children.map((child) => child.exited))
stop()
