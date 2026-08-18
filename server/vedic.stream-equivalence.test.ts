import { describe, expect, it, vi } from "vitest";

const modelText = "## 先说结论\n\n可以先完成资料核对，再根据实际反馈推进。\n\n### 依据\n- 依据：当前可见的 D1 工作盘。";

vi.mock("./model-provider", () => ({
  extractCompatibleText: () => modelText,
  invokeCompatibleModel: async () => ({ choices: [{ message: { content: modelText }, finish_reason: "stop" }] }),
  streamCompatibleModel: async function* () { yield modelText.slice(0, 24); yield modelText.slice(24); },
}));

import { calculateVedicChart } from "../shared/vedic-engine";
import { generateAnalysis, generateAnalysisStream, type AnalysisStreamEvent } from "./vedic";

describe("普通与流式报告一致性", () => {
  it("两种输出模式共享同一份系统前言和模型结果", async () => {
    const chart = calculateVedicChart({ name: "测试", date: "1990-01-01", time: "12:00", place: "成都", latitude: 30.5728, longitude: 104.0668, timezoneOffset: 480, timeAccuracy: "精确到分钟", timeSource: "测试", timeBasis: "wall_clock" }, "natal");
    const input = { stack: "natal" as const, module: "career", chart, question: "职业下一步如何推进？" };
    const events: AnalysisStreamEvent[] = [];
    const [single, streamed] = await Promise.all([
      generateAnalysis(input),
      generateAnalysisStream(input, event => events.push(event)),
    ]);

    expect(streamed).toBe(single);
    expect(events.at(-1)).toEqual({ type: "done" });
    expect(events.filter(event => event.type === "delta").map(event => event.type)).toHaveLength(3);
  });
});
