import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const homeSource = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");

describe("AI 输出模式报告分派", () => {
  it("将普通模块与独立栈统一交给模式分派入口", () => {
    expect(homeSource).toContain("const startReport = (payload: Record<string, unknown>)");
    expect(homeSource).toContain("if (usesStreamingReportPath(outputMode)) startReportStream(payload);");
    expect(homeSource).toContain('startReport({ stack: "synastry"');
    expect(homeSource).toContain('startReport({ stack: "prashna"');
    expect(homeSource).not.toContain('startReportStream({ stack: "synastry"');
    expect(homeSource).not.toContain('startReportStream({ stack: "prashna"');
  });
});
