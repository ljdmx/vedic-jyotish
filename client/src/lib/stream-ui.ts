import type { StreamWaitState } from "./stream-status";

export function getStreamingStatusCopy(waitState: StreamWaitState) {
  if (waitState === "long-waiting") return "等待已持续较久；可停止后重新生成";
  if (waitState === "connected-waiting") return "连接正常，模型仍在推理…";
  if (waitState === "waiting") return "模型正在推理，等待下一段内容…";
  return "正在书写…";
}

export function getStreamingInkwellCopy(waitState: StreamWaitState) {
  if (waitState === "long-waiting") return "等待已持续较久；可停止后重新生成";
  if (waitState === "connected-waiting") return "连接正常，模型仍在推理…";
  if (waitState === "waiting") return "模型正在推理，等待下一段内容…";
  return "模型正在生成首段内容…";
}

export function getReportReadingNote(interrupted: boolean) {
  return interrupted
    ? "本次生成已停止或中断；现有内容已保留在当前页面，可重新生成以获取完整报告。"
    : "完整报告已在当前页面连续展开；可继续向下滚动页面，或使用 Page Down / End 键阅读至末尾。";
}
