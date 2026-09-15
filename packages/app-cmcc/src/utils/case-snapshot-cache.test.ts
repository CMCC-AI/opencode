import { describe, expect, test } from "bun:test"
import { createCaseSnapshotCache } from "./case-snapshot-cache"

describe("case snapshot version cache", () => {
  test("same version is downloaded only once; a new version replaces it", async () => {
    const cache = createCaseSnapshotCache<number>()
    let requests = 0
    const fetcher = async () => ({ value: ++requests, size: 10 })
    expect(await cache.load("case", "v1", fetcher)).toBe(1)
    expect(await cache.load("case", "v1", fetcher)).toBe(1)
    expect(await cache.load("case", "v2", fetcher)).toBe(2)
    expect(await cache.load("case", "v2", fetcher)).toBe(2)
    expect(requests).toBe(2)
  })

  test("merges concurrent loads of the same case and version", async () => {
    const cache = createCaseSnapshotCache<number>()
    const response = Promise.withResolvers<{ value: number; size: number }>()
    const first = cache.load("case", "v1", () => response.promise)
    expect(cache.load("case", "v1", async () => ({ value: 2, size: 10 }))).toBe(first)
    response.resolve({ value: 1, size: 10 })
    expect(await first).toBe(1)
  })

  test("does not mix users, servers or cases", async () => {
    const cache = createCaseSnapshotCache<number>()
    let requests = 0
    const fetcher = async () => ({ value: ++requests, size: 10 })
    for (const key of [
      '["server-a",1,"case-a"]',
      '["server-a",2,"case-a"]',
      '["server-b",1,"case-a"]',
      '["server-a",1,"case-b"]',
    ]) {
      await cache.load(key, "v1", fetcher)
    }
    expect(requests).toBe(4)
  })

  test("evicts least recently used entries when reaching the count limit", async () => {
    const cache = createCaseSnapshotCache<number>(2)
    let requests = 0
    const fetcher = async () => ({ value: ++requests, size: 10 })
    await cache.load("a", "v1", fetcher)
    await cache.load("b", "v1", fetcher)
    expect(await cache.load("a", "v1", fetcher)).toBe(1)
    await cache.load("c", "v1", fetcher)
    expect(await cache.load("a", "v1", fetcher)).toBe(1)
    expect(await cache.load("b", "v1", fetcher)).toBe(4)
  })

  test("bounds decoded text weight, and still opens snapshots too large to cache", async () => {
    const cache = createCaseSnapshotCache<number>(4, 20)
    let requests = 0
    const fetcher = async () => ({ value: ++requests, size: 12 })
    await cache.load("a", "v1", fetcher)
    await cache.load("b", "v1", fetcher)
    expect(await cache.load("a", "v1", fetcher)).toBe(3)
    const large = async () => ({ value: ++requests, size: 21 })
    expect(await cache.load("large", "v1", large)).toBe(4)
    expect(await cache.load("large", "v1", large)).toBe(5)
    expect(await cache.load("a", "v1", fetcher)).toBe(3)
  })

  test("version replacement releases the old entry's budget", async () => {
    const cache = createCaseSnapshotCache<number>(4, 20)
    let requests = 0
    const fetcher = async () => ({ value: ++requests, size: 10 })
    await cache.load("a", "v1", fetcher)
    await cache.load("a", "v2", fetcher)
    await cache.load("b", "v1", fetcher)
    expect(await cache.load("a", "v2", fetcher)).toBe(2)
    expect(requests).toBe(3)
  })

  test("a superseded pending version cannot overwrite the newer version", async () => {
    const cache = createCaseSnapshotCache<number>()
    const old = Promise.withResolvers<{ value: number; size: number }>()
    const first = cache.load("case", "v1", () => old.promise)
    await cache.load("case", "v2", async () => ({ value: 2, size: 10 }))
    old.resolve({ value: 1, size: 10 })
    await expect(first).rejects.toThrow("已失效")
    expect(await cache.load("case", "v2", async () => ({ value: 3, size: 10 }))).toBe(2)
  })

  test("logout or case mutation clears data and blocks late responses", async () => {
    const cache = createCaseSnapshotCache<number>()
    const response = Promise.withResolvers<{ value: number; size: number }>()
    const first = cache.load("case", "v1", () => response.promise)
    cache.clear()
    await cache.load("case", "v1", async () => ({ value: 2, size: 10 }))
    response.resolve({ value: 1, size: 10 })
    await expect(first).rejects.toThrow("已失效")
    expect(await cache.load("case", "v1", async () => ({ value: 3, size: 10 }))).toBe(2)
    cache.clear()
    expect(await cache.load("case", "v1", async () => ({ value: 3, size: 10 }))).toBe(3)
  })

  test("failed requests are not cached and missing versions are not guessed", async () => {
    const cache = createCaseSnapshotCache<number>()
    const fail = async () => {
      throw new Error("offline")
    }
    await expect(cache.load("case", "v1", fail)).rejects.toThrow("offline")
    expect(await cache.load("case", "v1", async () => ({ value: 2, size: 10 }))).toBe(2)
    await expect(cache.load("case", "", fail)).rejects.toThrow("缺少快照版本")
  })
})
