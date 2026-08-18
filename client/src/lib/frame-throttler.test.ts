import { describe, expect, it } from "vitest";
import { createFrameThrottler, type AnimationFrameDriver } from "./frame-throttler";

function createFrameDriver() {
  let nextId = 1;
  const callbacks = new Map<number, (timestamp: number) => void>();
  const driver: AnimationFrameDriver = {
    requestFrame: callback => {
      const id = nextId++;
      callbacks.set(id, callback);
      return id;
    },
    cancelFrame: id => callbacks.delete(id),
  };
  return {
    driver,
    pendingCount: () => callbacks.size,
    runNext(timestamp: number) {
      const next = callbacks.entries().next().value as [number, (time: number) => void] | undefined;
      if (!next) throw new Error("没有待执行的动画帧");
      callbacks.delete(next[0]);
      next[1](timestamp);
    },
  };
}

describe("createFrameThrottler", () => {
  it("将同一绘制周期的高频请求合并为一次回调", () => {
    const frames = createFrameDriver();
    let count = 0;
    const scheduler = createFrameThrottler(() => { count++; }, 100, frames.driver);

    scheduler.schedule();
    scheduler.schedule();
    scheduler.schedule();
    expect(frames.pendingCount()).toBe(1);
    frames.runNext(0);
    expect(count).toBe(1);
  });

  it("在最小间隔内等待后续绘制帧而不建立定时器", () => {
    const frames = createFrameDriver();
    let count = 0;
    const scheduler = createFrameThrottler(() => { count++; }, 100, frames.driver);

    scheduler.schedule();
    frames.runNext(0);
    scheduler.schedule();
    frames.runNext(16);
    expect(count).toBe(1);
    expect(frames.pendingCount()).toBe(1);
    frames.runNext(100);
    expect(count).toBe(2);
  });

  it("取消后不会执行尚未绘制的回调", () => {
    const frames = createFrameDriver();
    let count = 0;
    const scheduler = createFrameThrottler(() => { count++; }, 100, frames.driver);

    scheduler.schedule();
    scheduler.cancel();
    expect(frames.pendingCount()).toBe(0);
    expect(count).toBe(0);
  });
});
