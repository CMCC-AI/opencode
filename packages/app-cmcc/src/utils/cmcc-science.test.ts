import { describe, expect, test } from "bun:test"
import { sciencePrompt } from "./cmcc-science"

describe("sciencePrompt", () => {
  test("独立实验设计限定交付范围并保留人工闸门", () => {
    const prompt = sciencePrompt({
      ids: ["design"],
      mode: "single",
      topic: "验证模型假设",
      materials: "data/results.csv",
    })
    expect(prompt).toContain("独立环节，仅完成本次目标")
    expect(prompt).toContain("不自动执行实验")
    expect(prompt).toContain("data/results.csv")
    expect(prompt).toContain("G1-G4")
    expect(prompt).not.toContain("2. ")
  })
  test("串联环节保持传入顺序并交接已验证产物", () => {
    const prompt = sciencePrompt({
      ids: ["review", "write", "peer-review"],
      mode: "flow",
      topic: "研究主题",
      materials: "",
    })
    expect(prompt).toContain("1. 论文综述")
    expect(prompt).toContain("2. 论文撰写")
    expect(prompt).toContain("3. 模拟审稿")
    expect(prompt).toContain("复用上一步已验证的产物")
    expect(prompt).toContain("尚未提供")
  })
  test("缺少研究需求或有效环节时不创建任务", () => {
    expect(sciencePrompt({ ids: ["review"], mode: "single", topic: "  ", materials: "" })).toBeUndefined()
    expect(sciencePrompt({ ids: ["missing"], mode: "flow", topic: "研究", materials: "" })).toBeUndefined()
  })
})
