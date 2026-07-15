/// <reference path="../markdown.d.ts" />

export * as SkillPlugin from "./skill"

import { define } from "./internal"
import { Effect } from "effect"
import { AbsolutePath } from "../schema"
import { SkillV2 } from "../skill"
import customizeOpencodeContent from "./skill/customize-opencode.md" with { type: "text" }
import llmWikiContent from "./skill/llm-wiki.md" with { type: "text" }

export const CustomizeOpencodeContent = customizeOpencodeContent
export const LlmWikiContent = llmWikiContent

export const Plugin = define({
  id: "skill",
  effect: Effect.fn(function* (ctx) {
    yield* ctx.skill.transform((draft) => {
      draft.source(
        SkillV2.EmbeddedSource.make({
          type: "embedded",
          skill: SkillV2.Info.make({
            name: "customize-opencode",
            description:
              "Use ONLY when the user is editing or creating opencode's own configuration: opencode.json, opencode.jsonc, files under .opencode/, or files under ~/.config/opencode/. Also use when creating or fixing opencode agents, subagents, commands, skills, plugins, MCP servers, or permission rules. Do not use for the user's own application code, or for any project that is not configuring opencode itself.",
            location: AbsolutePath.make("/builtin/customize-opencode.md"),
            content: CustomizeOpencodeContent,
          }),
        }),
      )
      draft.source(
        SkillV2.EmbeddedSource.make({
          type: "embedded",
          skill: SkillV2.Info.make({
            name: "llm-wiki",
            description:
              "Maintain an LLM Wiki knowledge graph from raw documents and Q&A. Use for ingesting sources, atomic Markdown notes, index.md/log.md maintenance, local wiki Q&A, and grounded synthesis.",
            location: AbsolutePath.make("/builtin/llm-wiki.md"),
            content: LlmWikiContent,
          }),
        }),
      )
    })
  }),
})
