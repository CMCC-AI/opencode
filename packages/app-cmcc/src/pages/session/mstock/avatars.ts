import { cmccMemberAvatarUrl } from "@/utils/cmcc-experts"
import { MSTOCK_LEAD_MEMBER, MSTOCK_MEMBERS } from "./config"

export function mstockAvatar(agentId: string) {
  const member = [MSTOCK_LEAD_MEMBER, ...MSTOCK_MEMBERS].find((item) => item?.id === agentId)
  return member ? cmccMemberAvatarUrl(member) : undefined
}

export function mstockTeamAvatar() {
  return MSTOCK_LEAD_MEMBER ? cmccMemberAvatarUrl(MSTOCK_LEAD_MEMBER) : undefined
}
