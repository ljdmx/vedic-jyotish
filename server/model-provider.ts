import { MODEL_PROVIDERS, type ModelProviderId, type TemporaryModelConfig } from "../shared/model-config";

type CompatibleMessage = { role: "system" | "user" | "assistant"; content: unknown };
type CompatibleRequest = {
  selection?: TemporaryModelConfig;
  messages: CompatibleMessage[];
  maxTokens?: number;
  responseFormat?: unknown;
  signal?: AbortSignal;
};
type CompatibleTextPart = { type?: unknown; text?: unknown; content?: unknown };
type CompatibleContent = string | CompatibleTextPart[];
type CompatibleStreamChoice = { message?: { content?: CompatibleContent }; delta?: { content?: CompatibleContent }; finish_reason?: string | null };
export type CompatibleResponse = { choices?: Array<CompatibleStreamChoice> };

const PROVIDER_IDS = new Set(Object.keys(MODEL_PROVIDERS));
const TRUSTED_BASE_URLS = new Set(Object.values(MODEL_PROVIDERS).map((provider) => provider.baseUrl));
const forbiddenHosts = new Set(["localhost", "0.0.0.0", "127.0.0.1", "::1"]);

function isPrivateHost(hostname: string) {
  const host = hostname.toLowerCase();
  if (forbiddenHosts.has(host) || host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (/^10\./.test(host) || /^127\./.test(host) || /^169\.254\./.test(host) || /^192\.168\./.test(host)) return true;
  const match = host.match(/^172\.(\d+)\./);
  return Boolean(match && Number(match[1]) >= 16 && Number(match[1]) <= 31);
}

function normalizeBaseUrl(value: string) {
  const parsed = new URL(value.trim());
  if (parsed.protocol !== "https:" || isPrivateHost(parsed.hostname)) throw new Error("模型接口地址必须是公开的 HTTPS 地址");
  return parsed.toString().replace(/\/+$/, "");
}

export function resolveModelSelection(input?: TemporaryModelConfig) {
  const provider = (input?.provider || "agnes") as ModelProviderId;
  if (!PROVIDER_IDS.has(provider)) throw new Error("不支持的模型供应商");
  const info = MODEL_PROVIDERS[provider];
  const baseUrl = normalizeBaseUrl(info.baseUrl);
  if (!TRUSTED_BASE_URLS.has(info.baseUrl)) throw new Error("模型接口地址不在可信端点列表中");
  const model = input?.model?.trim() || info.defaultModel;
  if (!model) throw new Error("请填写模型名称");
  const apiKey = provider === "agnes" ? process.env.AGNES_API_KEY : input?.apiKey?.trim();
  if (!apiKey) throw new Error(provider === "agnes" ? "默认 Agnes 模型尚未完成部署配置" : "请填写当前会话使用的 API Key");
  return { provider, label: info.label, baseUrl, model, apiKey };
}

export function extractCompatibleText(response: CompatibleResponse) {
  const content = response.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";

  return content
    .map(part => {
      if (!part || typeof part !== "object") return "";
      if (typeof part.text === "string") return part.text;
      if (typeof part.content === "string") return part.content;
      return "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

export async function invokeCompatibleModel(request: CompatibleRequest): Promise<CompatibleResponse> {
  const selection = resolveModelSelection(request.selection);
  const response = await fetch(`${selection.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${selection.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: selection.model,
      messages: request.messages,
      ...(request.maxTokens ? { max_tokens: request.maxTokens } : {}),
      ...(request.responseFormat ? { response_format: request.responseFormat } : {}),
      stream: false,
    }),
    signal: AbortSignal.timeout(55_000),
  });
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "模型密钥无效或没有调用权限" : `模型服务暂不可用（HTTP ${response.status}）`);
  return await response.json() as CompatibleResponse;
}

/** 模型流式响应的空闲超时：长时间无新数据视为连接卡死。 */
const STREAM_IDLE_TIMEOUT_MS = 30_000;

/**
 * 把累积的 SSE 文本按 `\n\n` 事件块切分，返回完整事件中的 `data:` 负载与剩余缓冲。
 * OpenAI 兼容接口每个事件为单行 `data: {json}` 或 `data: [DONE]`。
 */
export function extractSseEvents(accumulated: string): { remaining: string; events: string[] } {
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

function extractDeltaText(delta: unknown): string {
  if (!delta || typeof delta !== "object") return "";
  const content = (delta as { content?: unknown }).content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map(part => {
      if (typeof part === "string") return part;
      if (!part || typeof part !== "object") return "";
      const record = part as CompatibleTextPart;
      if (typeof record.text === "string") return record.text;
      if (typeof record.content === "string") return record.content;
      return "";
    })
    .join("");
}

/**
 * 以 `stream: true` 调用兼容模型，逐块 yield 增量正文。
 * 兼容内容为字符串或分段数组两种形态；空增量与 `[DONE]` 直接跳过。
 * 空闲超过 STREAM_IDLE_TIMEOUT_MS 会中止连接，避免长报告生成时被 55s 总超时误杀。
 */
export async function* streamCompatibleModel(request: CompatibleRequest): AsyncGenerator<string> {
  const selection = resolveModelSelection(request.selection);
  const controller = new AbortController();
  const cancelUpstream = () => controller.abort();
  if (request.signal?.aborted) cancelUpstream();
  else request.signal?.addEventListener("abort", cancelUpstream, { once: true });
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let sawDone = false;
  const armIdle = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => controller.abort(new Error("模型流式响应超时")), STREAM_IDLE_TIMEOUT_MS);
  };
  armIdle();
  try {
    if (controller.signal.aborted) throw new Error("模型流请求已取消");
    const response = await fetch(`${selection.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${selection.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: selection.model,
        messages: request.messages,
        ...(request.maxTokens ? { max_tokens: request.maxTokens } : {}),
        ...(request.responseFormat ? { response_format: request.responseFormat } : {}),
        stream: true,
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "模型密钥无效或没有调用权限" : `模型服务暂不可用（HTTP ${response.status}）`);
    if (!response.body) throw new Error("模型服务未返回流式响应");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) buffer += decoder.decode();
      else {
        armIdle();
        buffer += decoder.decode(value, { stream: true });
      }
      // 兼容少数网关关闭连接前遗漏末尾空行的情况，仍应消费已接收的终态块。
      const { remaining, events } = extractSseEvents(done ? `${buffer}\n\n` : buffer);
      buffer = done ? "" : remaining;
      for (const raw of events) {
        if (!raw) continue;
        if (raw === "[DONE]") {
          sawDone = true;
          return;
        }
        let parsed: CompatibleResponse;
        try {
          parsed = JSON.parse(raw) as CompatibleResponse;
        } catch {
          continue;
        }
        const text = extractDeltaText(parsed.choices?.[0]?.delta);
        if (text) yield text;
      }
      if (done) break;
    }
    if (!sawDone) throw new Error("模型流在完成标记前中断");
  } finally {
    if (idleTimer) clearTimeout(idleTimer);
    request.signal?.removeEventListener("abort", cancelUpstream);
  }
}
