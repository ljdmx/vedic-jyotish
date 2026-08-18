import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({
  generateAnalysis: vi.fn(),
  extractChartDocument: vi.fn(),
}));

vi.mock("./vedic", async importOriginal => {
  const actual = await importOriginal<typeof import("./vedic")>();
  return { ...actual, generateAnalysis: mocks.generateAnalysis, extractChartDocument: mocks.extractChartDocument };
});

import { appRouter } from "./routers";

const birth = { name: "Route Test", date: "1990-08-15", time: "10:30", place: "Shanghai", latitude: 31.2304, longitude: 121.4737, timezoneOffset: 540, timeAccuracy: "精确到分钟", timeSource: "出生证明 / 医院记录", timeBasis: "wall_clock" as const };
const prashnaLocation = { name: "Prashna", place: "Shanghai", latitude: 31.2304, longitude: 121.4737, timezoneOffset: 480, timeAccuracy: "当前起盘" };

function context(): TrpcContext {
  return { user: null, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

describe("vedic tRPC temporary-session routes", () => {
  beforeEach(() => {
    mocks.generateAnalysis.mockReset().mockResolvedValue("## 临时解读\n\n仅供本次会话查看。");
    mocks.extractChartDocument.mockReset().mockResolvedValue({ summary: "待确认", birthFields: [], chartFields: [], missingFields: ["出生时间"], sourcePriority: { original: "仅本次", extractedFields: "待确认", canonicalRule: "重算优先", confidence: "待确认" }, markdown: "## 盘面资料提取\n\n待确认" });
  });

  it("declares an account-free and retention-free privacy policy", async () => {
    const policy = await appRouter.createCaller(context()).privacy.policy();
    expect(policy.retention).toBe("none");
    expect(policy.statement).toContain("不创建账号");
    expect(policy.statement).toContain("不写入数据库");
  });

  it("exposes only default model availability and never a model secret", async () => {
    const originalKey = process.env.AGNES_API_KEY;
    delete process.env.AGNES_API_KEY;
    try {
      await expect(appRouter.createCaller(context()).model.status()).resolves.toEqual({ configured: false });
    } finally {
      if (originalKey === undefined) delete process.env.AGNES_API_KEY;
      else process.env.AGNES_API_KEY = originalKey;
    }
  });

  it("calculates a natal chart without an authenticated user and preserves Graha Drishti", async () => {
    const chart = await appRouter.createCaller(context()).chart.calculate(birth);
    expect(chart.chartType).toBe("natal");
    expect(chart.planets).toHaveLength(9);
    expect(chart.grahaDrishti.some(item => item.sourcePlanet === "Saturn")).toBe(true);
  });

  it("拒绝无效日历日期与和地点历史偏移不一致的出生输入", async () => {
    const caller = appRouter.createCaller(context());
    await expect(caller.chart.calculate({ ...birth, date: "1990-02-30" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.chart.calculate({ ...birth, timezoneOffset: 480 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("resolves a timezone and historical offset from geographic coordinates without a user session", async () => {
    const result = await appRouter.createCaller(context()).location.timezone({ latitude: 31.2304, longitude: 121.4737, date: "1990-08-15", time: "10:30" });
    expect(result.timezone).toBe("Asia/Shanghai");
    expect(result.timezoneOffset).toBe(540);
  });

  it("resolves 1995 Kunming to China Standard Time without daylight saving", async () => {
    const result = await appRouter.createCaller(context()).location.timezone({ latitude: 25.243, longitude: 103.124, date: "1995-02-09", time: "14:04" });
    expect(result.timezone).toBe("Asia/Shanghai");
    expect(result.timezoneOffset).toBe(480);
  });

  it("resolves the current timezone offset for an independently located Prashna chart", async () => {
    const result = await appRouter.createCaller(context()).location.currentTimezone({ latitude: 24.8815, longitude: 102.8337 });
    expect(result.timezone).toBe("Asia/Shanghai");
    expect(result.timezoneOffset).toBe(480);
  });

  it("geocodes a birth place through the server-side AMap Web Service", async () => {
    const originalKey = process.env.AMAP_WEB_SERVICE_KEY;
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "1", info: "OK", geocodes: [{ formatted_address: "云南省昆明市", location: "102.8329,24.8801", level: "市" }] }) });
    process.env.AMAP_WEB_SERVICE_KEY = "test-amap-key";
    vi.stubGlobal("fetch", fetchMock);
    try {
      const result = await appRouter.createCaller(context()).location.geocode({ address: "云南昆明" });
      expect(result).toEqual({ formatted: "云南省昆明市", latitude: 24.8801, longitude: 102.8329, matchLevel: "市" });
      const endpoint = new URL(String(fetchMock.mock.calls[0]?.[0]));
      expect(endpoint.origin + endpoint.pathname).toBe("https://restapi.amap.com/v3/geocode/geo");
      expect(endpoint.searchParams.get("address")).toBe("云南昆明");
      expect(endpoint.searchParams.get("key")).toBe("test-amap-key");
    } finally {
      if (originalKey === undefined) delete process.env.AMAP_WEB_SERVICE_KEY;
      else process.env.AMAP_WEB_SERVICE_KEY = originalKey;
      vi.stubGlobal("fetch", originalFetch);
    }
  });

  it("returns only the public AMap JS key required to load the interactive map", async () => {
    const originalKey = process.env.AMAP_JS_API_KEY;
    process.env.AMAP_JS_API_KEY = "public-js-key";
    try {
      await expect(appRouter.createCaller(context()).location.mapConfig()).resolves.toEqual({ jsApiKey: "public-js-key" });
    } finally {
      if (originalKey === undefined) delete process.env.AMAP_JS_API_KEY;
      else process.env.AMAP_JS_API_KEY = originalKey;
    }
  });

  it("reverse geocodes a picked map coordinate through the server-side AMap Web Service", async () => {
    const originalKey = process.env.AMAP_WEB_SERVICE_KEY;
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "1", info: "OK", regeocode: { formatted_address: "云南省大理白族自治州大理市下关街道" } }) });
    process.env.AMAP_WEB_SERVICE_KEY = "test-amap-key";
    vi.stubGlobal("fetch", fetchMock);
    try {
      const result = await appRouter.createCaller(context()).location.reverseGeocode({ latitude: 25.6785, longitude: 100.3016 });
      expect(result).toEqual({ formatted: "云南省大理白族自治州大理市下关街道", latitude: 25.6785, longitude: 100.3016 });
      const endpoint = new URL(String(fetchMock.mock.calls[0]?.[0]));
      expect(endpoint.origin + endpoint.pathname).toBe("https://restapi.amap.com/v3/geocode/regeo");
      expect(endpoint.searchParams.get("location")).toBe("100.3016,25.6785");
      expect(endpoint.searchParams.get("key")).toBe("test-amap-key");
    } finally {
      if (originalKey === undefined) delete process.env.AMAP_WEB_SERVICE_KEY;
      else process.env.AMAP_WEB_SERVICE_KEY = originalKey;
      vi.stubGlobal("fetch", originalFetch);
    }
  });

  it("runs a natal report from the supplied in-memory chart input and returns an ephemeral report", async () => {
    const result = await appRouter.createCaller(context()).report.run({ stack: "natal", module: "p1p12", chartInput: birth, question: "我想先了解事业与关系的牵动。" });
    expect(mocks.generateAnalysis).toHaveBeenCalledWith(expect.objectContaining({ stack: "natal", module: "p1p12", chart: expect.objectContaining({ grahaDrishti: expect.any(Array) }) }));
    expect(result.report.id).toBeLessThan(0);
    expect(result.report.persistence).toBe("memory-only");
    expect(result.report.resultMarkdown).toContain("临时解读");
  });

  it("passes a source file only as the current request data URL and returns no storage reference", async () => {
    const result = await appRouter.createCaller(context()).document.ingest({ fileName: "chart.png", mimeType: "image/png", dataUrl: "data:image/png;base64,aGVsbG8=", hasLinkedCalculation: false });
    expect(mocks.extractChartDocument).toHaveBeenCalledWith(expect.objectContaining({ dataUrl: "data:image/png;base64,aGVsbG8=", mimeType: "image/png", hasLinkedCalculation: false }));
    expect(result.document).toMatchObject({ fileName: "chart.png", persistence: "memory-only" });
    expect(result.document).not.toHaveProperty("storageKey");
    expect(result.report).toMatchObject({ persistence: "memory-only" });
  });

  it("keeps KP independent, requiring an explicit 1–249 number and not a natal chart", async () => {
    const caller = appRouter.createCaller(context());
    await expect(caller.report.run({ stack: "kp", module: "kp", question: "这个合作能否形成明确的书面协议？" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const result = await caller.report.run({ stack: "kp", module: "kp", kpNumber: 12, question: "这个合作能否形成明确的书面协议？" });
    expect(mocks.generateAnalysis).toHaveBeenCalledWith(expect.objectContaining({ stack: "kp", chart: undefined, extraContext: expect.stringContaining("horaryNumber") }));
    expect(result.previewChart).toBeUndefined();
    expect(result.report.persistence).toBe("memory-only");
  });

  it("keeps Prashna independent from a natal chart and rejects an underspecified question", async () => {
    const caller = appRouter.createCaller(context());
    await expect(caller.report.run({ stack: "prashna", module: "prashna", question: "短问", prashnaLocation })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const result = await caller.report.run({ stack: "prashna", module: "prashna", question: "我是否应在本月完成这份已经准备好的申请材料？", prashnaLocation });
    expect(mocks.generateAnalysis).toHaveBeenCalledWith(expect.objectContaining({ stack: "prashna", chart: expect.objectContaining({ chartType: "prashna" }), partnerChart: undefined }));
    expect(result.previewChart).toMatchObject({ chartType: "prashna" });
  });

  it("requires five independent events for rectification and returns candidate comparison only for this request", async () => {
    const caller = appRouter.createCaller(context());
    await expect(caller.report.run({ stack: "rectification", module: "rectification", chartInput: birth, events: "2020-01｜搬家\n2022-01｜换工作" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const result = await caller.report.run({ stack: "rectification", module: "rectification", chartInput: birth, events: "2011-06｜毕业｜日期精度：月\n2013-09｜入职｜日期精度：月\n2016-03｜迁居｜日期精度：月\n2019-06｜转岗｜日期精度：月\n2022-11｜结束关系｜日期精度：月" });
    expect(result.rectification?.candidates).toHaveLength(5);
    expect(result.report.persistence).toBe("memory-only");
  });

  it("builds directional whole-sign synastry with Graha Drishti and no account record", async () => {
    const result = await appRouter.createCaller(context()).synastry.preview({ birthA: birth, birthB: { ...birth, name: "Partner", date: "1992-03-04", time: "16:20", place: "Delhi", latitude: 28.6139, longitude: 77.209, timezoneOffset: 330 } });
    expect(result.synastry.methodology).toContain("整宫");
    expect(result.synastry.drishti.length).toBeGreaterThan(0);
    expect(result.chartA.chartType).toBe("natal");
  });

  it("keeps Tajika dependent on the supplied natal input and returns a temporary annual overlay", async () => {
    const result = await appRouter.createCaller(context()).report.run({ stack: "tajika", module: "tajika", chartInput: birth, year: 2026 });
    expect(mocks.generateAnalysis).toHaveBeenCalledWith(expect.objectContaining({ stack: "tajika", chart: expect.objectContaining({ chartType: "natal" }), tajikaChart: expect.objectContaining({ chartType: "tajika" }) }));
    expect(result.previewChart).toMatchObject({ chartType: "tajika" });
  });
});
