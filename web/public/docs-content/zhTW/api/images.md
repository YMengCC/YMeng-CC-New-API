---
title: 圖像生成
description: 透過 OpenAI 相容的 Images 介面生成和編輯圖片。
---

圖像介面與 OpenAI Images API 格式一致。

## 生成圖片

`POST /v1/images/generations`

```bash
curl {{BASE_URL}}/v1/images/generations \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-image-1",
    "prompt": "一隻在窗台上曬太陽的橘貓，水彩風格",
    "size": "1024x1024",
    "n": 1
  }'
```

常用參數：

| 參數              | 說明                                          |
| ----------------- | --------------------------------------------- |
| `model`           | 生圖模型名稱，以模型廣場為準                  |
| `prompt`          | 圖片描述                                      |
| `size`            | 圖片尺寸，例如 `1024x1024`，可選值取決於模型  |
| `n`               | 生成張數，單次最多 128 張，實際上限取決於模型 |
| `response_format` | `url` 或 `b64_json`，部分模型只支援其中一種   |

## 編輯圖片

`POST /v1/images/edits`

以 `multipart/form-data` 上傳原圖和描述：

```bash
curl {{BASE_URL}}/v1/images/edits \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -F model="gpt-image-1" \
  -F image="@input.png" \
  -F prompt="把背景換成海邊日落"
```

## 計費

生圖模型可能按次計費，也可能按 token 計費，一次生成多張時費用按張數累計。具體價格請見 [模型廣場](/pricing)，計費規則請見 [計費說明](/pricing)。

:::tip
以 `url` 形式回傳的圖片連結通常有有效期，需要長期保存的圖片請及時下載。
:::

文中出現的模型名稱僅為範例，實際可用的模型以 [模型廣場](/pricing) 為準。
