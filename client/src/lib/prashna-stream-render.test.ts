import { describe, expect, it } from "vitest";
import { getReportRenderMode } from "./report-stream-lifecycle";

describe("Prashna 裁决摘要的终态视图", () => {
  it("流式结束后保持原始追加视图，避免裁决摘要被完整 Markdown 组件从头重建", () => {
    const summary = "## Prashna 裁决摘要\n\n> **当前裁决：条件性推进**";
    const streamed = `${summary}\n\n### 支持证据\n- 原位追加内容`;

    expect(getReportRenderMode(true, false, Boolean(streamed))).toBe("raw");
    expect(getReportRenderMode(false, true, Boolean(streamed))).toBe("raw");
    expect(streamed.startsWith(summary)).toBe(true);
  });
});
