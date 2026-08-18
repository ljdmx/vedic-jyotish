import { describe, expect, it, vi } from "vitest";

const streamedChunks = ["### 支持证据\n", "- 模型只补充可见盘面事实。\n", "### 现实验证\n- 观察下一次明确反馈。"];

vi.mock("./model-provider", () => ({
  extractCompatibleText: vi.fn(),
  invokeCompatibleModel: vi.fn(),
  streamCompatibleModel: async function* () {
    for (const chunk of streamedChunks) yield chunk;
  },
}));

import { calculateVedicChart } from "../shared/vedic-engine";
import { generateAnalysisStream, type AnalysisStreamEvent } from "./vedic";

const chart = calculateVedicChart({
  name: "Prashna", date: "2026-08-18", time: "11:01", place: "四川绵阳",
  latitude: 31.6133, longitude: 104.9498, timezoneOffset: 480,
  timeAccuracy: "系统捕获到秒", timeSource: "系统时钟", timeBasis: "wall_clock",
}, "prashna");

describe("Prashna 裁决的流式连续输出", () => {
  it("先输出系统裁决摘要，再原位追加模型增量，终态不发送 restart", async () => {
    const events: AnalysisStreamEvent[] = [];
    const result = await generateAnalysisStream({
      stack: "prashna", module: "prashna", chart,
      question: "这次申请能否顺利获得录用 offer？",
    }, event => events.push(event));

    const deltas = events.filter((event): event is Extract<AnalysisStreamEvent, { type: "delta" }> => event.type === "delta");
    expect(deltas[0]?.text).toContain("## Prashna 裁决摘要");
    expect(deltas[0]?.text).toContain("当前裁决：");
    expect(deltas[0]?.text).toContain("事项映射：H10");
    expect(deltas.slice(1).map(event => event.text)).toEqual(streamedChunks);
    expect(events.some(event => event.type === "restart")).toBe(false);
    expect(events.at(-1)).toEqual({ type: "done" });
    expect(result).toContain("Prashna 裁决摘要");
    expect(result).toContain(streamedChunks.join(""));
  });
});
