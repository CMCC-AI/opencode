import user from "@/assets/general-deepinsight/avatar/avatar-small.png"
import assistant from "@/assets/general-deepinsight/avatar/avatar.png"
import query from "@/assets/general-deepinsight/thinking/生成查询.png"
import search from "@/assets/general-deepinsight/thinking/网络搜索.png"
import reflection from "@/assets/general-deepinsight/thinking/反思评估.png"
import outline from "@/assets/general-deepinsight/thinking/生成大纲.png"
import report from "@/assets/general-deepinsight/thinking/报告撰写.png"
import lineDone from "@/assets/general-deepinsight/thinking/线1-完成.png"
import lineLoading from "@/assets/general-deepinsight/thinking/线2-加载.png"
import loading from "@/assets/general-deepinsight/thinking/加载.png"
import done from "@/assets/general-deepinsight/thinking/完成.png"
import time from "@/assets/general-deepinsight/stats/time.png"
import token from "@/assets/general-deepinsight/stats/token.png"
import analysis from "@/assets/general-deepinsight/stats/analysis.png"
import length from "@/assets/general-deepinsight/stats/length.png"
import searchPlan from "@/assets/general-deepinsight/searchStats/生成搜索计划.png"
import webSearch from "@/assets/general-deepinsight/searchStats/网络搜索.png"
import deepReflection from "@/assets/general-deepinsight/searchStats/深度反思.png"
import reportOutline from "@/assets/general-deepinsight/searchStats/生成大纲.png"
import reportWriting from "@/assets/general-deepinsight/searchStats/报告撰写.png"
import recommendation from "@/assets/general-deepinsight/字数推荐.svg"
import confirmation from "@/assets/general-deepinsight/研究计划确认.svg"
import planHeader from "@/assets/general-deepinsight/研究计划.svg"
import searchHeader from "@/assets/general-deepinsight/网络搜索.svg"
import sourcesHeader from "@/assets/general-deepinsight/搜索结果.svg"
import discoveryHeader from "@/assets/general-deepinsight/研究发现.svg"
import outlineHeader from "@/assets/general-deepinsight/生成大纲.svg"
import reportHeader from "@/assets/general-deepinsight/撰写报告.svg"
import completedHeader from "@/assets/general-deepinsight/任务执行完成.svg"

export const sectionAssets: Record<string, string> = {
  字数推荐: recommendation,
  研究计划确认: confirmation,
  研究计划: planHeader,
  网络搜索: searchHeader,
  搜索结果: sourcesHeader,
  研究发现: discoveryHeader,
  生成大纲: outlineHeader,
  撰写报告: reportHeader,
  任务执行完成: completedHeader,
}

export const researchAssets = {
  user,
  assistant,
  query,
  search,
  reflection,
  outline,
  report,
  lineDone,
  lineLoading,
  loading,
  done,
  time,
  token,
  analysis,
  length,
}
export const progressPhases = [
  { key: "generate_query", label: "研究计划", icon: query, nodes: ["generate_query", "query_generation"] },
  { key: "web_search", label: "网络搜索", icon: search, nodes: ["web_search", "continue_research"] },
  { key: "reflection", label: "反思评估", icon: reflection, nodes: ["reflection"] },
  { key: "generate_outline", label: "生成大纲", icon: outline, nodes: ["generate_outline", "enhance_outline"] },
  { key: "finalize_answer", label: "报告撰写", icon: report, nodes: ["finalize_answer"] },
]
export const timelineAssets: Record<string, string> = {
  plan_draft_generation: searchPlan,
  generate_query: searchPlan,
  query_generation: searchPlan,
  web_search: webSearch,
  reflection: deepReflection,
  generate_outline: reportOutline,
  enhance_outline: reportOutline,
  finalize_answer: reportWriting,
  generate_answer: reportWriting,
  viz_post_process: reportWriting,
}
