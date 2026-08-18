import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { calculateVedicChart, type BirthInput, type VedicChart } from "../shared/vedic-engine";
import { buildKp249Table } from "../shared/kp";
import { buildRectificationCandidates, summarizeRectificationCandidates } from "../shared/rectification";
import { validatePrashnaQuestion } from "../shared/prashna-question";
import { calculateSynastry } from "../shared/synastry";
import tzLookup from "tz-lookup";
import { publicProcedure, router } from "./_core/trpc";
import { createChartForStack, extractChartDocument, generateAnalysis, moduleTitle, type AnalysisStack } from "./vedic";

const modelConfigSchema = z.object({
  provider: z.enum(["agnes", "deepseek", "kimi", "qwen", "glm", "aiapi"]),
  model: z.string().trim().min(1).max(128).optional(),
  apiKey: z.string().trim().min(1).max(512).optional(),
}).optional();

const birthSchema = z.object({
  name: z.string().trim().max(120).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  place: z.string().trim().min(1).max(160),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  timezoneOffset: z.number().int().min(-720).max(840),
  timeAccuracy: z.string().max(48).optional(),
  timeSource: z.string().max(80).optional(),
  timeBasis: z.enum(["wall_clock", "standard_time", "unknown"]).optional(),
});

const stackSchema = z.enum(["natal", "prashna", "tajika", "kp", "synastry", "rectification", "document"]);
const documentMimeSchema = z.enum(["image/png", "image/jpeg", "image/webp", "application/pdf"]);

function timezoneOffsetFor(date: string, time: string, timezone: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const utcMs = Date.UTC(year, month - 1, day, hour, minute);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(utcMs));
  const take = (type: string) => Number(parts.find(item => item.type === type)?.value || 0);
  const shownAsUtc = Date.UTC(take("year"), take("month") - 1, take("day"), take("hour"), take("minute"));
  return Math.round((shownAsUtc - utcMs) / 60_000);
}

function currentTimezoneOffsetFor(timezone: string, instant = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(instant);
  const take = (type: string) => Number(parts.find(item => item.type === type)?.value || 0);
  const shownAsUtc = Date.UTC(take("year"), take("month") - 1, take("day"), take("hour"), take("minute"), take("second"));
  return Math.round((shownAsUtc - Math.floor(instant.getTime() / 1_000) * 1_000) / 60_000);
}

function hasValidCalendarDate(date: string, time: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  if (![year, month, day, hour, minute].every(Number.isInteger) || hour > 23 || minute > 59) return false;
  const candidate = new Date(Date.UTC(year, month - 1, day, hour, minute));
  return candidate.getUTCFullYear() === year && candidate.getUTCMonth() === month - 1 && candidate.getUTCDate() === day;
}

/**
 * 用用户已定位的坐标核对历史时点对应的 UTC 偏移，避免夏令时或手填时区使工作盘误配。
 * 这保证输入与计算口径一致，不将占星解读包装为确定性的未来预测。
 */
function assertBirthInputConsistent(input: BirthInput) {
  if (!hasValidCalendarDate(input.date, input.time)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "出生日期或时间不是有效的日历时刻，请重新确认" });
  }
  const timezone = tzLookup(input.latitude, input.longitude);
  const expectedOffset = timezoneOffsetFor(input.date, input.time, timezone);
  if (input.timezoneOffset !== expectedOffset) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `出生时区与定位地点不一致：${timezone} 在该时点应为 UTC${expectedOffset >= 0 ? "+" : ""}${(expectedOffset / 60).toFixed(2)}。请重新定位地点后再计算。` });
  }
}

type AmapGeocodeResponse = {
  status?: string;
  info?: string;
  geocodes?: Array<{ formatted_address?: string; location?: string; level?: string }>;
};

type AmapReGeocodeResponse = {
  status?: string;
  info?: string;
  regeocode?: { formatted_address?: string };
};

async function reverseGeocodeWithAmap(latitude: number, longitude: number) {
  const key = process.env.AMAP_WEB_SERVICE_KEY;
  if (!key) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "高德地图 Web 服务密钥尚未配置" });

  const endpoint = new URL("https://restapi.amap.com/v3/geocode/regeo");
  endpoint.searchParams.set("key", key);
  endpoint.searchParams.set("location", `${longitude},${latitude}`);
  endpoint.searchParams.set("output", "JSON");
  endpoint.searchParams.set("extensions", "base");

  let response: Response;
  try {
    response = await fetch(endpoint);
  } catch {
    throw new TRPCError({ code: "BAD_GATEWAY", message: "高德地图服务暂时无法连接" });
  }
  if (!response.ok) throw new TRPCError({ code: "BAD_GATEWAY", message: "高德地图服务暂时不可用" });

  const payload = await response.json() as AmapReGeocodeResponse;
  const formatted = payload.status === "1" ? payload.regeocode?.formatted_address : undefined;
  if (!formatted) throw new TRPCError({ code: "NOT_FOUND", message: payload.info || "高德地图未找到该坐标的地址" });
  return { latitude, longitude, formatted };
}

