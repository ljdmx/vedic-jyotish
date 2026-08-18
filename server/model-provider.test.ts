import { describe, expect, it } from "vitest";
import { createUserFacingTextFilter, extractCompatibleText, extractSseEvents, resolveModelSelection, sanitizeUserFacingText } from "./model-provider";

describe("临时模型配置", () => {
  it("未选择模型时使用部署级 Agnes 默认模型", () => {
    const resolved = resolveModelSelection();
    expect(resolved.provider).toBe("agnes");
    expect(resolved.baseUrl).toBe("https://api.agnes-ai.cn/v1");
    expect(resolved.model).toBe("agnes-2.5-flash");
    expect(resolved.apiKey).toBeTruthy();
  });

  it("允许受支持的临时兼容模型但不修改默认配置", () => {
    const resolved = resolveModelSelection({ provider: "kimi", model: "kimi-k3", apiKey: "temporary-key" });
    expect(resolved).toMatchObject({ provider: "kimi", baseUrl: "https://api.moonshot.cn/v1", model: "kimi-k3", apiKey: "temporary-key" });
  });

  it("拒绝非白名单供应商，并忽略尝试注入的 Base URL", () => {
    expect(() => resolveModelSelection({ provider: "custom" as never, model: "test", apiKey: "temporary-key" })).toThrow("不支持的模型供应商");
    const resolved = resolveModelSelection({ provider: "aiapi", model: "safe-model", apiKey: "temporary-key", baseUrl: "https://192.168.1.5/v1" } as never);
    expect(resolved.baseUrl).toBe("https://aiapi.world/v1");
  });

  it("拒绝缺少临时密钥或模型名称的自带模型请求", () => {
    expect(() => resolveModelSelection({ provider: "deepseek" })).toThrow("API Key");
    expect(() => resolveModelSelection({ provider: "aiapi", apiKey: "temporary-key" })).toThrow("模型名称");
  });

  it("提取字符串与多段消息正文，兼容默认 Agnes 的响应形态", () => {
    expect(extractCompatibleText({ choices: [{ message: { content: "  单段正文  " } }] })).toBe("单段正文");
    expect(extractCompatibleText({ choices: [{ message: { content: [{ type: "text", text: "第一段" }, { type: "text", text: "第二段" }] } }] })).toBe("第一段\n第二段");
    expect(extractCompatibleText({ choices: [{ message: { content: [] } }] })).toBe("");
  });

  it("剔除一次性响应中明确标记的思考草稿，仅保留报告正文", () => {
    const content = "<thinking>先列出内部推演</thinking>\n## 结论\n建议先核对材料。\n```analysis\n不应展示的过程\n```\n依据：H10。";
    expect(sanitizeUserFacingText(content)).toBe("## 结论\n建议先核对材料。\n\n依据：H10。");
    expect(extractCompatibleText({ choices: [{ message: { content } }] })).not.toContain("内部推演");
  });

  it("跨流式分块隐藏拆开的思考标签，不让过程文本闪现", () => {
    const filter = createUserFacingTextFilter();
    expect(filter("先给结论。<thin")).toBe("先给结论。");
    expect(filter("king>隐藏过程</thinking>\n依据：H10。")).toBe("\n依据：H10。");
  });

  it("按 SSE 事件块切分 data 负载，并保留不完整的尾部缓冲", () => {
    const { remaining, events } = extractSseEvents('data: {"a":1}\n\ndata: {"b":2}\n\ndata: [D');
    expect(events).toEqual(['{"a":1}', '{"b":2}']);
    expect(remaining).toBe("data: [D");
  });

  it("忽略非 data 行与跨块混合的注释行", () => {
    const { events } = extractSseEvents('event: ping\n: heartbeat\ndata: {"ok":true}\n\n');
    expect(events).toEqual(['{"ok":true}']);
  });

  it("在一次解码分片中处理多个完整事件（增量拼接场景）", () => {
    const first = extractSseEvents('data: {"choices":[{"delta":{"content":"你好"}}]}\n\n');
    expect(first.events).toHaveLength(1);
    const second = extractSseEvents(`${first.remaining}data: {"choices":[{"delta":{"content":"，世界"}}]}\n\ndata: [DONE]\n\n`);
    expect(second.events).toEqual(['{"choices":[{"delta":{"content":"，世界"}}]}', "[DONE]"]);
    expect(second.remaining).toBe("");
  });
});
