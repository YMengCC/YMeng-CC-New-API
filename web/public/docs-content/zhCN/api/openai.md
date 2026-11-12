---
title: OpenAI 兼容接口
description: Chat Completions、Responses、Embeddings、语音与重排序接口的调用示例。
---

OpenAI 兼容接口的 Base URL 为 `{{BASE_URL}}/v1`。官方 OpenAI SDK 以及任何支持自定义 Base URL 的工具都可以直接使用。

## Chat Completions

`POST /v1/chat/completions`

```bash
curl {{BASE_URL}}/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [
      { "role": "system", "content": "你是一个乐于助人的助手。" },
      { "role": "user", "content": "用一句话介绍你自己" }
    ]
  }'
```

需要流式输出时，在请求体中加上 `"stream": true`，响应会以 Server-Sent Events 的形式逐段返回。

## 使用官方 SDK

Python：

```python
from openai import OpenAI

client = OpenAI(
    base_url="{{BASE_URL}}/v1",
    api_key="YOUR_API_KEY",
)

response = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "你好"}],
)
print(response.choices[0].message.content)
```

Node.js：

```javascript
import OpenAI from 'openai'

const client = new OpenAI({
  baseURL: '{{BASE_URL}}/v1',
  apiKey: process.env.API_KEY,
})

const response = await client.chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [{ role: 'user', content: '你好' }],
})
console.log(response.choices[0].message.content)
```

## Responses

`POST /v1/responses`

```bash
curl {{BASE_URL}}/v1/responses \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4.1",
    "input": "用三句话解释什么是 API 网关"
  }'
```

:::info
是否支持 Responses 接口取决于模型本身。如果某个模型返回不支持，请改用 Chat Completions。
:::

## Embeddings

`POST /v1/embeddings`

```bash
curl {{BASE_URL}}/v1/embeddings \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "text-embedding-3-small",
    "input": "需要向量化的文本"
  }'
```

## 语音

| 用途           | 方法与路径                      |
| -------------- | ------------------------------- |
| 文字转语音     | `POST /v1/audio/speech`         |
| 语音转文字     | `POST /v1/audio/transcriptions` |
| 语音翻译为英文 | `POST /v1/audio/translations`   |

请求格式与 OpenAI 官方接口一致，语音转文字需以 `multipart/form-data` 上传音频文件。

## 其他接口

| 用途         | 方法与路径             |
| ------------ | ---------------------- |
| 重排序       | `POST /v1/rerank`      |
| 内容审核     | `POST /v1/moderations` |
| 旧版文本补全 | `POST /v1/completions` |

文中出现的模型名称仅为示例，实际可用的模型以 [模型广场](/pricing) 为准。
