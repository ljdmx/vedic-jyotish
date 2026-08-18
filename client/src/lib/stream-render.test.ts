import { describe, expect, it } from "vitest";
import { appendStableMarkdown, clearStreamRenderTargets, type StreamRenderTarget } from "./stream-render";

function createTarget() {
  let html = "";
  const appended: string[] = [];
  let cleared = 0;
  let replacements = 0;
  const target: StreamRenderTarget = {
    get innerHTML() { return html; },
    set innerHTML(value: string) { replacements++; html = value; },
    insertAdjacentHTML: (_position: InsertPosition, value: string) => {
      appended.push(value);
      html += value;
    },
    replaceChildren: () => {
      cleared++;
      html = "";
    },
  };
  return { target, appended, get html() { return html; }, get cleared() { return cleared; }, get replacements() { return replacements; } };
}

describe("流式稳定区增量渲染", () => {
  it("只追加新闭合块，不重建既有稳定内容", () => {
    const view = createTarget();
    let stable = appendStableMarkdown(view.target, "", "第一段\n");
    const firstHtml = view.html;
    stable = appendStableMarkdown(view.target, stable, "第一段\n第二段\n");

    expect(stable).toBe("第一段\n第二段\n");
    expect(view.appended).toHaveLength(2);
    expect(view.html).toContain(firstHtml);
    expect(view.appended[1]).toContain("第二段");
  });

  it("稳定区未变化时不会写入 DOM，模拟尾部活动块独立更新", () => {
    const view = createTarget();
    const stable = appendStableMarkdown(view.target, "", "已闭合内容\n");
    const writes = view.appended.length;
    appendStableMarkdown(view.target, stable, stable);

    expect(view.appended).toHaveLength(writes);
  });

  it("长报告的稳定区持续追加时不会触发全量 innerHTML 重建", () => {
    const view = createTarget();
    let stable = "";
    for (let index = 1; index <= 120; index++) {
      stable = appendStableMarkdown(view.target, stable, `${stable}第 ${index} 段稳定内容\n`);
    }

    expect(view.appended).toHaveLength(120);
    expect(view.replacements).toBe(0);
    expect(view.html).toContain("第 120 段稳定内容");
  });

  it("重启时会同时清空稳定区与活动尾部", () => {
    const stable = createTarget();
    const tail = createTarget();
    appendStableMarkdown(stable.target, "", "旧稳定内容\n");
    tail.target.innerHTML = "旧尾部";

    clearStreamRenderTargets(stable.target, tail.target);

    expect(stable.cleared).toBe(1);
    expect(tail.cleared).toBe(1);
    expect(stable.html).toBe("");
    expect(tail.html).toBe("");
  });
});
