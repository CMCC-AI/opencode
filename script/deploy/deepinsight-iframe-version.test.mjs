import assert from "node:assert/strict"
import { test } from "node:test"
import { upgradeDeepInsightFrame } from "./deepinsight-iframe-version.mjs"

function frame(src) {
  return {
    src,
    writes: 0,
    getAttribute() { return this.src },
    setAttribute(name, value) {
      assert.equal(name, "src")
      this.src = value
      this.writes++
    },
  }
}

test("为旧入口增加版本，重复检查不重复导航", () => {
  const target = frame("http://152.136.106.161:3001/chat")
  upgradeDeepInsightFrame(target)
  assert.equal(target.src, "http://152.136.106.161:3001/chat?v=stream-post-b824e1c126")
  upgradeDeepInsightFrame(target)
  assert.equal(target.writes, 1)
})

test("保留原查询参数和片段", () => {
  const target = frame("http://152.136.106.161:3001/chat?embed=1#test")
  upgradeDeepInsightFrame(target)
  assert.equal(target.src, "http://152.136.106.161:3001/chat?embed=1&v=stream-post-b824e1c126#test")
})

test("不改动其他服务、页面、无效地址或已有版本", () => {
  for (const src of [
    null,
    "",
    "/chat",
    "http://152.136.106.161:3000/chat",
    "http://81.70.174.140:8888/",
    "http://152.136.106.161:3001/other",
    "http://152.136.106.161:3001/chat?v=future",
  ]) {
    const target = frame(src)
    upgradeDeepInsightFrame(target)
    assert.equal(target.src, src)
    assert.equal(target.writes, 0)
  }
})
