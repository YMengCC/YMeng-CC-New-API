---
title: API Overview
description: Base URL, authentication, supported API protocols, and the error response format.
---

{{SYSTEM_NAME}} serves three sets of APIs from the same address — OpenAI-compatible, Claude (Anthropic) native and Gemini native — all called with the same API key.

## Base URL

| Protocol          | Base URL              | Notes                                                                 |
| ----------------- | --------------------- | --------------------------------------------------------------------- |
| OpenAI-compatible | `{{BASE_URL}}/v1`     | Works with the vast majority of SDKs and clients                      |
| Claude native     | `{{BASE_URL}}`        | The Anthropic SDK and Claude Code append `/v1/messages` automatically |
| Gemini native     | `{{BASE_URL}}/v1beta` | For the Google Gen AI SDK or direct calls                             |

## Authentication

Every endpoint accepts this request header:

```http
Authorization: Bearer YOUR_API_KEY
```

Some endpoints also accept each vendor SDK's native style:

| Header / parameter                                    | Applicable endpoints                                    |
| ----------------------------------------------------- | ------------------------------------------------------- |
| `x-api-key: YOUR_API_KEY`                             | Claude endpoint `/v1/messages`, model list `/v1/models` |
| `x-goog-api-key: YOUR_API_KEY` or `?key=YOUR_API_KEY` | Gemini endpoints `/v1beta/models/...`, model list       |

:::warning
Keep API keys only on the server side or in local configuration. Never put them in front-end code such as web pages or mini programs, or anyone will be able to see and steal them.
:::

## Endpoint list

| Category        | Method and path                                     | Docs                                             |
| --------------- | --------------------------------------------------- | ------------------------------------------------ |
| Chat            | `POST /v1/chat/completions`                         | [OpenAI-Compatible API](/docs/api/openai)        |
| Responses       | `POST /v1/responses`                                | [OpenAI-Compatible API](/docs/api/openai)        |
| Embeddings      | `POST /v1/embeddings`                               | [OpenAI-Compatible API](/docs/api/openai)        |
| Audio           | `POST /v1/audio/speech`, `/v1/audio/transcriptions` | [OpenAI-Compatible API](/docs/api/openai)        |
| Rerank          | `POST /v1/rerank`                                   | [OpenAI-Compatible API](/docs/api/openai)        |
| Claude Messages | `POST /v1/messages`                                 | [Claude API](/docs/api/claude)                   |
| Gemini          | `POST /v1beta/models/{model}:generateContent`       | [Gemini API](/docs/api/gemini)                   |
| Images          | `POST /v1/images/generations`, `/v1/images/edits`   | [Image Generation](/docs/api/images)             |
| Model list      | `GET /v1/models`                                    | [Models & Pricing](/docs/api/models-and-pricing) |

Which models you can call depends on the group of your API key; see the [Model Square](/pricing).

## Error responses

When a request fails, it returns a non-2xx status code with a JSON body. For OpenAI-compatible endpoints, the format is:

```json
{
  "error": {
    "code": "",
    "message": "Invalid token (request id: 2026093010545547265...)",
    "type": "new_api_error"
  }
}
```

The request id at the end of `message` helps the site administrator locate the problem quickly; please include it when reporting an issue.

Common status codes:

| Status code | Meaning                                                                |
| ----------- | ---------------------------------------------------------------------- |
| 400         | Invalid request parameters, such as a missing model name               |
| 401         | No key provided, or the key is invalid, expired or disabled            |
| 403         | Insufficient balance, or no permission to use the group / model        |
| 429         | Too many requests; retry later (see the `Retry-After` response header) |
| 503         | No route is currently available in this group                          |

For the specific causes and fixes of each error, see [Common Errors](/docs/faq/errors).
