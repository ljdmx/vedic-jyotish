export type ReportRenderMode = "none" | "raw" | "markdown";

/**
 * 流式报告一旦开始，终态也继续沿用原始增量 DOM，避免切换完整 Markdown 组件时从头重建。
 * 只有用户打开已保存的历史报告时，才使用完整 Markdown 视图。
 */
export function getReportRenderMode(streaming: boolean, preserveRawAfterTerminal: boolean, hasReport: boolean): ReportRenderMode {
  if (streaming || preserveRawAfterTerminal) return "raw";
  return hasReport ? "markdown" : "none";
}

/** 兼容旧 restart 事件时保留已显示的累计文本，不允许视觉清屏。 */
export function retainContentOnRestart(currentContent: string) {
  return currentContent;
}
