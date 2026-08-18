/**
 * 高德 JS API 的 JSONP 诊断与日志端点会以 <script> 方式加载。
 * 即使上游漏传或使用非脚本 MIME，含 callback 的响应也必须按 JavaScript 返回。
 */
export function resolveAmapContentType(upstreamType: string | null, requestUrl: URL) {
  if (requestUrl.searchParams.has("callback")) {
    return "application/javascript; charset=utf-8";
  }
  return upstreamType || "application/json; charset=utf-8";
}
