---
title: OpenAI 互換インターフェース
description: Chat Completions、Responses、Embeddings、音声、リランクの各インターフェースの呼び出し例。
---

OpenAI 互換インターフェースの Base URL は `{{BASE_URL}}/v1` です。OpenAI 公式 SDK や、カスタム Base URL に対応したあらゆるツールでそのまま使用できます。

## Chat Completions

`POST /v1/chat/completions`

```bash
curl {{BASE_URL}}/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [
      { "role": "system", "content": "あなたは親切なアシスタントです。" },
      { "role": "user", "content": "一言で自己紹介してください" }
    ]
  }'
```

ストリーミング出力が必要な場合は、リクエストボディに `"stream": true` を追加します。レスポンスは Server-Sent Events 形式で順次返されます。

## 公式 SDK を使う

Python：

```python
from openai import OpenAI

client = OpenAI(
    base_url="{{BASE_URL}}/v1",
    api_key="YOUR_API_KEY",
)

response = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "こんにちは"}],
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
  messages: [{ role: 'user', content: 'こんにちは' }],
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
    "input": "API ゲートウェイとは何かを 3 文で説明してください"
  }'
```

:::info
Responses インターフェースに対応しているかどうかはモデル自体によって異なります。あるモデルで非対応と返された場合は、Chat Completions を使用してください。
:::

## Embeddings

`POST /v1/embeddings`

```bash
curl {{BASE_URL}}/v1/embeddings \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "text-embedding-3-small",
    "input": "ベクトル化したいテキスト"
  }'
```

## 音声

| 用途             | メソッドとパス                  |
| ---------------- | ------------------------------- |
| テキスト読み上げ | `POST /v1/audio/speech`         |
| 音声の文字起こし | `POST /v1/audio/transcriptions` |
| 音声を英語に翻訳 | `POST /v1/audio/translations`   |

リクエスト形式は OpenAI 公式のインターフェースと同じです。音声の文字起こしでは、`multipart/form-data` で音声ファイルをアップロードする必要があります。

## その他のインターフェース

| 用途                     | メソッドとパス         |
| ------------------------ | ---------------------- |
| リランク                 | `POST /v1/rerank`      |
| コンテンツモデレーション | `POST /v1/moderations` |
| 旧版テキスト補完         | `POST /v1/completions` |

本文中のモデル名は例にすぎません。実際に利用できるモデルは [モデル広場](/pricing) に従ってください。
