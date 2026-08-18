import { describe, expect, it } from "vitest";
import { getReportRenderMode, retainContentOnRestart } from "./report-stream-lifecycle";

describe("报告流视图生命周期", () => {
  it("重复 restart 会保留已经显示的累计内容", () => {
    const firstPass = "### P1：第一宫\n首稿内容\n\n### P8：第八宫\n首稿内容";
    expect(retainContentOnRestart(retainContentOnRestart(firstPass))).toBe(firstPass);
  });

  it("流式完成后继续使用原始 DOM，不回退至从头 Markdown 定型", () => {
    expect(getReportRenderMode(true, false, true)).toBe("raw");
    expect(getReportRenderMode(false, true, true)).toBe("raw");
    expect(getReportRenderMode(false, false, true)).toBe("markdown");
    expect(getReportRenderMode(false, false, false)).toBe("none");
  });
});
