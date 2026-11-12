---
title: Image Generation
description: Generate and edit images through the OpenAI-compatible Images API.
---

The image endpoints use the same format as the OpenAI Images API.

## Generate images

`POST /v1/images/generations`

```bash
curl {{BASE_URL}}/v1/images/generations \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-image-1",
    "prompt": "An orange cat basking in the sun on a windowsill, watercolor style",
    "size": "1024x1024",
    "n": 1
  }'
```

Common parameters:

| Parameter         | Description                                                                    |
| ----------------- | ------------------------------------------------------------------------------ |
| `model`           | Image model name; see the Model Square                                         |
| `prompt`          | Image description                                                              |
| `size`            | Image size, for example `1024x1024`; available values depend on the model      |
| `n`               | Number of images, up to 128 per request; the actual limit depends on the model |
| `response_format` | `url` or `b64_json`; some models support only one of them                      |

## Edit images

`POST /v1/images/edits`

Upload the source image and the description as `multipart/form-data`:

```bash
curl {{BASE_URL}}/v1/images/edits \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -F model="gpt-image-1" \
  -F image="@input.png" \
  -F prompt="Replace the background with a sunset over the sea"
```

## Billing

Image models may be billed per request or by tokens. When one request generates multiple images, the cost is multiplied by the number of images. See the [Model Square](/pricing) for prices and [Billing Overview](/pricing) for billing rules.

:::tip
Image links returned in `url` form usually expire after a while. Download any images you want to keep.
:::

Model names on this page are examples only; the models actually available are listed in the [Model Square](/pricing).
