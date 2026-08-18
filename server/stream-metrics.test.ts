import { describe, expect, it } from "vitest";
import { createStreamMetrics } from "./stream-metrics";

describe("报告流事件指标", () => {
  it("仅汇总时序和事件计数，不记录报告正文", () => {
    let now = 1_000;
    const metrics = createStreamMetrics(() => now);
    now = 1_040;
    metrics.markDelta("首段");
    now = 1_090;
    metrics.markDelta("第二段");
    metrics.markRestart();
    now = 1_300;

    expect(metrics.snapshot()).toEqual({
      elapsedMs: 300,
      timeToFirstDeltaMs: 40,
      deltaEvents: 2,
      characters: 5,
      restartEvents: 1,
    });
  });
});
