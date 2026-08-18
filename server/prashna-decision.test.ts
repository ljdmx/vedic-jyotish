import { describe, expect, it } from "vitest";
import { calculateVedicChart } from "../shared/vedic-engine";
import { buildPrashnaDecision } from "./prashna-decision";

const input = { name: "Prashna", date: "2026-08-18", time: "11:01", place: "四川绵阳", latitude: 31.6133, longitude: 104.9498, timezoneOffset: 480, timeAccuracy: "系统捕获到秒", timeSource: "系统时钟", timeBasis: "wall_clock" as const };

describe("基础 Prashna 裁决", () => {
  it("将问题映射到明确问题宫，并输出可复算裁决、证据和月亮观察窗", () => {
    const chart = calculateVedicChart(input, "prashna");
    const decision = buildPrashnaDecision(chart, "这次申请能否顺利获得录用 offer？");

    expect(decision.queryHouse).toBe(10);
    expect(["可推进", "条件性推进", "建议暂缓"]).toContain(decision.verdict);
    expect(decision.moonWindowHours).toBeGreaterThan(0);
    expect(decision.markdown).toContain("## 先说结论");
    expect(decision.markdown).toContain("现在的建议：");
    expect(decision.markdown).toContain("下一步：");
    expect(decision.markdown).toContain("先观察：");
    expect(decision.streamSegments).toHaveLength(4);
    expect(decision.streamSegments[3]).toContain("想核对盘面再看这里");
  });

  it("对关系、资源和居住主题使用不同问题宫，而非一律给出泛化说法", () => {
    const chart = calculateVedicChart(input, "prashna");
    expect(buildPrashnaDecision(chart, "这段关系是否值得继续推进？").queryHouse).toBe(7);
    expect(buildPrashnaDecision(chart, "这笔收入能否落实？").queryHouse).toBe(2);
    expect(buildPrashnaDecision(chart, "近期搬家是否合适？").queryHouse).toBe(4);
  });
});
