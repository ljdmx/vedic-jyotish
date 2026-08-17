export const MODEL_PROVIDERS = {
  agnes: { label: "Agnes AI（默认）", baseUrl: "https://api.agnes-ai.cn/v1", defaultModel: "agnes-2.5-flash", requiresUserKey: false },
  deepseek: { label: "DeepSeek", baseUrl: "https://api.deepseek.com", defaultModel: "deepseek-v4-flash", requiresUserKey: true },
  kimi: { label: "Kimi", baseUrl: "https://api.moonshot.cn/v1", defaultModel: "kimi-k3", requiresUserKey: true },
  qwen: { label: "千问 Qwen", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", defaultModel: "qwen3.8-max", requiresUserKey: true },
  glm: { label: "智谱 GLM", baseUrl: "https://open.bigmodel.cn/api/paas/v4", defaultModel: "glm-5.2", requiresUserKey: true },
  aiapi: { label: "AIAPI.world（兼容中转）", baseUrl: "https://aiapi.world/v1", defaultModel: "", requiresUserKey: true },
} as const;

export type ModelProviderId = keyof typeof MODEL_PROVIDERS;
export type TemporaryModelConfig = {
  provider: ModelProviderId;
  model?: string;
  apiKey?: string;
};

export const DEFAULT_MODEL_CONFIG: Required<Pick<TemporaryModelConfig, "provider" | "model">> = {
  provider: "agnes",
  model: MODEL_PROVIDERS.agnes.defaultModel,
};

export function providerInfo(provider: ModelProviderId) {
  return MODEL_PROVIDERS[provider];
}
