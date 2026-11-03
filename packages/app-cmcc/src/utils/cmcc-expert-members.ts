import deepinsight from "../../../../.opencode/experts/deepinsight/expert.json" with { type: "json" }
import deeptrading from "../../../../.opencode/experts/deeptrading/expert.json" with { type: "json" }
import deepinspect from "../../../../.opencode/experts/deepinspect/expert.json" with { type: "json" }
import zhengqi from "../../../../.opencode/experts/zhengqi-visit-intel/expert.json" with { type: "json" }
import mstock from "../../../../.opencode/experts/mstock/expert.json" with { type: "json" }

const teams = {
  deepinsight: deepinsight.members,
  deeptrading: deeptrading.members,
  deepinspect: deepinspect.members,
  "zhengqi-visit-intel": zhengqi.members,
  mstock: mstock.members,
}

export function cmccExpertMembers(id: keyof typeof teams) {
  return teams[id].map((member) => ({
    id: member.id,
    name: member.name.zh,
    profession: member.profession.zh,
    role: member.role === "lead" ? ("lead" as const) : ("member" as const),
  }))
}
