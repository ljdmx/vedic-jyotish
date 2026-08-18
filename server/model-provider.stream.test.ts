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
  { label: "Bai", selection: { provider: "bai", model: "gpt-5.2", apiKey: "temporary-key" } },
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

  it.each(providers)("%s 容错接收缺少末尾空行的 [DONE]", async ({ selection }) => {
    await expect(collectStream([
      'data: {"choices":[{"delta":{"content":"末尾"}}]}\n\n',
      "data: [DONE]",
    ], selection)).resolves.toBe("末尾");
  });

  it("Bai 使用固定的 OpenAI 兼容端点、临时 Bearer 密钥与 stream 请求体", async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse(['data: {"choices":[{"delta":{"content":"Bai 已连接"}}]}\n\n', "data: [DONE]\n\n"]));
    vi.stubGlobal("fetch", fetchMock);
    let output = "";
    for await (const text of streamCompatibleModel({
      selection: { provider: "bai", model: "gpt-5.2", apiKey: "temporary-bai-key" },
      messages: [{ role: "user", content: "test" }],
    })) output += text;
    expect(output).toBe("Bai 已连接");
    expect(fetchMock).toHaveBeenCalledWith("https://api.b.ai/v1/chat/completions", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ Authorization: "Bearer temporary-bai-key", "Content-Type": "application/json" }),
      body: expect.stringContaining('"model":"gpt-5.2"'),
    }));
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({ stream: true, model: "gpt-5.2" });
  });

  it("将下游取消信号传播到上游模型请求", async () => {
    const downstream = new AbortController();
    let upstreamSignal: AbortSignal | undefined;
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      upstreamSignal = init?.signal as AbortSignal;
      upstreamSignal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));
    vi.stubGlobal("fetch", fetchMock);

    const iterator = streamCompatibleModel({
      selection: providers[0].selection,
      messages: [{ role: "user", content: "test" }],
      signal: downstream.signal,
    });
    const next = iterator.next();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    downstream.abort();

    await expect(next).rejects.toThrow();
    expect(upstreamSignal?.aborted).toBe(true);
  });
});
