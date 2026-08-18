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
    expect(deltas[0]?.text).toContain("## 先说结论");
    expect(deltas[0]?.text).toContain("现在的建议：");
    expect(deltas[1]?.text).toContain("### 为什么这样说");
    expect(deltas[2]?.text).toContain("### 先留意这些条件");
    expect(deltas[3]?.text).toContain("### 想核对盘面再看这里");
    expect(deltas[4]?.text).toContain("计算核对");
    expect(deltas.slice(5).map(event => event.text)).toEqual(streamedChunks);
    expect(events.some(event => event.type === "restart")).toBe(false);
    expect(events.at(-1)).toEqual({ type: "done" });
    expect(result).toContain("先说结论");
    expect(result).toContain(streamedChunks.join(""));
  });
});
