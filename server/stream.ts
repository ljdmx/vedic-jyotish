import { TRPCError } from "@trpc/server";
import type { Request, Response } from "express";
import { prepareReportAnalysis, reportInputSchema } from "./routers";
import { generateAnalysisStream, moduleTitle } from "./vedic";

/**
 * 流式报告端点：POST /api/stream/report
 * 以 SSE（text/event-stream）实时推送模型增量，事件负载为单行 JSON：
 *   {"type":"delta","text":"..."}    增量正文
 *   {"type":"restart"}                P1–P12 重试清屏
 *   {"type":"done","report":{...},...} 结束并携带完整报告与盘面
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
  const emit = (payload: Record<string, unknown>) => writeSse(res, { ...payload, sequence: ++sequence });

  let input;
  try {
    input = reportInputSchema.parse(req.body);
  } catch {
    res.status(400).json({ error: "请求参数不符合接口规范" });
    return;
  }

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
        emit({ type: "delta", text: event.text });
      } else if (event.type === "restart") {
        resultMarkdown = "";
        emit({ type: "restart" });
      } else {
        emit({
          type: "done",
          report: { ...report, resultMarkdown },
          previewChart: previewChart ?? null,
          rectification: rectification ?? null,
          synastry: synastry ?? null,
        });
      }
    });
    res.end();
  } catch (error) {
    if (error instanceof TRPCError) {
      emit({ type: "error", message: error.message });
    } else {
      console.error("[Stream] report stream failed", error);
      emit({ type: "error", message: "生成报告时出现异常，请稍后重试" });
    }
    res.end();
  }
}
