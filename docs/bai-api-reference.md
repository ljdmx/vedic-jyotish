# Bai Chat Completions 接入依据

本项目的 Bai 适配基于 [B.AI API Reference](https://docs.b.ai/llmservice/api/)（2026-08-18 查阅）。该文档将 Chat Completions 标记为 OpenAI 兼容接口，支持 `Authorization: Bearer <token>` 鉴权、`/v1/chat/completions` 端点、`model`、`messages` 与 `stream` 请求字段。

非流式响应从 `choices[].message.content` 读取正文。启用 `stream: true` 后，服务以 SSE 发送 `chat.completion.chunk`，增量正文位于 `choices[].delta.content`；结束分块携带 `finish_reason` 与用量信息。应用复用现有 OpenAI 兼容解析器，并保留客户端断开时向上游取消的传播。

| 项目 | 本项目适配值 |
| --- | --- |
| Base URL | `https://api.b.ai/v1` |
| Chat endpoint | `/chat/completions` |
| 默认模型 | `gpt-5.2` |
| 密钥边界 | 用户临时密钥仅随本次请求经服务端转发，不写入前端源码或浏览器存储 |
| 流式处理 | `stream: true`、SSE `data:` 分块、`choices[].delta.content` 增量 |
