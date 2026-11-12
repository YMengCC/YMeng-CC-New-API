---
title: 模型與價格
description: 透過介面取得可用模型列表和公開價格。
---

## 模型列表

`GET /v1/models`

回傳目前 API 金鑰可以呼叫的模型：

```bash
curl {{BASE_URL}}/v1/models \
  -H "Authorization: Bearer YOUR_API_KEY"
```

介面會根據請求標頭自動回傳對應格式：

| 請求標頭                          | 回傳格式       |
| --------------------------------- | -------------- |
| `Authorization: Bearer ...`       | OpenAI 格式    |
| `x-api-key` + `anthropic-version` | Anthropic 格式 |
| `x-goog-api-key` 或 `?key=`       | Gemini 格式    |

查詢單一模型：`GET /v1/models/{model}`。

## 價格

`GET /api/pricing`

回傳全部模型的公開價格資訊，[模型廣場](/pricing) 頁面也使用這個介面。無需 API 金鑰；如果網站設定了登入後才能查看模型廣場，則需要先登入。

```bash
curl {{BASE_URL}}/api/pricing
```

`data` 陣列中每個模型的主要欄位：

| 欄位               | 說明                                     |
| ------------------ | ---------------------------------------- |
| `model_name`       | 模型名稱                                 |
| `quota_type`       | 計費方式：`0` 為按量計費，`1` 為按次計費 |
| `model_ratio`      | 模型倍率（按量計費時使用）               |
| `completion_ratio` | 輸出相對輸入的價格倍數                   |
| `model_price`      | 單次價格（按次計費時使用）               |
| `enable_groups`    | 可以使用該模型的分組                     |

:::tip
直接在 [模型廣場](/pricing) 查看會更直觀：頁面已經把倍率換算成每百萬 token 的價格，並可以按分組篩選。
:::
