---
title: API 概览
description: Base URL、鉴权方式、支持的接口协议，以及错误响应的格式。
---

{{SYSTEM_NAME}} 在同一个地址下同时提供 OpenAI 兼容、Claude（Anthropic）原生和 Gemini 原生三套接口，使用同一个 API 密钥调用。

## Base URL

| 协议        | Base URL              | 说明                                                   |
| ----------- | --------------------- | ------------------------------------------------------ |
| OpenAI 兼容 | `{{BASE_URL}}/v1`     | 适用于绝大多数 SDK 和客户端                            |
| Claude 原生 | `{{BASE_URL}}`        | Anthropic SDK 和 Claude Code 会自动拼接 `/v1/messages` |
| Gemini 原生 | `{{BASE_URL}}/v1beta` | 用于 Google Gen AI SDK 或直接调用                      |

## 鉴权

所有接口都支持在请求头中携带：

```http
Authorization: Bearer YOUR_API_KEY
```

部分接口还兼容各厂商 SDK 的原生写法：

| 请求头 / 参数                                         | 适用接口                                          |
| ----------------------------------------------------- | ------------------------------------------------- |
| `x-api-key: YOUR_API_KEY`                             | Claude 接口 `/v1/messages`、模型列表 `/v1/models` |
| `x-goog-api-key: YOUR_API_KEY` 或 `?key=YOUR_API_KEY` | Gemini 接口 `/v1beta/models/...`、模型列表        |

:::warning
API 密钥只应保存在服务端或本地配置中，不要写进网页、小程序等前端代码，否则任何人都能看到并盗用。
:::

## 接口一览

| 分类        | 方法与路径                                          | 文档                                       |
| ----------- | --------------------------------------------------- | ------------------------------------------ |
| 对话        | `POST /v1/chat/completions`                         | [OpenAI 兼容接口](/docs/api/openai)        |
| Responses   | `POST /v1/responses`                                | [OpenAI 兼容接口](/docs/api/openai)        |
| 向量        | `POST /v1/embeddings`                               | [OpenAI 兼容接口](/docs/api/openai)        |
| 语音        | `POST /v1/audio/speech`、`/v1/audio/transcriptions` | [OpenAI 兼容接口](/docs/api/openai)        |
| 重排序      | `POST /v1/rerank`                                   | [OpenAI 兼容接口](/docs/api/openai)        |
| Claude 消息 | `POST /v1/messages`                                 | [Claude 接口](/docs/api/claude)            |
| Gemini      | `POST /v1beta/models/{model}:generateContent`       | [Gemini 接口](/docs/api/gemini)            |
| 图像        | `POST /v1/images/generations`、`/v1/images/edits`   | [图像生成](/docs/api/images)               |
| 模型列表    | `GET /v1/models`                                    | [模型与价格](/docs/api/models-and-pricing) |

能调用哪些模型取决于 API 密钥所在的分组，以 [模型广场](/pricing) 为准。

## 错误响应

请求失败时返回非 2xx 状态码，响应体为 JSON。OpenAI 兼容接口的格式如下：

```json
{
  "error": {
    "code": "",
    "message": "Invalid token (request id: 2026093010545547265...)",
    "type": "new_api_error"
  }
}
```

`message` 末尾的 request id 可以帮助站点管理员快速定位问题，反馈时请一并提供。

常见状态码：

| 状态码 | 含义                                                   |
| ------ | ------------------------------------------------------ |
| 400    | 请求参数有误，例如没有填写模型名                       |
| 401    | 没有携带密钥，或密钥无效、已过期、已禁用               |
| 403    | 余额不足，或无权使用该分组 / 模型                      |
| 429    | 请求过于频繁，请稍后重试（可参考响应头 `Retry-After`） |
| 503    | 该分组下暂时没有可用的线路                             |

每种错误的具体原因和处理方法见 [常见错误](/docs/faq/errors)。
