import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "client/src/index.css"), "utf8");

describe("纸墨背景资源来源", () => {
  it("使用静态基础纸纹与原始质量的受管高分辨率工作台背景", () => {
    expect(css).toContain('url("/images/astral-manuscript-hero-refined.webp")');
    expect(css).toContain('url("/images/astral-manuscript-panel-refined.webp")');
    expect(css).toContain('url("/images/astral-manuscript-module.webp")');
    expect(css).toContain('url("/manus-storage/astral-manuscript-hero-work-refined3_bdd9fb4d.webp")');
  });
});
