import { describe, expect, it } from "vitest";
import { REPORT_CLARITY_PROTOCOL } from "./vedic";

describe("全模块报告表达协议", () => {
  it("要求先给白话结论、行动重点和可核对依据，并把限制放在后面", () => {
    expect(REPORT_CLARITY_PROTOCOL).toContain("先给白话结论");
    expect(REPORT_CLARITY_PROTOCOL).toContain("下一步");
    expect(REPORT_CLARITY_PROTOCOL).toContain("依据：");
    expect(REPORT_CLARITY_PROTOCOL).toContain("最后再写限制");
  });
});
