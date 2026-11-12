---
title: Gemini インターフェース
description: Google Gemini のネイティブ形式で Gemini モデルを呼び出します。
---

{{SYSTEM_NAME}} は Gemini ネイティブの `generateContent` インターフェースに対応しています。パスの形式は `/v1beta/models/{モデル名}:{操作}` です。

## generateContent

`POST /v1beta/models/{model}:generateContent`

```bash
curl "{{BASE_URL}}/v1beta/models/gemini-2.5-flash:generateContent" \
  -H "x-goog-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [
      { "role": "user", "parts": [{ "text": "こんにちは、Gemini" }] }
    ]
  }'
```

ストリーミング出力では、操作を `streamGenerateContent` に変え、アドレスの後ろに `?alt=sse` を付けます。

```bash
curl "{{BASE_URL}}/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse" \
  -H "x-goog-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "contents": [{ "role": "user", "parts": [{ "text": "短い物語を聞かせて" }] }] }'
```

## 認証方式

次の 3 つの方式からいずれか 1 つを選べます。

| 方式                       | 指定方法                                      |
| -------------------------- | --------------------------------------------- |
| リクエストヘッダー（推奨） | `x-goog-api-key: YOUR_API_KEY`                |
| クエリパラメーター         | アドレスの後ろに `?key=YOUR_API_KEY` を付ける |
| 汎用リクエストヘッダー     | `Authorization: Bearer YOUR_API_KEY`          |

:::warning
クエリパラメーターでキーを渡すと、キーがプロキシやブラウザの履歴に記録される可能性があります。本番環境ではリクエストヘッダーの使用をおすすめします。
:::

## 動画入力

以下のリクエスト本文は、上記のネイティブ API `generateContent` と `streamGenerateContent` で使用できます。動画理解に対応したモデルを選択してください。

### 15 MB 以下：HTTPS 動画 URL を使用

公開ダウンロード可能な HTTPS の動画直リンクを `fileData.fileUri` に指定します。署名付き URL は上流が動画を取得する間、有効である必要があります。ログイン、Cookie、追加ヘッダーを必要とする URL は使用できません。

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
          "text": "この動画の概要を説明してください。"
        }
      ]
    }
  ]
}
```

当サイトは camelCase と snake_case に対応しています：`fileData` / `file_data`、`mimeType` / `mime_type`、`fileUri` / `file_uri`。

### 15 MB 超：インライン Base64 を使用

15 MB を超える外部動画 URL は `fileData` / `file_data` では使用できません。動画ファイルを読み取り、実際のバイト列を Base64 に変換して `inlineData.data` に設定します。

```json
{
  "contents": [
    {
      "role": "user",
      "parts": [
        {
          "inlineData": {
            "mimeType": "video/mp4",
            "data": "<動画ファイルの内容を Base64 に変換した文字列>"
          }
        },
        {
          "text": "この動画の概要を説明してください。"
        }
      ]
    }
  ]
}
```

`inline_data` と `mime_type` も使用できます。`data` には動画内容の Base64 を指定し、動画 URL は指定しないでください。

Base64、プロンプト、その他のフィールドを含む JSON リクエスト本文全体を 100 MB 未満にしてください。Base64 で通常約 3 分の 1 増えるため、元の動画は約 75 MB 未満に抑え、他の内容の分も余裕を持たせてください。「元の動画が 100 MB 未満」だけでは判断できません。

### より大きな動画と Files API

インライン Base64 は小さい動画に適しており、利用可否と応答時間はモデルやチャネルに依存します。Google の動画ガイドでは、リクエスト全体が 20 MB を超える場合、長い動画、繰り返し使用する動画には Files API を推奨しています。インラインリクエスト全体が 100 MB に近い、または超える場合は、動画を圧縮・短縮し、必要に応じてサイト管理者にお問い合わせください。

公式資料：[ファイル入力方法と制限](https://ai.google.dev/gemini-api/docs/generate-content/file-input-methods)、[動画理解](https://ai.google.dev/gemini-api/docs/video-understanding)。

## 注意事項

- `:countTokens` 操作には現在対応しておらず、呼び出すと 404 が返されます。
- [OpenAI 互換インターフェース](/docs/api/openai) から Gemini モデルを呼び出すこともできます。`model` を Gemini のモデル名に変えるだけです。

本文中のモデル名は例にすぎません。実際に利用できるモデルは [モデル広場](/pricing) に従ってください。
