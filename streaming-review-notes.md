# 流式接口评估记录

| 供应商 | 已核对的官方要点 | 对当前适配器的初步含义 |
| --- | --- | --- |
| DeepSeek | Chat Completions 文档说明 `stream=true` 会发送仅含 `data:` 的 SSE 增量，并以 `data: [DONE]` 结束；文档同时提示流式网络错误可能在 `[DONE]` 前中断。 | 当前数据行、分块缓冲和 `[DONE]` 解析与基础文本流匹配，但无断线恢复、续传或供应商级集成验证，不能承诺零问题。 |
| Kimi | 官方流式指南规定每块以 `data:` 开头、以 `\n\n` 分隔，完成必须以 `data: [DONE]` 判定；`delta.content` 分块到达，`usage` 仅位于末块，且不同模型参数存在差异。 | 当前分块和文本增量解析匹配，但把接收端连接自然结束直接视为成功，未明确强制检查已收到 `[DONE]`，因此不能保证所有网络中断都会被标记为不完整。 |
| Qwen | 官方流式专题规定每个事件为 JSON `data:` chunk，以 `data: [DONE]` 结束；`stream_options.include_usage` 时末块仅含用量；思考模式会先出现 `delta.reasoning_content`，再出现 `delta.content`。 | 当前文本输出能处理 `delta.content` 与 `[DONE]`，但会忽略思考内容、工具调用增量与用量，并缺乏终止事件强制校验和供应商级实测。 |
| GLM | 标准 GLM 流式文档给出 `https://open.bigmodel.cn/api/paas/v4/chat/completions`，SSE 以 `data: [DONE]` 结束，正文为 `choices[0].delta.content`，思考为 `reasoning_content`，末块才有完成原因与用量。 | 当前 `https://open.bigmodel.cn/api/paas/v4` Base URL 与标准 Chat Completion 文档一致；但 Coding Plan 的专用端点及其凭据不可直接替换，并且当前适配器未渲染 reasoning 内容或验证真实凭据。 |
| AIAPI.world | 用户提供的起步页在当前访问环境未返回可用协议正文，无法从该页验证其上游模型、事件字段、转发缓冲或断线语义。 | 中转层引入独立的可用性、模型映射及协议透传风险；不可据现有材料保证流式稳定性。 |
