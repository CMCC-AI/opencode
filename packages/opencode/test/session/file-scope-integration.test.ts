import { expect } from "bun:test"
import path from "path"
import fs from "fs/promises"
import { Cause, Effect, Exit } from "effect"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import { Session } from "../../src/session/session"
import { SessionSummary } from "../../src/session/summary"
import { SessionRevert } from "../../src/session/revert"
import { Snapshot } from "../../src/snapshot"
import { MessageID, PartID } from "../../src/session/schema"
import { provideTmpdirInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(
  LayerNode.compile(
    LayerNode.group([
      Session.node,
      SessionSummary.node,
      SessionRevert.node,
      Snapshot.node,
      SessionProjector.node,
      CrossSpawnSpawner.node,
    ]),
  ),
)
const tokens = { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }
const write = (file: string, value: string) => Effect.promise(() => fs.writeFile(file, value))
const read = (file: string) => Effect.promise(() => fs.readFile(file, "utf8"))

it.live(
  "concurrent task diffs and legacy rollback never change the other task",
  provideTmpdirInstance(
    (dir) =>
      Effect.gen(function* () {
        const sessions = yield* Session.Service
        const summary = yield* SessionSummary.Service
        const snapshot = yield* Snapshot.Service
        const revert = yield* SessionRevert.Service
        const aDir = path.join(dir, "runs", "market-[a]")
        const bDir = path.join(dir, "runs", "market-a")
        yield* Effect.promise(() => fs.mkdir(aDir, { recursive: true }))
        yield* Effect.promise(() => fs.mkdir(bDir, { recursive: true }))
        const aFile = path.join(aDir, "report.md")
        const aNew = path.join(aDir, "图表 [1].html")
        const bFile = path.join(bDir, "findings.json")
        yield* write(aFile, "A original")
        yield* write(bFile, "B original")
        const a = yield* sessions.create({ metadata: { cmccArtifactDirectory: aDir } })
        const b = yield* sessions.create({ metadata: { cmccArtifactDirectory: bDir } })
        const child = yield* sessions.create({ parentID: a.id })
        const nested = yield* sessions.create({ parentID: child.id })
        const aScope = yield* summary.fileScope(a.id)
        const bScope = yield* summary.fileScope(b.id)
        if (!aScope || !bScope) throw new Error("Expected scoped tasks")
        expect(yield* summary.fileScope(nested.id)).toEqual(aScope)
        const native = yield* sessions.create({})
        expect(yield* summary.fileScope(native.id)).toBeUndefined()

        const user = yield* sessions.updateMessage({
          id: MessageID.ascending(),
          sessionID: a.id,
          role: "user",
          time: { created: Date.now() },
          agent: "build",
          model: { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test") },
        })
        yield* sessions.updatePart({
          id: PartID.ascending(),
          sessionID: a.id,
          messageID: user.id,
          type: "text",
          text: "Market question",
        })
        const answer = yield* sessions.updateMessage({
          id: MessageID.ascending(),
          parentID: user.id,
          sessionID: a.id,
          role: "assistant",
          time: { created: Date.now() },
          agent: "build",
          mode: "build",
          providerID: ProviderV2.ID.make("test"),
          modelID: ModelV2.ID.make("test"),
          path: { cwd: dir, root: dir },
          finish: "stop",
          cost: 0,
          tokens,
        })
        const before = yield* snapshot.track()
        if (!before) throw new Error("Expected snapshot")
        yield* write(bFile, "B writes while A is running")
        const afterB = yield* snapshot.track(bScope)
        if (!afterB) throw new Error("Expected B snapshot")
        expect(yield* snapshot.diffFull(before, afterB, aScope)).toEqual([])
        expect((yield* snapshot.diffFull(before, afterB, bScope)).map((item) => item.file)).toEqual([
          "runs/market-a/findings.json",
        ])

        // Files written by scripts are included without fabricating write-tool records.
        yield* write(aFile, "A result")
        yield* write(aNew, "<h1>A script output</h1>")
        const afterA = yield* snapshot.track(aScope)
        if (!afterA) throw new Error("Expected A snapshot")
        yield* sessions.updatePart({
          id: PartID.ascending(),
          sessionID: a.id,
          messageID: answer.id,
          type: "step-start",
          snapshot: before,
        })
        yield* sessions.updatePart({
          id: PartID.ascending(),
          sessionID: a.id,
          messageID: answer.id,
          type: "step-finish",
          snapshot: afterA,
          reason: "stop",
          cost: 0,
          tokens,
        })
        const patch = yield* snapshot.patch(before, aScope)
        expect(patch.files.sort()).toEqual([aFile, aNew].map((file) => file.replaceAll("\\", "/")).sort())
        yield* summary.summarize({ sessionID: a.id, messageID: user.id })
        expect((yield* summary.diff({ sessionID: a.id, messageID: user.id })).map((item) => item.file).sort()).toEqual(
          ["runs/market-[a]/report.md", "runs/market-[a]/图表 [1].html"].sort(),
        )

        const polluted = yield* snapshot.patch(before)
        const oldDiffs = yield* snapshot.diffFull(before, afterA)
        expect(oldDiffs).toHaveLength(3)
        yield* sessions.updatePart({
          id: PartID.ascending(),
          sessionID: a.id,
          messageID: answer.id,
          type: "patch",
          ...polluted,
        })
        yield* sessions.updateMessage({ ...user, summary: { diffs: oldDiffs } })
        const stored = yield* sessions.messages({ sessionID: a.id })
        const filtered = yield* summary.filterMessages({ sessionID: a.id, messages: stored })
        const filteredUser = filtered.find((item) => item.info.role === "user")?.info
        const storedUser = stored.find((item) => item.info.role === "user")?.info
        if (filteredUser?.role !== "user" || storedUser?.role !== "user") throw new Error("Expected user messages")
        expect(filteredUser.summary?.diffs).toHaveLength(2)
        expect(filtered.flatMap((item) => item.parts).find((part) => part.type === "patch")?.files).toHaveLength(2)
        expect(storedUser.summary?.diffs).toHaveLength(3)

        yield* write(bFile, "B latest before A rollback")
        yield* revert.revert({ sessionID: a.id, messageID: user.id })
        expect(yield* read(aFile)).toBe("A original")
        expect(
          yield* Effect.promise(() =>
            fs.access(aNew).then(
              () => true,
              () => false,
            ),
          ),
        ).toBe(false)
        expect(yield* read(bFile)).toBe("B latest before A rollback")
        yield* write(bFile, "B continues during A rollback")
        yield* revert.revert({ sessionID: a.id, messageID: user.id })
        expect(yield* read(bFile)).toBe("B continues during A rollback")
        yield* revert.unrevert({ sessionID: a.id })
        expect(yield* read(aFile)).toBe("A result")
        expect(yield* read(aNew)).toBe("<h1>A script output</h1>")
        expect(yield* read(bFile)).toBe("B continues during A rollback")

        const link = path.join(aDir, "foreign")
        yield* Effect.promise(() => fs.symlink(bDir, link, process.platform === "win32" ? "junction" : "dir"))
        const linked = yield* snapshot
          .revert([{ hash: before, files: [path.join(link, "findings.json")] }], aScope)
          .pipe(Effect.exit)
        expect(Exit.isFailure(linked)).toBe(true)
        expect(yield* read(bFile)).toBe("B continues during A rollback")
        yield* Effect.promise(() => fs.unlink(link))
        yield* sessions.setMetadata({ sessionID: a.id, metadata: { cmccArtifactDirectory: dir } })
        const refused = yield* revert.revert({ sessionID: a.id, messageID: user.id }).pipe(Effect.exit)
        expect(Exit.isFailure(refused)).toBe(true)
        expect(yield* read(aFile)).toBe("A result")
        expect(yield* read(bFile)).toBe("B continues during A rollback")
      }),
    { git: true },
  ),
  { timeout: 600000 },
)

const windowsTest = process.platform === "win32" ? it.live : it.live.skip

it.live(
  "message-only rollback works without a Git worktree",
  provideTmpdirInstance((dir) =>
    Effect.gen(function* () {
      const sessions = yield* Session.Service
      const revert = yield* SessionRevert.Service
      const chat = yield* sessions.create({ metadata: { cmccArtifactDirectory: path.join(dir, "runs", "chat-only") } })
      const user = yield* sessions.updateMessage({
        id: MessageID.ascending(),
        sessionID: chat.id,
        role: "user",
        time: { created: Date.now() },
        agent: "build",
        model: { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test") },
      })
      yield* sessions.updatePart({
        id: PartID.ascending(),
        sessionID: chat.id,
        messageID: user.id,
        type: "text",
        text: "Chat without file changes",
      })
      expect((yield* revert.revert({ sessionID: chat.id, messageID: user.id })).revert?.messageID).toBe(user.id)
      expect((yield* revert.unrevert({ sessionID: chat.id })).revert).toBeUndefined()
    }),
  ),
  { timeout: 60000 },
)

windowsTest(
  "rejects ambiguous Windows task directory aliases",
  provideTmpdirInstance(
    (dir) =>
      Effect.gen(function* () {
        const snapshot = yield* Snapshot.Service
        const directory = path.join(dir, "runs", "task-a")
        yield* Effect.promise(() => fs.mkdir(directory, { recursive: true }))
        const file = path.join(directory, "report.md")
        yield* write(file, "unchanged")
        for (const alias of [`${directory}.`, `${directory} `]) {
          const result = yield* snapshot.revert([], { directory: alias }).pipe(Effect.exit)
          expect(Exit.isFailure(result)).toBe(true)
          if (Exit.isFailure(result)) expect(Cause.pretty(result.cause)).toContain("Ambiguous snapshot path")
        }
        expect(yield* read(file)).toBe("unchanged")
      }),
    { git: true },
  ),
  { timeout: 120000 },
)
