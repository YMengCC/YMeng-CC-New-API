---
title: 画像生成
description: OpenAI 互換の Images インターフェースで画像を生成・編集します。
---

画像インターフェースは OpenAI Images API と同じ形式です。

## 画像を生成する

`POST /v1/images/generations`

```bash
curl {{BASE_URL}}/v1/images/generations \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-image-1",
    "prompt": "窓辺で日なたぼっこをする茶トラ猫、水彩画風",
    "size": "1024x1024",
    "n": 1
  }'
```

主なパラメーター：

| パラメーター      | 説明                                                                        |
| ----------------- | --------------------------------------------------------------------------- |
| `model`           | 画像生成モデル名。モデル広場に従ってください                                |
| `prompt`          | 画像の説明                                                                  |
| `size`            | 画像サイズ。例：`1024x1024`。指定できる値はモデルによって異なります         |
| `n`               | 生成枚数。1 回あたり最大 128 枚ですが、実際の上限はモデルによって異なります |
| `response_format` | `url` または `b64_json`。一部のモデルはどちらか一方のみ対応しています       |

## 画像を編集する

`POST /v1/images/edits`

`multipart/form-data` で元画像と説明をアップロードします。

```bash
curl {{BASE_URL}}/v1/images/edits \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -F model="gpt-image-1" \
  -F image="@input.png" \
  -F prompt="背景を海辺の夕日に変えて"
```

## 料金

画像生成モデルは回数課金の場合も token 課金の場合もあります。一度に複数枚を生成すると、料金は枚数分累計されます。具体的な価格は [モデル広場](/pricing)、料金ルールは [料金について](/pricing) をご覧ください。

:::tip
`url` 形式で返される画像リンクには通常有効期限があります。長期間保存したい画像は早めにダウンロードしてください。
:::

本文中のモデル名は例にすぎません。実際に利用できるモデルは [モデル広場](/pricing) に従ってください。
