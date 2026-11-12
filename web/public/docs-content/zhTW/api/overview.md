---
title: API 概覽
description: Base URL、驗證方式、支援的介面協定，以及錯誤回應的格式。
---

{{SYSTEM_NAME}} 在同一個位址下同時提供 OpenAI 相容、Claude（Anthropic）原生和 Gemini 原生三套介面，使用同一個 API 金鑰呼叫。

## Base URL

| 協定        | Base URL              | 說明                                                   |
| ----------- | --------------------- | ------------------------------------------------------ |
| OpenAI 相容 | `{{BASE_URL}}/v1`     | 適用於絕大多數 SDK 和用戶端                            |
| Claude 原生 | `{{BASE_URL}}`        | Anthropic SDK 和 Claude Code 會自動拼接 `/v1/messages` |
| Gemini 原生 | `{{BASE_URL}}/v1beta` | 用於 Google Gen AI SDK 或直接呼叫                      |

## 驗證

所有介面都支援在請求標頭中攜帶：

```http
Authorization: Bearer YOUR_API_KEY
```

部分介面還相容各廠商 SDK 的原生寫法：

| 請求標頭 / 參數                                       | 適用介面                                          |
| ----------------------------------------------------- | ------------------------------------------------- |
| `x-api-key: YOUR_API_KEY`                             | Claude 介面 `/v1/messages`、模型列表 `/v1/models` |
| `x-goog-api-key: YOUR_API_KEY` 或 `?key=YOUR_API_KEY` | Gemini 介面 `/v1beta/models/...`、模型列表        |

:::warning
API 金鑰只應儲存在伺服器端或本機設定中，不要寫進網頁、小程式等前端程式碼，否則任何人都能看到並盜用。
:::

## 介面一覽

| 分類        | 方法與路徑                                          | 文件                                       |
| ----------- | --------------------------------------------------- | ------------------------------------------ |
| 對話        | `POST /v1/chat/completions`                         | [OpenAI 相容介面](/docs/api/openai)        |
| Responses   | `POST /v1/responses`                                | [OpenAI 相容介面](/docs/api/openai)        |
| 向量        | `POST /v1/embeddings`                               | [OpenAI 相容介面](/docs/api/openai)        |
| 語音        | `POST /v1/audio/speech`、`/v1/audio/transcriptions` | [OpenAI 相容介面](/docs/api/openai)        |
| 重新排序    | `POST /v1/rerank`                                   | [OpenAI 相容介面](/docs/api/openai)        |
| Claude 訊息 | `POST /v1/messages`                                 | [Claude 介面](/docs/api/claude)            |
| Gemini      | `POST /v1beta/models/{model}:generateContent`       | [Gemini 介面](/docs/api/gemini)            |
| 圖像        | `POST /v1/images/generations`、`/v1/images/edits`   | [圖像生成](/docs/api/images)               |
| 模型列表    | `GET /v1/models`                                    | [模型與價格](/docs/api/models-and-pricing) |

能呼叫哪些模型取決於 API 金鑰所在的分組，以 [模型廣場](/pricing) 為準。

## 錯誤回應

請求失敗時回傳非 2xx 狀態碼，回應內容為 JSON。OpenAI 相容介面的格式如下：

```json
{
  "error": {
    "code": "",
    "message": "Invalid token (request id: 2026093010545547265...)",
    "type": "new_api_error"
  }
}
```

`message` 結尾的 request id 可以幫助站點管理員快速定位問題，回報時請一併提供。

常見狀態碼：

| 狀態碼 | 含義                                                     |
| ------ | -------------------------------------------------------- |
| 400    | 請求參數有誤，例如沒有填寫模型名稱                       |
| 401    | 沒有攜帶金鑰，或金鑰無效、已過期、已停用                 |
| 403    | 餘額不足，或無權使用該分組 / 模型                        |
| 429    | 請求過於頻繁，請稍後重試（可參考回應標頭 `Retry-After`） |
| 503    | 該分組下暫時沒有可用的線路                               |

每種錯誤的具體原因和處理方法請見 [常見錯誤](/docs/faq/errors)。
