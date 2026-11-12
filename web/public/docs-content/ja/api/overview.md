---
title: API 概要
description: Base URL、認証方式、サポートするインターフェースのプロトコル、エラーレスポンスの形式。
---

{{SYSTEM_NAME}} は同じアドレスで、OpenAI 互換、Claude（Anthropic）ネイティブ、Gemini ネイティブの 3 種類のインターフェースを提供しており、同じAPIキーで呼び出せます。

## Base URL

| プロトコル        | Base URL              | 説明                                                                |
| ----------------- | --------------------- | ------------------------------------------------------------------- |
| OpenAI 互換       | `{{BASE_URL}}/v1`     | ほとんどの SDK とクライアントで使用できます                         |
| Claude ネイティブ | `{{BASE_URL}}`        | Anthropic SDK と Claude Code は自動で `/v1/messages` を付け加えます |
| Gemini ネイティブ | `{{BASE_URL}}/v1beta` | Google Gen AI SDK または直接呼び出しで使用します                    |

## 認証

すべてのインターフェースで、リクエストヘッダーに次を含める方式に対応しています。

```http
Authorization: Bearer YOUR_API_KEY
```

一部のインターフェースは、各ベンダー SDK のネイティブな指定方法にも対応しています。

| リクエストヘッダー / パラメーター                         | 対象インターフェース                                            |
| --------------------------------------------------------- | --------------------------------------------------------------- |
| `x-api-key: YOUR_API_KEY`                                 | Claude インターフェース `/v1/messages`、モデル一覧 `/v1/models` |
| `x-goog-api-key: YOUR_API_KEY` または `?key=YOUR_API_KEY` | Gemini インターフェース `/v1beta/models/...`、モデル一覧        |

:::warning
APIキーはサーバー側またはローカルの設定にのみ保存してください。Web ページやミニプログラムなどのフロントエンドコードに書き込むと、誰でも閲覧・盗用できてしまいます。
:::

## インターフェース一覧

| 分類              | メソッドとパス                                      | ドキュメント                                    |
| ----------------- | --------------------------------------------------- | ----------------------------------------------- |
| 対話              | `POST /v1/chat/completions`                         | [OpenAI 互換インターフェース](/docs/api/openai) |
| Responses         | `POST /v1/responses`                                | [OpenAI 互換インターフェース](/docs/api/openai) |
| ベクトル          | `POST /v1/embeddings`                               | [OpenAI 互換インターフェース](/docs/api/openai) |
| 音声              | `POST /v1/audio/speech`、`/v1/audio/transcriptions` | [OpenAI 互換インターフェース](/docs/api/openai) |
| リランク          | `POST /v1/rerank`                                   | [OpenAI 互換インターフェース](/docs/api/openai) |
| Claude メッセージ | `POST /v1/messages`                                 | [Claude インターフェース](/docs/api/claude)     |
| Gemini            | `POST /v1beta/models/{model}:generateContent`       | [Gemini インターフェース](/docs/api/gemini)     |
| 画像              | `POST /v1/images/generations`、`/v1/images/edits`   | [画像生成](/docs/api/images)                    |
| モデル一覧        | `GET /v1/models`                                    | [モデルと価格](/docs/api/models-and-pricing)    |

呼び出せるモデルはAPIキーが属するグループによって異なります。[モデル広場](/pricing) の表示に従ってください。

## エラーレスポンス

リクエストが失敗すると 2xx 以外のステータスコードが返され、レスポンスボディは JSON です。OpenAI 互換インターフェースの形式は次のとおりです。

```json
{
  "error": {
    "code": "",
    "message": "Invalid token (request id: 2026093010545547265...)",
    "type": "new_api_error"
  }
}
```

`message` の末尾にある request id は、サイト管理者が問題を素早く特定するのに役立ちます。お問い合わせの際はあわせてお知らせください。

主なステータスコード：

| ステータスコード | 意味                                                                                                            |
| ---------------- | --------------------------------------------------------------------------------------------------------------- |
| 400              | リクエストパラメーターに誤りがあります（例：モデル名が指定されていない）                                        |
| 401              | キーが含まれていない、またはキーが無効・期限切れ・無効化されています                                            |
| 403              | 残高不足、またはそのグループ / モデルを使用する権限がありません                                                 |
| 429              | リクエストが多すぎます。しばらくしてから再試行してください（レスポンスヘッダー `Retry-After` を参考にできます） |
| 503              | そのグループで現在利用できる回線がありません                                                                    |

各エラーの具体的な原因と対処法は [よくあるエラー](/docs/faq/errors) をご覧ください。
