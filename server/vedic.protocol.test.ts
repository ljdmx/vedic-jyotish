import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { REPORT_CLARITY_PROTOCOL, REPORT_QUALITY_PROTOCOL } from "./vedic";

const vedicSource = readFileSync(resolve(process.cwd(), "server/vedic.ts"), "utf8");

describe("AI 报告质量协议", () => {
  it("要求结论、可见依据、行动与现实核验形成闭环", () => {
    expect(REPORT_CLARITY_PROTOCOL).toContain("白话结论");
    expect(REPORT_CLARITY_PROTOCOL).toContain("依据：");
    expect(REPORT_QUALITY_PROTOCOL).toContain("关键结论必须形成闭环");
    expect(REPORT_QUALITY_PROTOCOL).toContain("如何观察或执行");
    expect(REPORT_QUALITY_PROTOCOL).toContain("现有资料不足以判断");
  });

  it("明确禁止用无法核对的泛化话术替代解读", () => {
    expect(REPORT_QUALITY_PROTOCOL).toContain("能量很强");
    expect(REPORT_QUALITY_PROTOCOL).toContain("你天生注定");
    expect(REPORT_QUALITY_PROTOCOL).toContain("不得伪造具体日期");
  });

  it("让普通与流式生成都引入同一质量协议", () => {
    expect(vedicSource.match(/\$\{REPORT_QUALITY_PROTOCOL\}/g)).toHaveLength(2);
    expect(vedicSource).toContain("正文不得重复该段");
  });
});
