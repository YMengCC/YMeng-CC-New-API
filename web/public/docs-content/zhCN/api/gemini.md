---
title: Gemini 接口
description: 以 Google Gemini 原生格式调用 Gemini 模型。
---

{{SYSTEM_NAME}} 支持 Gemini 原生的 `generateContent` 接口，路径格式为 `/v1beta/models/{模型名}:{操作}`。

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

流式输出请把操作换成 `streamGenerateContent`，并在地址后加上 `?alt=sse`：

```bash
curl "{{BASE_URL}}/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse" \
  -H "x-goog-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "contents": [{ "role": "user", "parts": [{ "text": "讲个短故事" }] }] }'
```

## 鉴权方式

以下三种方式任选其一：

| 方式           | 写法                                 |
| -------------- | ------------------------------------ |
| 请求头（推荐） | `x-goog-api-key: YOUR_API_KEY`       |
| 查询参数       | 在地址后加 `?key=YOUR_API_KEY`       |
| 通用请求头     | `Authorization: Bearer YOUR_API_KEY` |

:::warning
使用查询参数传递密钥时，密钥可能会被记录在代理或浏览器历史中，生产环境建议使用请求头。
:::

## 视频输入

以下请求体适用于上面的 `generateContent` 和 `streamGenerateContent` 原生接口，请选择支持视频理解的模型。

### 不超过 15 MB：使用 HTTPS 视频 URL

将公开可下载的 HTTPS 视频直链放入 `fileData.fileUri`。签名 URL 必须在上游获取视频期间保持有效，不可依赖登录、Cookie 或额外请求头。

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
          "text": "请概括这段视频。"
        }
      ]
    }
  ]
}
```

本站兼容 camelCase（驼峰命名）和 snake_case（下划线命名）：`fileData` / `file_data`、`mimeType` / `mime_type`、`fileUri` / `file_uri`。

### 超过 15 MB：使用内联 Base64

超过 15 MB 的外部视频 URL 不适用 `fileData` / `file_data`。请读取视频文件，将真实文件字节编码为 Base64，放入 `inlineData.data`：

```json
{
  "contents": [
    {
      "role": "user",
      "parts": [
        {
          "inlineData": {
            "mimeType": "video/mp4",
            "data": "<视频文件内容的 Base64 字符串>"
          }
        },
        {
          "text": "请概括这段视频。"
        }
      ]
    }
  ]
}
```

也可使用 `inline_data` 和 `mime_type`。`data` 必须是视频内容的 Base64，不能填写视频 URL。

完整 JSON 请求体必须小于 100 MB，包括 Base64、提示词和其他字段。Base64 通常使体积增加约三分之一，因此原视频应低于约 75 MB，并为其余内容预留空间；不能按“原视频小于 100 MB”判断。

### 更大视频与 Files API

内联 Base64 适合较小的视频，实际可用性和耗时取决于模型与渠道。Google 视频文档建议总请求超过 20 MB、视频较长或需要重复使用时采用 Files API。完整 inline 请求接近或超过 100 MB 时，请压缩或缩短视频，必要时联系站点管理员。

官方参考：[文件输入方式与限制](https://ai.google.dev/gemini-api/docs/generate-content/file-input-methods)、[视频理解](https://ai.google.dev/gemini-api/docs/video-understanding)。

## 注意事项

- 暂不支持 `:countTokens` 操作，调用会返回 404。
- 也可以用 [OpenAI 兼容接口](/docs/api/openai) 调用 Gemini 模型，只需把 `model` 换成 Gemini 的模型名。

文中出现的模型名称仅为示例，实际可用的模型以 [模型广场](/pricing) 为准。
