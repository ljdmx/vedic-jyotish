import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "client/src/index.css"), "utf8");
const home = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");

describe("流式终态排版与性能契约", () => {
  it("终态原始流式 DOM 以纸本阅读容器收束，并隐藏活动光标", () => {
    expect(css).toContain('.report-drawer:has(.report-seal) .report-content--raw');
    expect(css).toContain('.report-drawer:has(.report-seal) .rm-tail:not(:empty)::after{display:none}');
    expect(css).toContain('.report-raw .lm-section-label');
  });

  it("增量刷新与自动跟随使用帧合并和受限滚动，而非每段整页定位", () => {
    expect(home).toContain("const FLUSH_INTERVAL_MS = 120");
    expect(home).toContain("createFrameThrottler(flushPendingReport, FLUSH_INTERVAL_MS)");
    expect(home).toContain("window.scrollBy({ top: Math.min(distanceBelowViewport + 48, 360), behavior: \"auto\" })");
    expect(home).toContain("autoScrollUntilRef.current = performance.now() + 650");
    expect(home).toContain("if (performance.now() < autoScrollUntilRef.current) return");
    expect(home).not.toContain('rawReportRef.current?.scrollIntoView({ block: "end", behavior: "auto" })');
  });
});
