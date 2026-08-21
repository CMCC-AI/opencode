import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260817000000_strip_global_session_drive_prefix",
  up(tx) {
    return Effect.gen(function* () {
      // Windows servers whose process drive differed from the session directory
      // drive stored absolute "C:/..." paths for the global ("/") project.
      // Normalize them to the root-relative form session queries expect.
      yield* tx.run(
        `UPDATE session SET path = substr(path, 4) WHERE project_id = 'global' AND path GLOB '[A-Za-z]:/*'`,
      )
    })
  },
} satisfies DatabaseMigration.Migration