async function geocodeWithAmap(address: string) {
  const key = process.env.AMAP_WEB_SERVICE_KEY;
  if (!key) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "高德地图 Web 服务密钥尚未配置" });

  const endpoint = new URL("https://restapi.amap.com/v3/geocode/geo");
  endpoint.searchParams.set("key", key);
  endpoint.searchParams.set("address", address);
  endpoint.searchParams.set("output", "JSON");

  let response: Response;
  try {
    response = await fetch(endpoint);
  } catch {
    throw new TRPCError({ code: "BAD_GATEWAY", message: "高德地图服务暂时无法连接" });
  }
  if (!response.ok) throw new TRPCError({ code: "BAD_GATEWAY", message: "高德地图服务暂时不可用" });

  const payload = await response.json() as AmapGeocodeResponse;
  const geocode = payload.status === "1" ? payload.geocodes?.[0] : undefined;
  if (!geocode?.location) throw new TRPCError({ code: "NOT_FOUND", message: payload.info || "高德地图未找到可用的地点坐标" });

  const [longitudeText, latitudeText] = geocode.location.split(",");
  const longitude = Number(longitudeText);
  const latitude = Number(latitudeText);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new TRPCError({ code: "BAD_GATEWAY", message: "高德地图返回的坐标格式无效" });

  return { latitude, longitude, formatted: geocode.formatted_address || address, matchLevel: geocode.level || "unknown" };
}

function temporaryId() {
  return -Math.floor(Date.now() + Math.random() * 10_000);
}

export const reportInputSchema = z.object({
  stack: stackSchema,
  module: z.string().min(1).max(64),
  chartInput: birthSchema.optional(),
  partnerInput: birthSchema.optional(),
  question: z.string().max(3000).optional(),
  events: z.string().max(8000).optional(),
  extraContext: z.string().max(3000).optional(),
  kpNumber: z.number().int().min(1).max(249).optional(),
  year: z.number().int().min(1900).max(2200).optional(),
  prashnaLocation: z.object({
    name: z.string().optional(),
    place: z.string().min(1).max(160),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    timezoneOffset: z.number().int().min(-720).max(840),
    timeAccuracy: z.string().optional(),
  }).optional(),
  modelConfig: modelConfigSchema,
});

export type ReportInput = z.infer<typeof reportInputSchema>;

/**
 * 校验报告请求并构建分析所需的一切（星盘、Prashna 隔离、KP 资料、校时候选等）。
 * tRPC mutation 与流式 SSE 端点共用，保证两套入口的边界规则完全一致。
 * 校验失败抛出 TRPCError；流式端点会将其映射为 HTTP 400/错误事件。
 */
export async function prepareReportAnalysis(input: ReportInput) {
  const stack = input.stack as AnalysisStack;
  if (input.chartInput) assertBirthInputConsistent(input.chartInput);
  if (input.partnerInput) assertBirthInputConsistent(input.partnerInput);
  const baseChart = input.chartInput ? calculateVedicChart(input.chartInput) : undefined;
  if (stack !== "prashna" && stack !== "kp" && !baseChart) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "请先在当前临时会话中完成出生信息排盘" });
  }
  if (stack === "prashna") {
    const questionCheck = validatePrashnaQuestion(input.question || "");
    if (!questionCheck.valid) throw new TRPCError({ code: "BAD_REQUEST", message: questionCheck.error });
  }
  if (stack === "rectification" && (input.events || "").split("\n").filter(line => line.trim()).length < 5) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "出生时间校准至少需要 5 条独立且带日期精度的事件材料" });
  }
  if (stack === "kp" && !input.kpNumber) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "KP Horary 需要由你明确选择 1–249 的编号，系统不会从问题文字代取号码" });
  }
  if (stack === "prashna" && !input.prashnaLocation) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Prashna 需要本次起盘地点、经纬度与时区" });
  }

  const prashnaChart = stack === "prashna" && input.prashnaLocation
    ? createChartForStack("prashna", { ...input.prashnaLocation, date: "2000-01-01", time: "00:00" }, { prashnaLocation: input.prashnaLocation })
    : undefined;
  const tajikaChart = stack === "tajika" && baseChart ? createChartForStack("tajika", baseChart.birth, { year: input.year }) : undefined;
  const partnerChart = input.partnerInput ? calculateVedicChart(input.partnerInput) : undefined;
  const kpData = stack === "kp" && input.kpNumber
    ? { horaryNumber: input.kpNumber, selectedRow: buildKp249Table()[input.kpNumber - 1], suppliedNotes: input.extraContext || "" }
    : undefined;
  const rectification = stack === "rectification" && baseChart
    ? { candidates: buildRectificationCandidates(baseChart.birth), summary: summarizeRectificationCandidates(buildRectificationCandidates(baseChart.birth)) }
    : undefined;
  const synastry = stack === "synastry" && baseChart && partnerChart ? calculateSynastry(baseChart, partnerChart) : undefined;
  const stackContext = stack === "kp"
    ? kpData
    : stack === "rectification"
      ? { candidateComparison: rectification, submittedEvents: input.events || "" }
      : stack === "synastry"
        ? { calculatedOverlays: synastry }
        : input.extraContext;
  return {
    stack,
    analysis: {
      stack,
      module: input.module,
      question: input.question,
      chart: stack === "prashna" ? prashnaChart : stack === "kp" ? undefined : baseChart,
      partnerChart,
      tajikaChart,
      events: input.events,
      extraContext: typeof stackContext === "string" ? stackContext : JSON.stringify(stackContext, null, 2),
      modelConfig: input.modelConfig,
    },
    previewChart: prashnaChart || tajikaChart || partnerChart || baseChart,
    rectification,
    synastry,
  };
}

