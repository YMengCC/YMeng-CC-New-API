---
title: Claude インターフェース
description: Anthropic Messages のネイティブ形式で Claude モデルを呼び出します。
---

{{SYSTEM_NAME}} は Anthropic ネイティブの Messages インターフェースに対応しています。Anthropic SDK を使った既存のコードは、Base URL とキーを置き換えるだけで利用できます。

## Messages

`POST /v1/messages`

```bash
curl {{BASE_URL}}/v1/messages \
  -H "x-api-key: YOUR_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-5",
    "max_tokens": 1024,
    "messages": [{ "role": "user", "content": "こんにちは、Claude" }]
  }'
```

認証には `x-api-key` のほか、`Authorization: Bearer YOUR_API_KEY` も使用できます。ストリーミング出力が必要な場合は、リクエストボディに `"stream": true` を追加します。

## Anthropic SDK を使う

Python：

```python
import anthropic

client = anthropic.Anthropic(
    base_url="{{BASE_URL}}",
    api_key="YOUR_API_KEY",
)

message = client.messages.create(
    model="claude-sonnet-5",
    max_tokens=1024,
    messages=[{"role": "user", "content": "こんにちは、Claude"}],
)
print(message.content[0].text)
```

:::danger Base URL に /v1 を付けないでください
Anthropic SDK は自動で `/v1/messages` を付け加えるため、`base_url` には `{{BASE_URL}}` のみを指定してください。
:::

## 注意事項

- `max_tokens` は必須パラメーターです。これは Anthropic のインターフェース自体の要件です。
- `POST /v1/messages/count_tokens` には現在対応していません。
- [OpenAI 互換インターフェース](/docs/api/openai) から Claude モデルを呼び出すこともできます。`model` を Claude のモデル名に変えるだけです。

本文中のモデル名は例にすぎません。実際に利用できるモデルは [モデル広場](/pricing) に従ってください。
