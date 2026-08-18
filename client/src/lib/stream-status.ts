export type StreamWaitState = "writing" | "waiting" | "connected-waiting" | "long-waiting";

/** 将流式空档统一映射为可测试的展示状态。 */
export function getStreamWaitState(now: number, lastChunkAt: number, lastHeartbeatAt = 0): StreamWaitState {
  if (lastHeartbeatAt > lastChunkAt && now - lastHeartbeatAt <= 3_500) return "connected-waiting";
  const elapsed = Math.max(0, now - lastChunkAt);
  if (elapsed > 8_000) return "long-waiting";
  if (elapsed > 500) return "waiting";
  return "writing";
}
