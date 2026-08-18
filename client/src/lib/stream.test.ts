import { afterEach, describe, expect, it, vi } from "vitest";
import { createStreamRunGuard, streamReport } from "./stream";

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
  it("新会话或主动取消会使旧流回调失效", () => {
    const guard = createStreamRunGuard();
    const first = guard.begin();
    expect(guard.isCurrent(first)).toBe(true);

    const second = guard.begin();
    expect(guard.isCurrent(first)).toBe(false);
    expect(guard.isCurrent(second)).toBe(true);

    guard.invalidate();
    expect(guard.isCurrent(second)).toBe(false);
  });

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

  it("容错消费缺少末尾空行分隔的 done 事件", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseResponse([
      'data: {"type":"delta","text":"尾部内容","sequence":1}\n\n',
      'data: {"type":"done","report":{"id":1,"stack":"natal","title":"报告","resultMarkdown":"尾部内容","createdAt":"2026-01-01T00:00:00.000Z","persistence":"memory-only"},"previewChart":null,"rectification":null,"synastry":null,"sequence":2}',
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
    expect(deltas).toEqual(["尾部内容"]);
  });

  it("高频分块按 sequence 精确消费且不重复终态", async () => {
    const events = Array.from({ length: 180 }, (_, index) => `data: {"type":"delta","text":"${index}","sequence":${index + 1}}\n\n`);
    events.push('data: {"type":"done","report":{"id":1,"stack":"natal","title":"报告","resultMarkdown":"complete","createdAt":"2026-01-01T00:00:00.000Z","persistence":"memory-only"},"previewChart":null,"rectification":null,"synastry":null,"sequence":181}\n\n');
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseResponse([events.join("")])));
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
    expect(deltas).toHaveLength(180);
    expect(deltas[0]).toBe("0");
    expect(deltas.at(-1)).toBe("179");
  });
});
