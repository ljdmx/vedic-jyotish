import { describe, expect, it } from "vitest";

describe("Agnes 默认模型凭据", () => {
  it("能通过服务端读取模型目录", async () => {
    const apiKey = process.env.AGNES_API_KEY;
    expect(apiKey, "AGNES_API_KEY 必须仅存在于服务端部署环境").toBeTruthy();

    const response = await fetch("https://api.agnes-ai.cn/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(12_000),
    });

    expect(response.ok, `Agnes 模型目录校验失败：HTTP ${response.status}`).toBe(true);
  }, 15_000);
});
