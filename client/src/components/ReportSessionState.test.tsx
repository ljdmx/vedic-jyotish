import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReportSessionState } from "./ReportSessionState";

describe("双模式报告会话状态", () => {
  it("流式模式强调逐段送达且不暴露模型推理字样", () => {
    const html = renderToStaticMarkup(<ReportSessionState mode="stream" phase="stream" waitState="waiting" />);
    expect(html).toContain("逐段送达");
    expect(html).toContain("正在整理下一段内容");
    expect(html).not.toContain("推理");
  });

  it("一次性模式说明完成后才呈现完整内容", () => {
    const html = renderToStaticMarkup(<ReportSessionState mode="single" phase="single" />);
    expect(html).toContain("完整呈现");
    expect(html).toContain("不显示草稿或内部过程");
  });
});
