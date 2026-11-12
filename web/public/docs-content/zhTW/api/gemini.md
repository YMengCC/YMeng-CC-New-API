---
title: Gemini 介面
description: 以 Google Gemini 原生格式呼叫 Gemini 模型。
---

{{SYSTEM_NAME}} 支援 Gemini 原生的 `generateContent` 介面，路徑格式為 `/v1beta/models/{模型名稱}:{操作}`。

## generateContent

`POST /v1beta/models/{model}:generateContent`

```bash
curl "{{BASE_URL}}/v1beta/models/gemini-2.5-flash:generateContent" \
  -H "x-goog-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [
      { "role": "user", "parts": [{ "text": "你好，Gemini" }] }
    ]
  }'
```

串流輸出請把操作換成 `streamGenerateContent`，並在位址後加上 `?alt=sse`：

```bash
curl "{{BASE_URL}}/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse" \
  -H "x-goog-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "contents": [{ "role": "user", "parts": [{ "text": "講個短故事" }] }] }'
```

## 驗證方式

以下三種方式任選其一：

| 方式             | 寫法                                 |
| ---------------- | ------------------------------------ |
| 請求標頭（推薦） | `x-goog-api-key: YOUR_API_KEY`       |
| 查詢參數         | 在位址後加 `?key=YOUR_API_KEY`       |
| 通用請求標頭     | `Authorization: Bearer YOUR_API_KEY` |

:::warning
使用查詢參數傳遞金鑰時，金鑰可能會被記錄在代理伺服器或瀏覽器歷史紀錄中，正式環境建議使用請求標頭。
:::

## 影片輸入

以下請求主體適用於上方的 `generateContent` 和 `streamGenerateContent` 原生介面，請選擇支援影片理解的模型。

### 不超過 15 MB：使用 HTTPS 影片 URL

將可公開下載的 HTTPS 影片直連放入 `fileData.fileUri`。簽章 URL 必須在上游取得影片期間保持有效，且不可依賴登入、Cookie 或額外請求標頭。

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
          "text": "請概括這段影片。"
        }
      ]
    }
  ]
}
```

本站相容 camelCase（駝峰命名）和 snake_case（底線命名）：`fileData` / `file_data`、`mimeType` / `mime_type`、`fileUri` / `file_uri`。

### 超過 15 MB：使用內嵌 Base64

超過 15 MB 的外部影片 URL 不適用 `fileData` / `file_data`。請讀取影片檔案，將實際檔案位元組編碼為 Base64，放入 `inlineData.data`：

```json
{
  "contents": [
    {
      "role": "user",
      "parts": [
        {
          "inlineData": {
            "mimeType": "video/mp4",
            "data": "<影片檔案內容的 Base64 字串>"
          }
        },
        {
          "text": "請概括這段影片。"
        }
      ]
    }
  ]
}
```

也可使用 `inline_data` 和 `mime_type`。`data` 必須是影片內容的 Base64，不可填寫影片 URL。

完整 JSON 請求主體必須小於 100 MB，包括 Base64、提示詞及其他欄位。Base64 通常使體積增加約三分之一，因此原始影片應低於約 75 MB，並為其他內容預留空間；不可依「原始影片小於 100 MB」判斷。

### 更大影片與 Files API

內嵌 Base64 適合較小的影片，實際可用性與耗時取決於模型與渠道。Google 影片文件建議總請求超過 20 MB、影片較長或需要重複使用時採用 Files API。完整 inline 請求接近或超過 100 MB 時，請壓縮或縮短影片，必要時聯絡站點管理員。

官方參考：[檔案輸入方式與限制](https://ai.google.dev/gemini-api/docs/generate-content/file-input-methods)、[影片理解](https://ai.google.dev/gemini-api/docs/video-understanding)。

## 注意事項

- 暫不支援 `:countTokens` 操作，呼叫會回傳 404。
- 也可以用 [OpenAI 相容介面](/docs/api/openai) 呼叫 Gemini 模型，只需把 `model` 換成 Gemini 的模型名稱。

文中出現的模型名稱僅為範例，實際可用的模型以 [模型廣場](/pricing) 為準。
