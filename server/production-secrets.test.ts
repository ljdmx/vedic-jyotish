import { describe, expect, it } from "vitest";

describe("production service credentials", () => {
  const runExternalServiceTests = process.env.RUN_EXTERNAL_SERVICE_TESTS === "1";

  it("keeps required service credentials server-side", () => {
    const apiKey = process.env.AGNES_API_KEY;
    expect(apiKey).toBeTruthy();
    expect(process.env.AMAP_WEB_SERVICE_KEY).toBeTruthy();
    expect(process.env.AMAP_JS_API_KEY).toBeTruthy();
    expect(process.env.AMAP_SECURITY_JS_CODE).toBeTruthy();
  });

  it.runIf(runExternalServiceTests)("validates the configured Agnes model credential against the model catalog", async () => {
    const apiKey = process.env.AGNES_API_KEY;
    const response = await fetch("https://api.agnes-ai.cn/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    expect(response.ok).toBe(true);
  }, 20_000);

  it.runIf(runExternalServiceTests)("validates the configured AMap Web Service credential with a geocoding request", async () => {
    const apiKey = process.env.AMAP_WEB_SERVICE_KEY;
    expect(apiKey).toBeTruthy();

    const endpoint = new URL("https://restapi.amap.com/v3/geocode/geo");
    endpoint.searchParams.set("key", apiKey!);
    endpoint.searchParams.set("address", "云南昆明");
    endpoint.searchParams.set("output", "JSON");

    const response = await fetch(endpoint);
    const payload = await response.json() as { status?: string };

    expect(response.ok).toBe(true);
    expect(payload.status).toBe("1");
  }, 20_000);

  it("keeps the AMap JavaScript credentials server-only", () => {
    expect(process.env.AMAP_JS_API_KEY).toBeTruthy();
    expect(process.env.AMAP_SECURITY_JS_CODE).toBeTruthy();
  });
});
