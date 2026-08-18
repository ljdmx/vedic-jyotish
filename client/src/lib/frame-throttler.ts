export type AnimationFrameDriver = {
  requestFrame: (callback: (timestamp: number) => void) => number;
  cancelFrame: (frameId: number) => void;
};

const browserFrameDriver: AnimationFrameDriver = {
  requestFrame: callback => window.requestAnimationFrame(callback),
  cancelFrame: frameId => window.cancelAnimationFrame(frameId),
};

/**
 * 将高频事件压缩到浏览器绘制帧，并可设置最小执行间隔。
 * 这样流式报告不会为每个 delta 建立 setTimeout，也不会在同一帧重复滚动页面。
 */
export function createFrameThrottler(callback: () => void, minimumIntervalMs = 0, driver: AnimationFrameDriver = browserFrameDriver) {
  let frameId: number | null = null;
  let pending = false;
  let lastRunAt = Number.NEGATIVE_INFINITY;

  const run = (timestamp: number) => {
    frameId = null;
    if (!pending) return;
    if (timestamp - lastRunAt < minimumIntervalMs) {
      frameId = driver.requestFrame(run);
      return;
    }
    pending = false;
    lastRunAt = timestamp;
    callback();
  };

  return {
    schedule() {
      pending = true;
      if (frameId === null) frameId = driver.requestFrame(run);
    },
    cancel() {
      pending = false;
      if (frameId !== null) driver.cancelFrame(frameId);
      frameId = null;
    },
  };
}
