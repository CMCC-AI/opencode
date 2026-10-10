export function discoveryPayload(statuses: string[]) {
  return {
    round_completed: true,
    thinking_processes: [
      {
        output_data: {
          分析结果: {
            step_coverage_analysis: statuses.map((coverage_status, index) => ({
              step_number: index + 1,
              step_content: `研究步骤 ${index + 1}：核验对应研究问题的公开资料与证据`,
              coverage_status,
              coverage_details: `覆盖说明 ${index + 1}：仅展示这一轮实际返回的评估信息。`,
              required_info: coverage_status === "充分覆盖" ? "" : `补充资料 ${index + 1}`,
            })),
            knowledge_gaps: ["尚需核对资料的时效性", "尚需补充独立证据"],
            round_assessment: "这是本轮评估记录，不根据任务完成状态推断覆盖结果。",
            confidence_level: 6,
          },
          next_steps: ["继续核验公开资料"],
        },
      },
    ],
  }
}
