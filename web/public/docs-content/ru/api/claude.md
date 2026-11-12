---
title: Интерфейс Claude
description: Вызов моделей Claude в нативном формате Anthropic Messages.
---

{{SYSTEM_NAME}} поддерживает нативный интерфейс Messages от Anthropic. Если у вас уже есть код на основе Anthropic SDK, достаточно заменить Base URL и ключ.

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
    "messages": [{ "role": "user", "content": "Привет, Claude" }]
  }'
```

Для авторизации можно использовать `x-api-key` или `Authorization: Bearer YOUR_API_KEY`. Для потокового вывода добавьте в тело запроса `"stream": true`.

## Anthropic SDK

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
    messages=[{"role": "user", "content": "Привет, Claude"}],
)
print(message.content[0].text)
```

:::danger Не добавляйте /v1 к Base URL
Anthropic SDK сам добавляет `/v1/messages`, поэтому в `base_url` укажите только `{{BASE_URL}}`.
:::

## Особенности

- `max_tokens` — обязательный параметр; этого требует сам интерфейс Anthropic.
- `POST /v1/messages/count_tokens` пока не поддерживается.
- Модели Claude можно вызывать и через [OpenAI-совместимый интерфейс](/docs/api/openai) — достаточно указать в `model` название модели Claude.

Названия моделей в тексте приведены только для примера; фактически доступные модели смотрите в [Витрине моделей](/pricing).
