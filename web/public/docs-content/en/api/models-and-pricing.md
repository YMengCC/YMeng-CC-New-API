---
title: Models & Pricing
description: Get the list of available models and public prices through the API.
---

## Model list

`GET /v1/models`

Returns the models your current API key can call:

```bash
curl {{BASE_URL}}/v1/models \
  -H "Authorization: Bearer YOUR_API_KEY"
```

The endpoint automatically returns the matching format based on the request headers:

| Request header                    | Response format  |
| --------------------------------- | ---------------- |
| `Authorization: Bearer ...`       | OpenAI format    |
| `x-api-key` + `anthropic-version` | Anthropic format |
| `x-goog-api-key` or `?key=`       | Gemini format    |

To query a single model: `GET /v1/models/{model}`.

## Pricing

`GET /api/pricing`

Returns public pricing for all models; the [Model Square](/pricing) page uses this endpoint too. No API key is required; if the site only shows the Model Square after sign-in, you need to sign in first.

```bash
curl {{BASE_URL}}/api/pricing
```

Main fields for each model in the `data` array:

| Field              | Description                                            |
| ------------------ | ------------------------------------------------------ |
| `model_name`       | Model name                                             |
| `quota_type`       | Billing method: `0` is token-based, `1` is per request |
| `model_ratio`      | Model ratio (used for token-based billing)             |
| `completion_ratio` | Output price as a multiple of the input price          |
| `model_price`      | Price per request (used for per-request billing)       |
| `enable_groups`    | Groups that can use this model                         |

:::tip
The [Model Square](/pricing) is easier to read: it converts ratios into prices per million tokens and lets you filter by group.
:::
