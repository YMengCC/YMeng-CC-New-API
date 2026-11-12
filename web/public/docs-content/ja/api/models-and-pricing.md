---
title: モデルと価格
description: インターフェースから利用可能なモデル一覧と公開価格を取得します。
---

## モデル一覧

`GET /v1/models`

現在のAPIキーで呼び出せるモデルを返します。

```bash
curl {{BASE_URL}}/v1/models \
  -H "Authorization: Bearer YOUR_API_KEY"
```

このインターフェースは、リクエストヘッダーに応じて対応する形式を自動で返します。

| リクエストヘッダー                | 返される形式   |
| --------------------------------- | -------------- |
| `Authorization: Bearer ...`       | OpenAI 形式    |
| `x-api-key` + `anthropic-version` | Anthropic 形式 |
| `x-goog-api-key` または `?key=`   | Gemini 形式    |

単一モデルの照会：`GET /v1/models/{model}`。

## 価格

`GET /api/pricing`

すべてのモデルの公開価格情報を返します。[モデル広場](/pricing) ページもこのインターフェースを使用しています。APIキーは不要ですが、サイトがモデル広場をログイン後のみ閲覧可能に設定している場合は、先にログインする必要があります。

```bash
curl {{BASE_URL}}/api/pricing
```

`data` 配列内の各モデルの主なフィールド：

| フィールド         | 説明                                     |
| ------------------ | ---------------------------------------- |
| `model_name`       | モデル名                                 |
| `quota_type`       | 課金方式：`0` は従量課金、`1` は回数課金 |
| `model_ratio`      | モデル倍率（従量課金時に使用）           |
| `completion_ratio` | 入力に対する出力の価格倍率               |
| `model_price`      | 1 回あたりの価格（回数課金時に使用）     |
| `enable_groups`    | このモデルを使用できるグループ           |

:::tip
[モデル広場](/pricing) で直接確認するほうがわかりやすくなります。ページでは倍率が 100 万 token あたりの価格に換算済みで、グループごとに絞り込むこともできます。
:::
