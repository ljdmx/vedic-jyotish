import { describe, expect, it } from "vitest";
import { resolveAmapContentType } from "./amapProxy";

describe("高德同源代理响应类型", () => {
  it("为 JSONP 请求返回可执行的 JavaScript MIME 类型", () => {
    const url = new URL("https://restapi.amap.com/v3/log/init?callback=jsonp_1");
    expect(resolveAmapContentType("application/octet-stream", url)).toBe("application/javascript; charset=utf-8");
  });

  it("保留非 JSONP 请求的上游响应类型", () => {
    const url = new URL("https://restapi.amap.com/v3/geocode/geo");
    expect(resolveAmapContentType("application/json; charset=utf-8", url)).toBe("application/json; charset=utf-8");
  });
});
