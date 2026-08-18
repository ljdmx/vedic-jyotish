import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "client/src/index.css"), "utf8");

describe("双模式会话卡样式契约", () => {
  it("为流式与一次性模式提供不同的送达标记和纸本状态卡", () => {
    expect(css).toContain('.report-drawer[data-delivery="single"] .report-delivery');
    expect(css).toContain('.report-session[data-delivery="single"]');
    expect(css).toContain('.report-session[data-session-phase="failed"]');
  });

  it("在窄屏下收紧会话卡与模式标记，避免标题和说明拥挤", () => {
    expect(css).toContain('@media (max-width:560px){.report-drawer__head');
    expect(css).toContain('.report-session{gap:.58rem;min-height:6.3rem;padding:.82rem .8rem}');
  });
});
