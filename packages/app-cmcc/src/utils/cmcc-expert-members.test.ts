import { describe, expect, test } from "bun:test"
import { access, readFile } from "node:fs/promises"
import { cmccExpertMembers } from "./cmcc-expert-members"

describe.each(["deepinsight", "deeptrading", "deepinspect", "zhengqi-visit-intel", "mstock"] as const)(
  "%s member definition",
  (id) => {
    test("matches the published expert metadata and has usable avatars", async () => {
      const directory = new URL(`../../../../.opencode/experts/${id}/`, import.meta.url)
      const source = JSON.parse(await readFile(new URL("expert.json", directory), "utf8"))
      const members = cmccExpertMembers(id)
      expect(members).toEqual(
        source.members.map(
          (member: { id: string; name: { zh: string }; profession: { zh: string }; role: string }) => ({
            id: member.id,
            name: member.name.zh,
            profession: member.profession.zh,
            role: member.role,
          }),
        ),
      )
      expect(new Set(members.map((member) => member.id)).size).toBe(members.length)
      expect(members.filter((member) => member.role === "lead").map((member) => member.id)).toEqual([
        source.teamInfo.leadAgent,
      ])
      expect(members.filter((member) => member.role !== "lead").map((member) => member.id)).toEqual(
        source.teamInfo.memberAgents,
      )
      for (const member of members) {
        expect(member.name).toBeTruthy()
        expect(member.profession).toBeTruthy()
        const agent = member.id.split("/")[1]
        await access(new URL(`avatars/${agent}.png`, directory))
        await access(new URL(`avatars/thumb/${agent}.png`, directory))
      }
    })

    test("includes both delivery workers without the retired publisher", () => {
      const members = cmccExpertMembers(id)
      expect(members.filter((member) => member.name === "阿染")).toHaveLength(1)
      expect(members.filter((member) => member.name === "阿墨")).toHaveLength(1)
      expect(members.some((member) => member.id === "deepinsight/di-publisher")).toBe(false)
    })
  },
)
