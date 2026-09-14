import { describe, expect, test } from "bun:test"
import { createCaseListCache } from "./case-list-cache"

describe("case list cache", () => {
  test("returns fresh data immediately but expires it", async () => {
    let now = 0
    const cache = createCaseListCache<number>(() => now, 30)
    await cache.load("overview", async () => 1)
    expect(cache.peek("overview")).toBe(1)
    now = 30
    expect(cache.peek("overview")).toBeUndefined()
  })

  test("coalesces in-flight requests, then revalidates cached data", async () => {
    const cache = createCaseListCache<number>()
    let requests = 0
    const fetcher = async () => ++requests
    const first = cache.load("a", fetcher)
    expect(cache.load("a", fetcher)).toBe(first)
    await first
    await cache.load("a", fetcher)
    expect(requests).toBe(2)
    expect(cache.peek("a")).toBe(2)
  })

  test("does not mix filters, pages or providers", async () => {
    const cache = createCaseListCache<number>()
    await cache.load("science?page=1", async () => 1)
    await cache.load("science?page=2", async () => 2)
    expect(cache.peek("science?page=1")).toBe(1)
    expect(cache.peek("government?page=1")).toBeUndefined()
    expect(createCaseListCache<number>().peek("science?page=1")).toBeUndefined()
  })

  test("invalidated requests cannot resurrect deleted cases or cross an auth change", async () => {
    const cache = createCaseListCache<number>()
    const response = Promise.withResolvers<number>()
    const old = cache.load("a", () => response.promise)
    cache.clear()
    await cache.load("a", async () => 2)
    response.resolve(1)
    await expect(old).rejects.toThrow("案例列表已更新")
    expect(cache.peek("a")).toBe(2)
  })

  test("old request cleanup cannot remove a replacement request", async () => {
    const cache = createCaseListCache<number>()
    const response = Promise.withResolvers<number>()
    const nextResponse = Promise.withResolvers<number>()
    const old = cache.load("a", () => response.promise)
    cache.clear()
    const next = cache.load("a", () => nextResponse.promise)
    response.resolve(1)
    await expect(old).rejects.toThrow()
    expect(cache.load("a", async () => 3)).toBe(next)
    nextResponse.resolve(2)
    await next
  })

  test("bounds memory and retries failed requests", async () => {
    const cache = createCaseListCache<number>(Date.now, 30_000, 2)
    for (const key of ["a", "b", "c"]) await cache.load(key, async () => 1)
    expect(cache.peek("a")).toBeUndefined()
    await expect(
      cache.load("failure", async () => {
        throw new Error("offline")
      }),
    ).rejects.toThrow("offline")
    expect(cache.peek("failure")).toBeUndefined()
    expect(await cache.load("failure", async () => 2)).toBe(2)
    cache.clear()
    expect(cache.peek("failure")).toBeUndefined()
  })
})
