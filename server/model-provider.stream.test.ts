import { afterEach, describe, expect, it, vi } from "vitest";
import { streamCompatibleModel } from "./model-provider";

function sseResponse(chunks: string[]) {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach(chunk => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    },
  }), { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

async function collectStream(chunks: string[]) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseResponse(chunks)));
  let output = "";
  for await (const text of streamCompatibleModel({
    selection: { provider: "kimi", model: "kimi-k3", apiKey: "temporary-key" },
    messages: [{ role: "user", content: "test" }],
  })) output += text;
  return output;
}

afterEach(() => vi.unstubAllGlobals());

describe("兼容模型流式完成状态", () => {
  it("在收到 [DONE] 后完成并拼接增量正文", async () => {
    await expect(collectStream([
      'data: {"choices":[{"delta":{"content":"观星"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"有境"}}]}\n\n',
      "data: [DONE]\n\n",
    ])).resolves.toBe("观星有境");
  });

  it("在缺失 [DONE] 时将截断流标记为失败", async () => {
    await expect(collectStream([
      'data: {"choices":[{"delta":{"content":"不完整"}}]}\n\n',
    ])).rejects.toThrow("完成标记前中断");
  });
});
