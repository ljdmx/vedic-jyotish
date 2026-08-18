import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(resolve(process.cwd(), "client/src/index.css"), "utf8");

describe("AI 输出模式菜单样式契约", () => {
  it("保留纸本选中状态和键盘焦点", () => {
    expect(stylesheet).toContain(".output-mode-card button.is-selected { border-left-color: #a45f49;");
    expect(stylesheet).toContain(".output-mode-card button:focus-visible { z-index: 1; outline: 1px solid #65796b;");
  });

  it("在小屏幕以固定菜单呈现，避免受顶部工具区裁切", () => {
    const mobileRules = stylesheet.slice(stylesheet.indexOf("@media (max-width: 680px)"));
    expect(mobileRules).toContain(".output-mode-card { position: fixed;");
    expect(mobileRules).toContain("left: max(.75rem, env(safe-area-inset-left, 0px));");
    expect(mobileRules).toContain(".output-mode-card::before { display: none; }");
  });
});
