import { describe, expect, it } from "vitest";
import { AI_OUTPUT_MODE_COPY, DEFAULT_AI_OUTPUT_MODE, aiOutputModeLabel, usesStreamingReportPath } from "./output-mode";

describe("AI 输出模式", () => {
  it("默认使用流式输出，并为两种模式提供清晰的用户文案", () => {
    expect(DEFAULT_AI_OUTPUT_MODE).toBe("stream");
    expect(aiOutputModeLabel("stream")).toBe("流式输出");
    expect(aiOutputModeLabel("single")).toBe("一次性输出");
    expect(AI_OUTPUT_MODE_COPY.single.hint).toContain("完整报告");
  });

  it("只允许流式模式进入 SSE 与原始增量视图路径", () => {
    expect(usesStreamingReportPath("stream")).toBe(true);
    expect(usesStreamingReportPath("single")).toBe(false);
  });
});
