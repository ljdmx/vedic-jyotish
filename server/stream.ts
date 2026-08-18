import { TRPCError } from "@trpc/server";
import type { Request, Response } from "express";
import { prepareReportAnalysis, reportInputSchema } from "./routers";
import { generateAnalysisStream, moduleTitle } from "./vedic";
import { createStreamMetrics } from "./stream-metrics";
import { startStreamHeartbeat } from "./stream-heartbeat";

/**
 * 流式报告端点：POST /api/stream/report
 * 以 SSE（text/event-stream）实时推送模型增量，事件负载为单行 JSON：
 *   {"type":"delta","text":"..."}    增量正文
 *   {"type":"restart"}                遗留兼容事件（当前不清屏）
 *   {"type":"heartbeat"}              无内容连接活动信号
 *   {"type":"done","report":{...},"metrics":{...}} 结束并携带完整报告、盘面和无内容指标
 *   {"type":"error","message":"..."} 失败
 * 与 tRPC report.run 共享同一套校验与星盘构建逻辑（prepareReportAnalysis）。
 */

function temporaryId() {
  return -Math.floor(Date.now() + Math.random() * 10_000);
}

function writeSse(res: Response, payload: unknown) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

export async function handleReportStream(req: Request, res: Response) {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  // 禁用中间代理缓冲，保证增量即时到达浏览器
  res.setHeader("X-Accel-Buffering", "no");
  // 客户端断开时避免写入已关闭 socket 触发未捕获错误
  res.on("error", () => { /* socket closed */ });
  res.flushHeaders?.();
  let sequence = 0;
  const metrics = createStreamMetrics();
  let clientDisconnected = false;
  const disconnectController = new AbortController();
  const cancelIfDisconnected = () => {
    if (res.writableEnded) return;
    clientDisconnected = true;
    disconnectController.abort();
  };
  req.once("aborted", cancelIfDisconnected);
  res.once("close", cancelIfDisconnected);
  const emit = (payload: Record<string, unknown>) => {
    if (!clientDisconnected && !res.writableEnded) writeSse(res, { ...payload, sequence: ++sequence });
  };
  let stopHeartbeat: (() => void) | null = null;

  let input;
  try {
    input = reportInputSchema.parse(req.body);
  } catch {
    res.status(400).json({ error: "请求参数不符合接口规范" });
    return;
  }
  stopHeartbeat = startStreamHeartbeat(() => emit({ type: "heartbeat" }));

  try {
    const { stack, analysis, previewChart, rectification, synastry } = await prepareReportAnalysis(input);
    const report = {
      id: temporaryId(),
      stack,
      title: moduleTitle(input.module),
      resultMarkdown: "",
      createdAt: new Date().toISOString(),
      persistence: "memory-only" as const,
    };
    let resultMarkdown = "";
    await generateAnalysisStream(analysis, event => {
      if (event.type === "delta") {
        resultMarkdown += event.text;
        metrics.markDelta(event.text);
        emit({ type: "delta", text: event.text });
      } else if (event.type === "restart") {
        resultMarkdown = "";
        metrics.markRestart();
        emit({ type: "restart" });
      } else {
        const snapshot = metrics.snapshot();
        console.info("[Stream] completed", snapshot);
        emit({
          type: "done",
          report: { ...report, resultMarkdown },
          previewChart: previewChart ?? null,
          rectification: rectification ?? null,
          synastry: synastry ?? null,
          metrics: snapshot,
        });
      }
    }, disconnectController.signal);
    if (!clientDisconnected) res.end();
  } catch (error) {
    if (clientDisconnected || disconnectController.signal.aborted) return;
    if (error instanceof TRPCError) {
      emit({ type: "error", message: error.message });
    } else {
      console.error("[Stream] report stream failed", error);
      emit({ type: "error", message: "生成报告时出现异常，请稍后重试" });
    }
    res.end();
  } finally {
    stopHeartbeat?.();
    req.off("aborted", cancelIfDisconnected);
    res.off("close", cancelIfDisconnected);
  }
}
