/**
 * 流式期间的轻量 markdown 渲染。
 * 目标：在不引入重型 AST 解析的前提下，让生成中的文本实时呈现
 * 标题、加粗、列表、引用、段落等基础排版（避免显示原始 ** / ## 符号）。
 *
 * 安全：先做 HTML escape 再拼标签，模型输出不会注入脚本。
 * 性能：纯字符串 + 正则，每 100ms 处理数百字符的开销远低于完整 markdown 解析。
 * 未闭合标记：** 按奇偶交替成 <strong>，未闭合时自动成为开标签（浏览器容错渲染）。
 *
 * 行首 ✓/✗ emoji：识别并替换为 CSS 几何标记（朱砂色对勾 / 古铜色小方块），
 * 避免浏览器调用系统 emoji 字体渲染低质量位图。
 */

function inline(text: string): string {
  let strongOpen = false;
  return text
    .replace(/\*\*/g, () => {
      strongOpen = !strongOpen;
      return strongOpen ? "<strong>" : "</strong>";
    })
    .replace(/`([^`\n]+)`/g, "<code>$1</code>");
}

function renderListItem(text: string): string {
  const enabledMatch = text.match(/^[✅✓✔]\s+(.*)$/);
  const disabledMatch = text.match(/^[❌✗✘]\s+(.*)$/);
  if (enabledMatch) {
    return `<li><span class="lm-mark lm-mark--yes" aria-label="已包含"></span>${inline(enabledMatch[1])}</li>`;
  }
  if (disabledMatch) {
    return `<li><span class="lm-mark lm-mark--no" aria-label="未计算"></span>${inline(disabledMatch[1])}</li>`;
  }
  return `<li>${inline(text)}</li>`;
}

function renderOrderedListItem(text: string): string {
  return `<li>${inline(text)}</li>`;
}

function isPlainSectionTitle(text: string) {
  return /^(?:（(?:启用|未启用|未计算)）\s*)?(?:现实里怎么验证|接下来怎么做|仍需核对|边界说明|盘面依据|行动建议)\s*[：:]?$/.test(text);
}

function isSectionTitle(text: string) {
  return /^#{1,3}\s+/.test(text) || isPlainSectionTitle(text);
}

/**
 * 模型有时把“计算核对”引用块、后续章节标题和列表以单换行连续输出。
 * 在流式尾部收束前将这些明确的语义边界补为独立块，避免标题粘在引用后或列表退化为段落。
 */
function normalizeReportBlockBoundaries(input: string) {
  const lines = input.split("\n");
  const normalized: string[] = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const trimmed = line.trim();
    const next = lines[index + 1]?.trim() ?? "";
    const sectionTitle = isSectionTitle(trimmed);
    if (sectionTitle && normalized.length > 0 && normalized[normalized.length - 1].trim() !== "") normalized.push("");
    normalized.push(line);
    if (sectionTitle && next && /^(?:\d+[.)]|[-*+])\s+/.test(next)) normalized.push("");
  }
  return normalized.join("\n");
}

/**
 * 把全文切分为「稳定块」与「尾部活动块」，采用行级边界：
 * - tail：最后一行（可能在增长）或整个未闭合的连续列表块
 * - stable：其余全部（按行视为已闭合）
 * 这样 AI 报告常见的单换行文本也能获得增量渲染，不会每次 flush 全量重建。
 * 列表安全：若最后一行是 "- " 列表行，则整块连续列表都归入 tail，避免列表断裂成两个 ul。
 */
export function splitStableTail(fullText: string): { stable: string; tail: string } {
  const lines = fullText.split("\n");
  let stableEnd = lines.length;

  // 若末尾是增长中的列表行，向上回卷整块连续列表都算 tail
  let i = lines.length - 1;
  while (i >= 0 && /^-\s+/.test(lines[i].trimEnd())) i--;
  if (i < lines.length - 1) stableEnd = i + 1;

  // 非列表场景：最后一行可能是增长中的段落/标题，归入 tail
  if (stableEnd === lines.length) {
    // 最后一行是空行 → 全部已闭合
    if (lines[lines.length - 1]?.trim() === "") {
      stableEnd = lines.length;
    } else {
      stableEnd = Math.max(0, lines.length - 1);
    }
  }

  return { stable: lines.slice(0, stableEnd).join("\n"), tail: lines.slice(stableEnd).join("\n") };
}

export function renderLightMarkdown(input: string): string {
  if (!input) return "";
  const escaped = normalizeReportBlockBoundaries(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

  const blocks = escaped.split(/\n{2,}/);
  return blocks
    .map(block => {
      const lines = block.split("\n").map(line => line.trimEnd());
      const nonEmpty = lines.filter(line => line.trim().length > 0).map(line => line.trimStart());
      if (nonEmpty.length === 0) return "";

      // 无序列表块：支持模型常见的 - / * / + 前缀
      if (nonEmpty.every(line => /^[-*+]\s+/.test(line))) {
        return `<ul>${nonEmpty.map(line => renderListItem(line.replace(/^[-*+]\s+/, ""))).join("")}</ul>`;
      }

      // 有序步骤：终态常用于“接下来怎么做”，应保持真实序号而非退化为普通段落。
      if (nonEmpty.every(line => /^\d+[.)]\s+/.test(line))) {
        return `<ol>${nonEmpty.map(line => renderOrderedListItem(line.replace(/^\d+[.)]\s+/, ""))).join("")}</ol>`;
      }

      return nonEmpty
        .map(line => {
          const text = line.trim();
          if (/^###\s+/.test(text)) return `<h4>${inline(text.replace(/^###\s+/, ""))}</h4>`;
          if (/^##\s+/.test(text)) return `<h3>${inline(text.replace(/^##\s+/, ""))}</h3>`;
          if (/^#\s+/.test(text)) return `<h2>${inline(text.replace(/^#\s+/, ""))}</h2>`;
          if (/^(?:>|&gt;)\s+/.test(text)) return `<blockquote>${inline(text.replace(/^(?:>|&gt;)\s+/, ""))}</blockquote>`;
          if (/^(?:---|___|\*\*\*)$/.test(text)) return "<hr />";
          if (/^（[^）]{2,28}）$/.test(text)) return `<p class="lm-section-label">${inline(text)}</p>`;
          if (isPlainSectionTitle(text)) return `<h4 class="lm-section-title">${inline(text)}</h4>`;
          return `<p>${inline(text)}</p>`;
        })
        .join("");
    })
    .join("");
}
