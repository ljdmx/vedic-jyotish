import { describe, expect, it } from "vitest";
import { renderLightMarkdown } from "./light-markdown";

describe("轻量流式 Markdown", () => {
  it("将终态常见的编号步骤、分隔线和小节标签转为语义化排版", () => {
    const html = renderLightMarkdown("（接下来怎么做）\n\n1. 先核对材料\n  2. 再提交申请\n\n---\n\n> 依据：H10。");
    expect(html).toContain('<p class="lm-section-label">（接下来怎么做）</p>');
    expect(html).toContain("<ol><li>先核对材料</li><li>再提交申请</li></ol>");
    expect(html).toContain("<hr />");
    expect(html).toContain("<blockquote>依据：H10。</blockquote>");
  });

  it("将无 Markdown 标记的常用报告章节识别为阅读标题", () => {
    const html = renderLightMarkdown("现实里怎么验证\n\n1. 核对回执\n\n（未启用）接下来怎么做");
    expect(html).toContain('<h4 class="lm-section-title">现实里怎么验证</h4>');
    expect(html).toContain('<h4 class="lm-section-title">（未启用）接下来怎么做</h4>');
  });

  it("将引用块后紧接的章节与步骤拆为独立终态块，避免流式边界粘连", () => {
    const html = renderLightMarkdown("> 计算核对：仅作复核。\n### 现实里怎么验证\n1. 核查系统状态\n2. 对照材料清单\n\n结语");
    expect(html).toContain("<blockquote>计算核对：仅作复核。</blockquote>");
    expect(html).toContain("<h4>现实里怎么验证</h4>");
    expect(html).toContain("<ol><li>核查系统状态</li><li>对照材料清单</li></ol>");
  });
});
