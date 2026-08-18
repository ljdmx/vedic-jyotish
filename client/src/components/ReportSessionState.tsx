import React from "react";
import type { AiOutputMode } from "@/lib/output-mode";
import type { StreamWaitState } from "@/lib/stream-status";

type ReportSessionPhase = "stream" | "single" | "failed";

export function ReportSessionState({ mode, phase, waitState = "writing", error }: { mode: AiOutputMode; phase: ReportSessionPhase; waitState?: StreamWaitState; error?: string | null }) {
  const isStream = mode === "stream";
  const copy = phase === "failed"
    ? { stamp: "本次未完成", title: "报告没有完整生成", detail: error || "请检查模型配置或稍后重新生成。" }
    : isStream
      ? waitState === "long-waiting"
        ? { stamp: "逐段送达", title: "这一段准备时间较长", detail: "可继续等待，或停止后重新生成；已送达的内容会保留。" }
        : waitState === "writing"
          ? { stamp: "逐段送达", title: "内容正连续写入卷轴", detail: "新增内容会直接追加在下方，不会从头重排。" }
          : { stamp: "逐段送达", title: "正在整理下一段内容", detail: "连接仍正常；下一段会在准备好后继续追加。" }
      : { stamp: "完整呈现", title: "正在整理完整报告", detail: "完成后会一次呈现完整内容，不显示草稿或内部过程。" };

  return <div className="report-session" data-delivery={isStream ? "stream" : "single"} data-session-phase={phase} role="status" aria-live="polite">
    <span className="report-session__stamp">{copy.stamp}</span>
    <div>
      <strong>{copy.title}</strong>
      <p>{copy.detail}</p>
    </div>
  </div>;
}
