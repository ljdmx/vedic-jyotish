import type { StreamWaitState } from "./stream-status";

export function getStreamingStatusCopy(waitState: StreamWaitState) {
  if (waitState === "long-waiting") return "等待已持续较久；可停止后重新生成";
  if (waitState === "connected-waiting") return "连接正常，正在整理下一段内容…";
  if (waitState === "waiting") return "正在整理下一段内容…";
  return "正在逐段送达…";
}

export function getStreamingInkwellCopy(waitState: StreamWaitState) {
  if (waitState === "long-waiting") return "等待已持续较久；可停止后重新生成";
  if (waitState === "connected-waiting") return "连接正常，正在整理下一段内容…";
  if (waitState === "waiting") return "正在整理下一段内容…";
  return "正在整理首段内容…";
}

export function getReportReadingNote(interrupted: boolean, mode: "stream" | "single") {
  return interrupted
    ? "本次生成已停止或中断；现有内容已保留在当前页面，可重新生成以获取完整报告。"
    : mode === "stream"
      ? "本次流式报告已完整送达；可继续向下滚动页面，或使用 Page Down / End 键阅读至末尾。"
      : "完整报告已一次呈现；可继续向下滚动页面，或使用 Page Down / End 键阅读至末尾。";
}
