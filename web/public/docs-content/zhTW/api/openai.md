---
title: OpenAI 相容介面
description: Chat Completions、Responses、Embeddings、語音與重新排序介面的呼叫範例。
---

OpenAI 相容介面的 Base URL 為 `{{BASE_URL}}/v1`。官方 OpenAI SDK 以及任何支援自訂 Base URL 的工具都可以直接使用。

## Chat Completions

`POST /v1/chat/completions`

```bash
curl {{BASE_URL}}/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [
      { "role": "system", "content": "你是一個樂於助人的助理。" },
      { "role": "user", "content": "用一句話介紹你自己" }
    ]
  }'
```

需要串流輸出時，在請求內容中加上 `"stream": true`，回應會以 Server-Sent Events 的形式逐段回傳。

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
    "input": "用三句話解釋什麼是 API 閘道"
  }'
```

:::info
是否支援 Responses 介面取決於模型本身。如果某個模型回傳不支援，請改用 Chat Completions。
:::

## Embeddings

`POST /v1/embeddings`

```bash
curl {{BASE_URL}}/v1/embeddings \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "text-embedding-3-small",
    "input": "需要向量化的文字"
  }'
```

## 語音

| 用途           | 方法與路徑                      |
| -------------- | ------------------------------- |
| 文字轉語音     | `POST /v1/audio/speech`         |
| 語音轉文字     | `POST /v1/audio/transcriptions` |
| 語音翻譯為英文 | `POST /v1/audio/translations`   |

請求格式與 OpenAI 官方介面一致，語音轉文字需以 `multipart/form-data` 上傳音訊檔案。

## 其他介面

| 用途         | 方法與路徑             |
| ------------ | ---------------------- |
| 重新排序     | `POST /v1/rerank`      |
| 內容審核     | `POST /v1/moderations` |
| 舊版文字補全 | `POST /v1/completions` |

文中出現的模型名稱僅為範例，實際可用的模型以 [模型廣場](/pricing) 為準。
