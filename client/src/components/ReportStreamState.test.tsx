import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReportReadingNote, ReportStreamInkwell, ReportStreamMeta } from "./ReportStreamState";

describe("报告抽屉流式状态 UI", () => {
  it("在长等待时渲染可操作的停止重试提示", () => {
    const html = renderToStaticMarkup(<><ReportStreamMeta waitState="long-waiting" /><ReportStreamInkwell waitState="long-waiting" /></>);
    expect(html).toContain('data-stream-state="long-waiting"');
    expect(html).toContain("停止后重新生成");
  });

  it("在停止或中断后渲染部分报告保留提示，而非完整报告提示", () => {
    const html = renderToStaticMarkup(<p><ReportReadingNote interrupted mode="stream" /></p>);
    expect(html).toContain("已停止或中断");
    expect(html).toContain("可重新生成");
  });
});
