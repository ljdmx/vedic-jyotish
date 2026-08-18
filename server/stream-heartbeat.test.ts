import { describe, expect, it } from "vitest";
import { startStreamHeartbeat, type IntervalDriver } from "./stream-heartbeat";

describe("SSE 流心跳", () => {
  it("按固定间隔发送无内容活动信号，并可在结束时清理", () => {
    let callback: (() => void) | undefined;
    let delay = 0;
    let cleared: unknown;
    const driver: IntervalDriver = {
      setInterval: (next, ms) => { callback = next; delay = ms; return 19 as unknown as ReturnType<typeof setInterval>; },
      clearInterval: timer => { cleared = timer; },
    };
    let heartbeats = 0;
    const stop = startStreamHeartbeat(() => { heartbeats++; }, 2_500, driver);
    callback?.();
    callback?.();

    expect(delay).toBe(2_500);
    expect(heartbeats).toBe(2);
    stop();
    expect(cleared).toBe(19);
  });
});
