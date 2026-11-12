---
title: OpenAI-совместимый интерфейс
description: Примеры вызова интерфейсов Chat Completions, Responses, Embeddings, речи и ранжирования.
---

Base URL OpenAI-совместимого интерфейса — `{{BASE_URL}}/v1`. Его можно сразу использовать в официальном OpenAI SDK и в любом инструменте, где можно задать собственный Base URL.

## Chat Completions

`POST /v1/chat/completions`

```bash
curl {{BASE_URL}}/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [
      { "role": "system", "content": "Ты — полезный ассистент." },
      { "role": "user", "content": "Представься одним предложением" }
    ]
  }'
```

Для потокового вывода добавьте в тело запроса `"stream": true` — ответ будет приходить частями в виде Server-Sent Events.

## Официальный SDK

Python:

```python
from openai import OpenAI

client = OpenAI(
    base_url="{{BASE_URL}}/v1",
    api_key="YOUR_API_KEY",
)

response = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "Привет"}],
)
print(response.choices[0].message.content)
```

Node.js:

```javascript
import OpenAI from 'openai'

const client = new OpenAI({
  baseURL: '{{BASE_URL}}/v1',
  apiKey: process.env.API_KEY,
})

const response = await client.chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [{ role: 'user', content: 'Привет' }],
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
    "input": "Объясни в трёх предложениях, что такое API-шлюз"
  }'
```

:::info
Поддержка интерфейса Responses зависит от конкретной модели. Если модель сообщает, что он не поддерживается, используйте Chat Completions.
:::

## Embeddings

`POST /v1/embeddings`

```bash
curl {{BASE_URL}}/v1/embeddings \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "text-embedding-3-small",
    "input": "Текст для векторизации"
  }'
```

## Речь

| Назначение                 | Метод и путь                    |
| -------------------------- | ------------------------------- |
| Синтез речи из текста      | `POST /v1/audio/speech`         |
| Распознавание речи в текст | `POST /v1/audio/transcriptions` |
| Перевод речи на английский | `POST /v1/audio/translations`   |

Формат запросов совпадает с официальным API OpenAI; для распознавания речи аудиофайл загружается в формате `multipart/form-data`.

## Другие интерфейсы

| Назначение                   | Метод и путь           |
| ---------------------------- | ---------------------- |
| Ранжирование                 | `POST /v1/rerank`      |
| Модерация контента           | `POST /v1/moderations` |
| Устаревшее дополнение текста | `POST /v1/completions` |

Названия моделей в тексте приведены только для примера; фактически доступные модели смотрите в [Витрине моделей](/pricing).
