import { describe, expect, test } from "bun:test"
import {
  cmccBuildKnowledgeGraph,
  cmccForgetKnowledgeSession,
  cmccKnowledgeDeletedMarkerDirectory,
  cmccKnowledgeDirectory,
  cmccIsKnowledgeSession,
  cmccKnowledgeNotebookForSession,
  cmccKnowledgeNotebooks,
  cmccKnowledgeSessionMetadata,
  cmccKnowledgeSessionReference,
  cmccMainKnowledgeSession,
  cmccRecoverKnowledgeNotebooks,
  cmccRememberKnowledgeSession,
  cmccSaveKnowledgeNotebooks,
  type KnowledgeNotebook,
} from "./cmcc-knowledge"

describe("cmcc knowledge", () => {
  test("restores main-chat knowledge references from durable metadata without the browser cache", () => {
    const notebook = { id: "one", name: "研究", emoji: "📚", directory: "/knowledge/research" }
    const session = { id: "ses_main", directory: notebook.directory, metadata: cmccKnowledgeSessionMetadata(notebook) }
    expect(cmccKnowledgeSessionReference(session)).toEqual(notebook)
    expect(cmccIsKnowledgeSession([], session)).toBe(true)
    expect(cmccMainKnowledgeSession(session)).toBe(true)
    expect(cmccMainKnowledgeSession({ metadata: { cmccKnowledgeKind: "chat" } })).toBe(false)
    expect(cmccMainKnowledgeSession({ metadata: { ...session.metadata, cmccKnowledgeKind: "import" } })).toBe(false)
    expect(cmccKnowledgeSessionReference({ id: "ordinary", directory: "/workspace" })).toBeUndefined()
  })

  test("creates a stable notebook directory on posix and windows", () => {
    expect(cmccKnowledgeDirectory("/Users/test", "政策研究", "12345678-abcd")).toBe(
      "/Users/test/Documents/DeepInsight/Knowledge/政策研究-12345678",
    )
    expect(cmccKnowledgeDirectory("C:\\Users\\test", "Risk Notes", "abcdefgh-1234")).toBe(
      "C:\\Users\\test\\Documents\\DeepInsight\\Knowledge\\risk-notes-abcdefgh",
    )
    expect(cmccKnowledgeDeletedMarkerDirectory("C:\\Knowledge\\risk-notes")).toBe(
      "C:\\Knowledge\\risk-notes\\.deepinsight-deleted",
    )
  })

  test("persists valid notebooks and ignores invalid records", () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    }
    const notebook: KnowledgeNotebook = {
      id: "one",
      name: "研究",
      description: "",
      emoji: "📚",
      directory: "/tmp/one",
      createdAt: 1,
      updatedAt: 2,
      lastOpenedAt: 3,
    }

    cmccSaveKnowledgeNotebooks([notebook], storage)
    expect(cmccKnowledgeNotebooks(storage)).toEqual([notebook])
  })

  test("remembers multiple conversations and resolves their notebook", () => {
    const notebook: KnowledgeNotebook = {
      id: "one",
      name: "研究",
      description: "",
      emoji: "📚",
      directory: "C:\\Knowledge\\Research",
      createdAt: 1,
      updatedAt: 2,
      lastOpenedAt: 3,
      sessionID: "ses_old",
    }
    const remembered = cmccRememberKnowledgeSession(notebook, "ses_new")

    expect(remembered.sessionID).toBe("ses_new")
    expect(remembered.sessionIDs).toEqual(["ses_new", "ses_old"])
    expect(
      cmccKnowledgeNotebookForSession([remembered], {
        id: "ses_metadata",
        directory: "/different",
        metadata: { cmccKnowledgeNotebookID: "one" },
      }),
    ).toEqual(remembered)
    expect(cmccKnowledgeNotebookForSession([remembered], { id: "ses_legacy", directory: "c:/knowledge/research/" })).toEqual(
      remembered,
    )
  })

  test("keeps tagged knowledge sessions classified after their notebook is deleted", () => {
    expect(
      cmccIsKnowledgeSession([], {
        id: "ses_orphaned",
        directory: "/Users/test/Documents/DeepInsight/Knowledge/deleted",
        metadata: { cmccKnowledgeNotebookID: "deleted" },
      }),
    ).toBe(true)
    expect(
      cmccIsKnowledgeSession([], {
        id: "ses_regular",
        directory: "/Users/test/Documents/DeepInsight/Conversations/chat",
      }),
    ).toBe(false)
  })

  test("forgets a deleted conversation and promotes the next history item", () => {
    const notebook: KnowledgeNotebook = {
      id: "one",
      name: "研究",
      description: "",
      emoji: "📚",
      directory: "/tmp/one",
      createdAt: 1,
      updatedAt: 2,
      lastOpenedAt: 3,
      sessionID: "ses_active",
      sessionIDs: ["ses_active", "ses_next", "ses_older"],
    }

    expect(cmccForgetKnowledgeSession(notebook, "ses_active", "ses_next")).toMatchObject({
      sessionID: "ses_next",
      sessionIDs: ["ses_next", "ses_older"],
    })
  })

  test("recovers notebooks from durable directories and preserves cached metadata", () => {
    const cached: KnowledgeNotebook = {
      id: "one",
      name: "保留名称",
      description: "已有说明",
      emoji: "🔬",
      directory: "/home/Documents/DeepInsight/Knowledge/research-12345678",
      createdAt: 1,
      updatedAt: 2,
      lastOpenedAt: 3,
    }
    const recovered = cmccRecoverKnowledgeNotebooks(
      [cached],
      [cached.directory, "/home/Documents/DeepInsight/Knowledge/test1-05c44672"],
      100,
    )

    expect(recovered).toHaveLength(2)
    expect(recovered.find((notebook) => notebook.directory === cached.directory)).toEqual(cached)
    expect(recovered.find((notebook) => notebook.directory.endsWith("test1-05c44672"))).toMatchObject({
      name: "test1",
      createdAt: 100,
      lastOpenedAt: 100,
    })
  })

  test("keeps pinned notebooks ahead of recently opened notebooks", () => {
    const notebook = (id: string, lastOpenedAt: number, pinned = false): KnowledgeNotebook => ({
      id,
      name: id,
      description: "",
      emoji: "📚",
      directory: `/tmp/${id}`,
      createdAt: 1,
      updatedAt: 1,
      lastOpenedAt,
      pinned,
    })

    expect(
      cmccRecoverKnowledgeNotebooks(
        [notebook("recent", 30), notebook("pinned", 10, true), notebook("older", 20)],
        ["/tmp/recent", "/tmp/pinned", "/tmp/older"],
      ).map((item) => item.id),
    ).toEqual(["pinned", "recent", "older"])
  })

  test("builds directed wiki-link relationships and resolves aliases", () => {
    const graph = cmccBuildKnowledgeGraph([
      { path: "policies/cross-border.md", content: "[[个人信息保护]]\n[[PIPL]]\n[[个人信息保护]]" },
      { path: "concepts/privacy.md", content: "---\naliases: [个人信息保护, PIPL]\n---\n# 隐私" },
    ])

    expect(graph.nodes).toHaveLength(2)
    expect(graph.edges).toEqual([
      {
        id: "policies/cross-border.md\u0000concepts/privacy.md",
        source: "policies/cross-border.md",
        target: "concepts/privacy.md",
      },
    ])
    expect(graph.nodes.find((node) => node.id === "policies/cross-border.md")?.outDegree).toBe(1)
    expect(graph.nodes.find((node) => node.id === "concepts/privacy.md")?.inDegree).toBe(1)
  })
})
