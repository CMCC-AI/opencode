import { describe, expect, test } from "bun:test"
import { buildKnowledgeGraph } from "../../src/knowledge/graph"

describe("knowledge graph", () => {
  test("builds directed relationships from wiki links and aliases", () => {
    const graph = buildKnowledgeGraph([
      {
        path: "02_LLM_Wiki/跨境数据.md",
        content: "[[个人信息保护]]\n[[PIPL]]\n[[个人信息保护]]",
      },
      {
        path: "02_LLM_Wiki/个人信息保护法.md",
        content: "---\naliases: [个人信息保护, PIPL]\n---\n# 个人信息保护法",
      },
    ])

    expect(graph.nodes).toHaveLength(2)
    expect(graph.edges).toEqual([
      {
        id: "02_LLM_Wiki/跨境数据.md\u000002_LLM_Wiki/个人信息保护法.md",
        source: "02_LLM_Wiki/跨境数据.md",
        target: "02_LLM_Wiki/个人信息保护法.md",
      },
    ])
    expect(graph.nodes.find((node) => node.label === "跨境数据")?.outDegree).toBe(1)
    expect(graph.nodes.find((node) => node.label === "个人信息保护法")?.inDegree).toBe(1)
  })
})
