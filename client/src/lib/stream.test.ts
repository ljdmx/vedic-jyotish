import { afterEach, describe, expect, it, vi } from "vitest";
import { streamReport } from "./stream";

function sseResponse(chunks: string[]) {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach(chunk => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    },
  }), { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

afterEach(() => vi.unstubAllGlobals());

describe("浏览器侧报告流", () => {
  it("按 sequence 忽略重复事件，并在 done 后结束", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseResponse([
      'data: {"type":"delta","text":"第一段","sequence":1}\n\n',
      'data: {"type":"delta","text":"第一段","sequence":1}\n\n',
      'data: {"type":"done","report":{"id":1,"stack":"natal","title":"报告","resultMarkdown":"第一段","createdAt":"2026-01-01T00:00:00.000Z","persistence":"memory-only"},"previewChart":null,"rectification":null,"synastry":null,"sequence":2}\n\n',
    ])));
    const deltas: string[] = [];
    const result = await new Promise<"done" | string>(resolve => {
      streamReport({}, {
        onDelta: text => deltas.push(text),
        onRestart: () => undefined,
        onDone: () => resolve("done"),
        onError: message => resolve(message),
      });
    });
    expect(result).toBe("done");
    expect(deltas).toEqual(["第一段"]);
  });

  it("在未收到终态事件时报告截断错误", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseResponse([
      'data: {"type":"delta","text":"部分内容","sequence":1}\n\n',
    ])));
    const result = await new Promise<string>(resolve => {
      streamReport({}, {
        onDelta: () => undefined,
        onRestart: () => undefined,
        onDone: () => resolve("unexpected done"),
        onError: resolve,
      });
    });
    expect(result).toContain("完成事件前中断");
  });
});

