---
title: Claude API
description: Call Claude models using the native Anthropic Messages format.
---

{{SYSTEM_NAME}} supports Anthropic's native Messages API. If you already have code based on the Anthropic SDK, just replace the Base URL and the key.

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
    "messages": [{ "role": "user", "content": "Hello, Claude" }]
  }'
```

You can authenticate with either `x-api-key` or `Authorization: Bearer YOUR_API_KEY`. For streaming output, add `"stream": true` to the request body.

## Using the Anthropic SDK

Python:

```python
import anthropic

client = anthropic.Anthropic(
    base_url="{{BASE_URL}}",
    api_key="YOUR_API_KEY",
)

message = client.messages.create(
    model="claude-sonnet-5",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Hello, Claude"}],
)
print(message.content[0].text)
```

:::danger Do not include /v1 in the Base URL
The Anthropic SDK appends `/v1/messages` automatically, so set `base_url` to just `{{BASE_URL}}`.
:::

## Notes

- `max_tokens` is required; this is a requirement of the Anthropic API itself.
- `POST /v1/messages/count_tokens` is not supported yet.
- You can also call Claude models through the [OpenAI-Compatible API](/docs/api/openai) by setting `model` to a Claude model name.

Model names on this page are examples only; the models actually available are listed in the [Model Square](/pricing).
