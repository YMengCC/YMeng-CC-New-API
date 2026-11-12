---
title: Gemini API
description: Call Gemini models using the native Google Gemini format.
---

{{SYSTEM_NAME}} supports Gemini's native `generateContent` API. The path format is `/v1beta/models/{model}:{action}`.

## generateContent

`POST /v1beta/models/{model}:generateContent`

```bash
curl "{{BASE_URL}}/v1beta/models/gemini-2.5-flash:generateContent" \
  -H "x-goog-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [
      { "role": "user", "parts": [{ "text": "Hello, Gemini" }] }
    ]
  }'
```

For streaming output, change the action to `streamGenerateContent` and add `?alt=sse` to the URL:

```bash
curl "{{BASE_URL}}/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse" \
  -H "x-goog-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "contents": [{ "role": "user", "parts": [{ "text": "Tell me a short story" }] }] }'
```

## Authentication

Use any one of the following three methods:

| Method                       | Usage                                |
| ---------------------------- | ------------------------------------ |
| Request header (recommended) | `x-goog-api-key: YOUR_API_KEY`       |
| Query parameter              | Add `?key=YOUR_API_KEY` to the URL   |
| Generic request header       | `Authorization: Bearer YOUR_API_KEY` |

:::warning
When the key is passed as a query parameter, it may be recorded in proxy logs or browser history. In production, use a request header instead.
:::

## Video input

Use the following request bodies with the native `generateContent` and `streamGenerateContent` endpoints above. Choose a model that supports video understanding.

### Up to 15 MB: use an HTTPS video URL

Put a publicly downloadable HTTPS video URL in `fileData.fileUri`. Signed URLs must remain valid while the upstream fetches the video and must not require a login, cookies, or additional headers.

```json
{
  "contents": [
    {
      "role": "user",
      "parts": [
        {
          "fileData": {
            "mimeType": "video/mp4",
            "fileUri": "https://example.com/video.mp4"
          }
        },
        {
          "text": "Summarize this video."
        }
      ]
    }
  ]
}
```

This site accepts camelCase and snake_case: `fileData` / `file_data`, `mimeType` / `mime_type`, and `fileUri` / `file_uri`.

### Over 15 MB: use inline Base64

External video URLs over 15 MB cannot be used with `fileData` / `file_data`. Read the video file, encode its actual bytes as Base64, and put the result in `inlineData.data`:

```json
{
  "contents": [
    {
      "role": "user",
      "parts": [
        {
          "inlineData": {
            "mimeType": "video/mp4",
            "data": "<Base64-encoded video file contents>"
          }
        },
        {
          "text": "Summarize this video."
        }
      ]
    }
  ]
}
```

You can also use `inline_data` and `mime_type`. `data` must contain the video contents encoded as Base64, not a video URL.

The complete JSON request body must be smaller than 100 MB, including Base64, prompts, and other fields. Base64 typically adds about one third to the size, so keep the original video below approximately 75 MB and leave room for the remaining content. An original video under 100 MB does not necessarily fit.

### Larger videos and the Files API

Inline Base64 works best for smaller videos; availability and response time depend on the model and channel. Google's video guide recommends the Files API for total requests over 20 MB, longer videos, or repeated use. If the complete inline request approaches or exceeds 100 MB, compress or shorten the video, and contact the site administrator if needed.

Official references: [File input methods and limits](https://ai.google.dev/gemini-api/docs/generate-content/file-input-methods), [Video understanding](https://ai.google.dev/gemini-api/docs/video-understanding).

## Notes

- The `:countTokens` action is not supported yet; calling it returns 404.
- You can also call Gemini models through the [OpenAI-Compatible API](/docs/api/openai) by setting `model` to a Gemini model name.

Model names on this page are examples only; the models actually available are listed in the [Model Square](/pricing).
