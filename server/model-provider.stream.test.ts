import { afterEach, describe, expect, it, vi } from "vitest";
import { streamCompatibleModel } from "./model-provider";
import type { TemporaryModelConfig } from "../shared/model-config";

function sseResponse(chunks: string[]) {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach(chunk => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    },
  }), { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

const providers: Array<{ label: string; selection: TemporaryModelConfig }> = [
  { label: "DeepSeek", selection: { provider: "deepseek", model: "deepseek-v4-flash", apiKey: "temporary-key" } },
  { label: "Kimi", selection: { provider: "kimi", model: "kimi-k3", apiKey: "temporary-key" } },
  { label: "Qwen", selection: { provider: "qwen", model: "qwen3.8-max", apiKey: "temporary-key" } },
  { label: "GLM", selection: { provider: "glm", model: "glm-5.2", apiKey: "temporary-key" } },
  { label: "AIAPI.world", selection: { provider: "aiapi", model: "compatible-model", apiKey: "temporary-key" } },
];

async function collectStream(chunks: string[], selection = providers[1].selection) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseResponse(chunks)));
  let output = "";
  for await (const text of streamCompatibleModel({
    selection,
    messages: [{ role: "user", content: "test" }],
  })) output += text;
  return output;
}

afterEach(() => vi.unstubAllGlobals());

describe("兼容模型流式完成状态", () => {
  it.each(providers)("%s 能处理跨网络分块、空增量和 [DONE]", async ({ selection }) => {
    await expect(collectStream([
      'data: {"choices":[{"delta":{"content":"观',
      '星"}}]}\n\ndata: {"choices":[{"delta":{"content":""}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"有境"}}]}\n\n',
      "data: [DONE]\n\n",
    ], selection)).resolves.toBe("观星有境");
  });

  it.each(providers)("%s 在缺失 [DONE] 时将截断流标记为失败", async ({ selection }) => {
    await expect(collectStream([
      'data: {"choices":[{"delta":{"content":"不完整"}}]}\n\n',
    ], selection)).rejects.toThrow("完成标记前中断");
  });
});
