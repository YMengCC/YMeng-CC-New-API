---
title: Claude 介面
description: 以 Anthropic Messages 原生格式呼叫 Claude 模型。
---

{{SYSTEM_NAME}} 支援 Anthropic 原生的 Messages 介面。已有基於 Anthropic SDK 的程式碼，只需替換 Base URL 和金鑰即可。

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
    "messages": [{ "role": "user", "content": "你好，Claude" }]
  }'
```

驗證可以使用 `x-api-key`，也可以使用 `Authorization: Bearer YOUR_API_KEY`。需要串流輸出時，在請求內容中加上 `"stream": true`。

## 使用 Anthropic SDK

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
    messages=[{"role": "user", "content": "你好，Claude"}],
)
print(message.content[0].text)
```

:::danger Base URL 不要帶 /v1
Anthropic SDK 會自動拼接 `/v1/messages`，`base_url` 只填 `{{BASE_URL}}`。
:::

## 注意事項

- `max_tokens` 為必填參數，這是 Anthropic 介面本身的要求。
- 暫不支援 `POST /v1/messages/count_tokens`。
- 也可以用 [OpenAI 相容介面](/docs/api/openai) 呼叫 Claude 模型，只需把 `model` 換成 Claude 的模型名稱。

文中出現的模型名稱僅為範例，實際可用的模型以 [模型廣場](/pricing) 為準。
