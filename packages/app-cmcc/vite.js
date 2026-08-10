import appPlugin from "@opencode-ai/app/vite"
import { fileURLToPath } from "node:url"

/** @type {import("vite").PluginOption[]} */
export default [
  {
    name: "opencode-cmcc:extension",
    config() {
      return {
        resolve: {
          alias: {
            "@cmcc": fileURLToPath(new URL("./src", import.meta.url)),
          },
        },
      }
    },
  },
  ...appPlugin,
]
