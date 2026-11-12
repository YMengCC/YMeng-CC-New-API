---
title: OpenAI-Compatible API
description: Examples for the Chat Completions, Responses, Embeddings, audio and rerank endpoints.
---

The Base URL for the OpenAI-compatible API is `{{BASE_URL}}/v1`. The official OpenAI SDKs and any tool that supports a custom Base URL can use it directly.

## Chat Completions

`POST /v1/chat/completions`

```bash
curl {{BASE_URL}}/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [
      { "role": "system", "content": "You are a helpful assistant." },
      { "role": "user", "content": "Introduce yourself in one sentence" }
    ]
  }'
```

For streaming output, add `"stream": true` to the request body; the response is returned in chunks as Server-Sent Events.

## Using the official SDKs

Python:

```python
from openai import OpenAI

client = OpenAI(
    base_url="{{BASE_URL}}/v1",
    api_key="YOUR_API_KEY",
)

response = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "Hello"}],
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
  messages: [{ role: 'user', content: 'Hello' }],
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
    "input": "Explain what an API gateway is in three sentences"
  }'
```

:::info
Whether the Responses API is supported depends on the model itself. If a model reports that it is not supported, use Chat Completions instead.
:::

## Embeddings

`POST /v1/embeddings`

```bash
curl {{BASE_URL}}/v1/embeddings \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "text-embedding-3-small",
    "input": "Text to be embedded"
  }'
```

## Audio

| Purpose                         | Method and path                 |
| ------------------------------- | ------------------------------- |
| Text to speech                  | `POST /v1/audio/speech`         |
| Speech to text                  | `POST /v1/audio/transcriptions` |
| Speech translation into English | `POST /v1/audio/translations`   |

The request format matches the official OpenAI API. For speech to text, upload the audio file as `multipart/form-data`.

## Other endpoints

| Purpose                 | Method and path        |
| ----------------------- | ---------------------- |
| Rerank                  | `POST /v1/rerank`      |
| Moderation              | `POST /v1/moderations` |
| Legacy text completions | `POST /v1/completions` |

Model names on this page are examples only; the models actually available are listed in the [Model Square](/pricing).
