---
title: Claude 接口
description: 以 Anthropic Messages 原生格式调用 Claude 模型。
---

{{SYSTEM_NAME}} 支持 Anthropic 原生的 Messages 接口。已有基于 Anthropic SDK 的代码，只需替换 Base URL 和密钥即可。

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

鉴权可以使用 `x-api-key`，也可以使用 `Authorization: Bearer YOUR_API_KEY`。需要流式输出时，在请求体中加上 `"stream": true`。

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

:::danger Base URL 不要带 /v1
Anthropic SDK 会自动拼接 `/v1/messages`，`base_url` 只填 `{{BASE_URL}}`。
:::

## 注意事项

- `max_tokens` 为必填参数，这是 Anthropic 接口本身的要求。
- 暂不支持 `POST /v1/messages/count_tokens`。
- 也可以用 [OpenAI 兼容接口](/docs/api/openai) 调用 Claude 模型，只需把 `model` 换成 Claude 的模型名。

文中出现的模型名称仅为示例，实际可用的模型以 [模型广场](/pricing) 为准。
