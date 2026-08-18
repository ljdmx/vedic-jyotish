/**
 * AI 报告流式客户端：POST /api/stream/report，以 SSE 增量接收模型输出。
 * 事件负载（单行 JSON）：
 *   {"type":"delta","text":"..."}     增量正文
 *   {"type":"restart"}                P1–P12 重试清屏
 *   {"type":"heartbeat"}              服务端连接仍存活（不携带正文）
 *   {"type":"done","report":{...},...} 结束并携带完整报告
 *   {"type":"error","message":"..."}  失败
 * 返回取消函数；组件卸载或切换模块时应调用以避免无用写入。
 */

export type StreamReportResult = {
  type: "done";
  report: { id: number; stack: string; title: string; resultMarkdown: string; createdAt: string; persistence: "memory-only" };
  previewChart: unknown;
  rectification: unknown;
  synastry: unknown;
};

export type StreamReportHandlers = {
  onDelta: (text: string) => void;
  onRestart: () => void;
  onHeartbeat?: () => void;
  onDone: (result: StreamReportResult) => void;
  onError: (message: string) => void;
};

/**
 * 为单页中的连续报告请求提供会话令牌。
 * 新会话或主动取消都会使旧回调失效，避免网络延迟下旧流写入新报告。
 */
export function createStreamRunGuard() {
  let currentRun = 0;
  return {
    begin() {
      currentRun += 1;
      return currentRun;
    },
    invalidate() {
      currentRun += 1;
    },
    isCurrent(run: number) {
      return run === currentRun;
    },
  };
}

export function parseSseEvents(accumulated: string): { remaining: string; events: string[] } {
  const blocks = accumulated.split(/\r?\n\r?\n/);
  const remaining = blocks.pop() ?? "";
  const events: string[] = [];
  for (const block of blocks) {
    for (const line of block.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed.startsWith("data:")) events.push(trimmed.slice(5).trim());
    }
  }
  return { remaining, events };
}

export function streamReport(payload: Record<string, unknown>, handlers: StreamReportHandlers): () => void {
  const controller = new AbortController();
  (async () => {
    try {
      const response = await fetch("/api/stream/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!response.ok) {
        let message = `报告请求失败（HTTP ${response.status}）`;
        try {
          const data = (await response.json()) as { error?: string };
          if (data?.error) message = data.error;
        } catch {
          /* keep default message */
        }
        handlers.onError(message);
        return;
      }
      if (!response.body) {
        handlers.onError("当前浏览器不支持流式响应，请更换现代浏览器后重试");
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let lastSequence = 0;
      let terminalEvent = false;
      const consumeEvents = (events: string[]) => {
        for (const event of events) {
          if (!event || terminalEvent) continue;
          let parsed: Record<string, unknown>;
          try {
            parsed = JSON.parse(event) as Record<string, unknown>;
          } catch {
            continue;
          }
          const sequence = typeof parsed.sequence === "number" ? parsed.sequence : undefined;
          if (sequence !== undefined) {
            if (sequence <= lastSequence) continue;
            lastSequence = sequence;
          }
          if (parsed.type === "delta") handlers.onDelta(typeof parsed.text === "string" ? parsed.text : "");
          else if (parsed.type === "restart") handlers.onRestart();
          else if (parsed.type === "heartbeat") handlers.onHeartbeat?.();
          else if (parsed.type === "done") {
            terminalEvent = true;
            handlers.onDone(parsed as unknown as StreamReportResult);
          } else if (parsed.type === "error") {
            terminalEvent = true;
            handlers.onError(typeof parsed.message === "string" ? parsed.message : "生成报告时出现异常");
          }
        }
      };
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          // 容错处理：部分兼容网关会在最后一个 SSE 块缺少空行分隔时直接关闭连接。
          // 以虚拟分隔符清空剩余缓冲，避免已到达的 done/error 事件被误判为截断。
          buffer += decoder.decode();
          if (buffer.trim()) consumeEvents(parseSseEvents(`${buffer}\n\n`).events);
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        const { remaining, events } = parseSseEvents(buffer);
        buffer = remaining;
        consumeEvents(events);
      }
      if (!terminalEvent && !controller.signal.aborted) handlers.onError("模型流在完成事件前中断，请重试");
    } catch (error) {
      if (!controller.signal.aborted) {
        handlers.onError(error instanceof Error ? error.message : "网络连接中断，报告未完成");
      }
    }
  })();
  return () => controller.abort();
}
