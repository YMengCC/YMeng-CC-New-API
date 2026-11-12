---
title: 图像生成
description: 通过 OpenAI 兼容的 Images 接口生成和编辑图片。
---

图像接口与 OpenAI Images API 格式一致。

## 生成图片

`POST /v1/images/generations`

```bash
curl {{BASE_URL}}/v1/images/generations \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-image-1",
    "prompt": "一只在窗台上晒太阳的橘猫，水彩风格",
    "size": "1024x1024",
    "n": 1
  }'
```

常用参数：

| 参数              | 说明                                          |
| ----------------- | --------------------------------------------- |
| `model`           | 生图模型名称，以模型广场为准                  |
| `prompt`          | 图片描述                                      |
| `size`            | 图片尺寸，例如 `1024x1024`，可选值取决于模型  |
| `n`               | 生成张数，单次最多 128 张，实际上限取决于模型 |
| `response_format` | `url` 或 `b64_json`，部分模型只支持其中一种   |

## 编辑图片

`POST /v1/images/edits`

以 `multipart/form-data` 上传原图和描述：

```bash
curl {{BASE_URL}}/v1/images/edits \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -F model="gpt-image-1" \
  -F image="@input.png" \
  -F prompt="把背景换成海边日落"
```

## 计费

生图模型可能按次计费，也可能按 token 计费，一次生成多张时费用按张数累计。具体价格见 [模型广场](/pricing)，计费规则见 [计费说明](/pricing)。

:::tip
`url` 形式返回的图片链接通常有有效期，需要长期保存的图片请及时下载。
:::

文中出现的模型名称仅为示例，实际可用的模型以 [模型广场](/pricing) 为准。
