export type IntervalDriver = {
  setInterval: (callback: () => void, delayMs: number) => ReturnType<typeof setInterval>;
  clearInterval: (timer: ReturnType<typeof setInterval>) => void;
};

const runtimeIntervals: IntervalDriver = {
  setInterval: (callback, delayMs) => setInterval(callback, delayMs),
  clearInterval: timer => clearInterval(timer),
};

/** 心跳不携带用户正文，仅用于向客户端证明 SSE 连接仍然存活。 */
export function startStreamHeartbeat(emit: () => void, intervalMs = 2_500, driver: IntervalDriver = runtimeIntervals) {
  const timer = driver.setInterval(emit, intervalMs);
  return () => driver.clearInterval(timer);
}
