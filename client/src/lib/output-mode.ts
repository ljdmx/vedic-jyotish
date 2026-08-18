export type AiOutputMode = "stream" | "single";

export const DEFAULT_AI_OUTPUT_MODE: AiOutputMode = "stream";

export const AI_OUTPUT_MODE_COPY: Record<AiOutputMode, { label: string; hint: string }> = {
  stream: { label: "流式输出", hint: "边生成边显示；默认更适合长报告。" },
  single: { label: "一次性输出", hint: "完成后一次显示完整报告；适合专心阅读。" },
};

export function aiOutputModeLabel(mode: AiOutputMode) {
  return AI_OUTPUT_MODE_COPY[mode].label;
}

/** 仅流式模式可建立 SSE 与原始增量 DOM；一次性模式必须等待完整报告。 */
export function usesStreamingReportPath(mode: AiOutputMode) {
  return mode === "stream";
}
