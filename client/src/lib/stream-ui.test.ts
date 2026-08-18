import { describe, expect, it } from "vitest";
import { getReportReadingNote, getStreamingInkwellCopy, getStreamingStatusCopy } from "./stream-ui";

describe("流式报告前端展示状态", () => {
  it("为书写、等待和长等待状态提供不同且可行动的文案", () => {
    expect(getStreamingStatusCopy("writing")).toBe("正在书写…");
    expect(getStreamingStatusCopy("waiting")).toContain("等待下一段内容");
    expect(getStreamingStatusCopy("long-waiting")).toContain("停止后重新生成");
    expect(getStreamingInkwellCopy("long-waiting")).toContain("停止后重新生成");
  });

  it("停止或中断时不会将部分报告标记为完整", () => {
    expect(getReportReadingNote(true)).toContain("已停止或中断");
    expect(getReportReadingNote(false)).toContain("完整报告");
  });
});