export const appRouter = router({
  privacy: router({
    policy: publicProcedure.query(() => ({
      retention: "none" as const,
      statement: "本应用不创建账号、不写入数据库、S3、Cookie、本地存储或会话存储。输入仅在当前页面内存及本次计算请求中使用；刷新、关闭或离开页面后即丢弃。",
    })),
  }),
  chart: router({
    calculate: publicProcedure.input(birthSchema).mutation(({ input }) => {
      assertBirthInputConsistent(input);
      return calculateVedicChart(input);
    }),
  }),
  model: router({
    status: publicProcedure.query(() => ({ configured: Boolean(process.env.AGNES_API_KEY) })),
  }),
  location: router({
    mapConfig: publicProcedure.query(() => ({ jsApiKey: process.env.AMAP_JS_API_KEY || null })),
    geocode: publicProcedure.input(z.object({ address: z.string().trim().min(1).max(160) })).mutation(({ input }) => geocodeWithAmap(input.address)),
    reverseGeocode: publicProcedure.input(z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) })).mutation(({ input }) => reverseGeocodeWithAmap(input.latitude, input.longitude)),
    currentTimezone: publicProcedure.input(z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) })).mutation(({ input }) => {
      const timezone = tzLookup(input.latitude, input.longitude);
      return { timezone, timezoneOffset: currentTimezoneOffsetFor(timezone) };
    }),
    timezone: publicProcedure.input(z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), time: z.string().regex(/^\d{2}:\d{2}$/) })).mutation(({ input }) => {
      const timezone = tzLookup(input.latitude, input.longitude);
      return { timezone, timezoneOffset: timezoneOffsetFor(input.date, input.time, timezone) };
    }),
  }),
  report: router({
    run: publicProcedure.input(reportInputSchema).mutation(async ({ input }) => {
      const { stack, analysis, previewChart, rectification, synastry } = await prepareReportAnalysis(input);
      const resultMarkdown = await generateAnalysis(analysis);
      return {
        report: { id: temporaryId(), stack, title: moduleTitle(input.module), resultMarkdown, createdAt: new Date(), persistence: "memory-only" as const },
        previewChart,
        rectification,
        synastry,
      };
    }),
  }),
  kp: router({
    table: publicProcedure.query(() => buildKp249Table()),
  }),
  rectification: router({
    preview: publicProcedure.input(z.object({ birthInput: birthSchema })).query(({ input }) => {
      const chart = calculateVedicChart(input.birthInput);
      const candidates = buildRectificationCandidates(chart.birth);
      return { candidates, summary: summarizeRectificationCandidates(candidates) };
    }),
  }),
  synastry: router({
    preview: publicProcedure.input(z.object({ birthA: birthSchema, birthB: birthSchema })).mutation(({ input }) => {
      const chartA = calculateVedicChart(input.birthA);
      const chartB = calculateVedicChart(input.birthB);
      return { chartA, chartB, synastry: calculateSynastry(chartA, chartB) };
    }),
  }),
  document: router({
    ingest: publicProcedure.input(z.object({
      fileName: z.string().min(1).max(255),
      mimeType: documentMimeSchema,
      dataUrl: z.string().min(20).max(11_000_000),
      hasLinkedCalculation: z.boolean().default(false),
      modelConfig: modelConfigSchema,
    })).mutation(async ({ input }) => {
      const [header, encoded] = input.dataUrl.split(",", 2);
      if (!encoded || !header.includes("base64")) throw new TRPCError({ code: "BAD_REQUEST", message: "文件编码无效" });
      const byteLength = Buffer.from(encoded, "base64").length;
      if (byteLength > 7 * 1024 * 1024) throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "文件需小于 7MB" });
      const extraction = await extractChartDocument({ dataUrl: input.dataUrl, mimeType: input.mimeType, hasLinkedCalculation: input.hasLinkedCalculation, modelConfig: input.modelConfig });
      return {
        document: { id: temporaryId(), fileName: input.fileName, mimeType: input.mimeType, persistence: "memory-only" as const },
        report: { id: temporaryId(), stack: "document" as const, title: moduleTitle("reader"), resultMarkdown: extraction.markdown, createdAt: new Date(), persistence: "memory-only" as const },
      };
    }),
  }),
});

export type AppRouter = typeof appRouter;
