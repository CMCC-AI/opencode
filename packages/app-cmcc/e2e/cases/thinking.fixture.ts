export function thinkingFixture(sourceCount = 44) {
  const plan = Array.from(
    { length: 8 },
    (_, index) => `研究计划 ${index + 1}：核验这一项研究问题的公开资料、时效性与独立证据。`,
  )
  const sources = Array.from({ length: sourceCount }, (_, index) => ({
    title: `公开信息来源 ${index + 1}`,
    url: `https://example.org/source/${index + 1}`,
  }))
  return {
    steps: [
      { name: "safety_check", createdAt: 1, payload: { is_safe: true } },
      { name: "intent_analysis", createdAt: 2, payload: {} },
      {
        name: "generate_query",
        createdAt: 4,
        payload: {
          research_plan: plan,
          thinking_processes: [{ ai_thought: "不应显示的计划底层思考", output_data: { raw_plan: true } }],
        },
      },
      {
        name: "web_search",
        createdAt: 5,
        payload: {
          sources_gathered: sources,
          thinking_processes: [{ ai_thought: "不应显示的搜索底层思考", output_data: { raw_search: true } }],
        },
      },
      {
        name: "reflection",
        createdAt: 6,
        payload: {
          round_completed: true,
          thinking_processes: [
            {
              ai_thought: "不应显示的反思底层思考",
              output_data: {
                research_summary: "评估摘要的真实字段内容。",
                gap_analysis: "知识缺口的真实字段内容。",
                next_steps: ["下轮核验来源", "补充独立证据"],
                分析结果: {
                  step_coverage_analysis: [{ step_number: 1, step_content: "左侧覆盖详情", coverage_status: "未覆盖" }],
                },
              },
            },
          ],
        },
      },
      { name: "continue_research", createdAt: 7, payload: {} },
    ],
    interruptHistory: [
      {
        payload: { type: "plan_confirmation", research_plan: plan, research_topic: "测试研究主题" },
        resume: { action: "confirm" },
        confirmedAt: 3,
      },
    ],
  }
}

export function outlineFixture() {
  return {
    title: "测试结构化大纲",
    target_word_count: 22500,
    sections: Array.from({ length: 7 }, (_, index) => ({
      section_number: String(index + 1),
      section_title: `大纲章节 ${index + 1}`,
      target_words: 3000,
      draft_content: "不应在右侧大纲展示的章节草稿全文",
    })),
  }
}
