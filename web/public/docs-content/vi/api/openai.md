---
title: API tương thích OpenAI
description: Ví dụ gọi các API Chat Completions, Responses, Embeddings, giọng nói và sắp xếp lại (rerank).
---

Base URL của API tương thích OpenAI là `{{BASE_URL}}/v1`. OpenAI SDK chính thức và bất kỳ công cụ nào hỗ trợ Base URL tùy chỉnh đều có thể dùng trực tiếp.

## Chat Completions

`POST /v1/chat/completions`

```bash
curl {{BASE_URL}}/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [
      { "role": "system", "content": "Bạn là một trợ lý hữu ích." },
      { "role": "user", "content": "Hãy giới thiệu bản thân bằng một câu" }
    ]
  }'
```

Khi cần xuất dạng luồng (streaming), hãy thêm `"stream": true` vào thân yêu cầu, phản hồi sẽ được trả về từng phần dưới dạng Server-Sent Events.

## Sử dụng SDK chính thức

Python:

```python
from openai import OpenAI

client = OpenAI(
    base_url="{{BASE_URL}}/v1",
    api_key="YOUR_API_KEY",
)

response = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "Xin chào"}],
)
print(response.choices[0].message.content)
```

Node.js:

```javascript
import OpenAI from 'openai'

const client = new OpenAI({
  baseURL: '{{BASE_URL}}/v1',
  apiKey: process.env.API_KEY,
})

const response = await client.chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [{ role: 'user', content: 'Xin chào' }],
})
console.log(response.choices[0].message.content)
```

## Responses

`POST /v1/responses`

```bash
curl {{BASE_URL}}/v1/responses \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4.1",
    "input": "Giải thích API gateway là gì trong ba câu"
  }'
```

:::info
Việc có hỗ trợ API Responses hay không tùy thuộc vào chính mô hình. Nếu một mô hình trả về thông báo không hỗ trợ, hãy chuyển sang dùng Chat Completions.
:::

## Embeddings

`POST /v1/embeddings`

```bash
curl {{BASE_URL}}/v1/embeddings \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "text-embedding-3-small",
    "input": "Văn bản cần chuyển thành vector"
  }'
```

## Giọng nói

| Mục đích                       | Phương thức và đường dẫn        |
| ------------------------------ | ------------------------------- |
| Chuyển văn bản thành giọng nói | `POST /v1/audio/speech`         |
| Chuyển giọng nói thành văn bản | `POST /v1/audio/transcriptions` |
| Dịch giọng nói sang tiếng Anh  | `POST /v1/audio/translations`   |

Định dạng yêu cầu giống với API chính thức của OpenAI, chuyển giọng nói thành văn bản cần tải tệp âm thanh lên dưới dạng `multipart/form-data`.

## Các API khác

| Mục đích                          | Phương thức và đường dẫn |
| --------------------------------- | ------------------------ |
| Sắp xếp lại (rerank)              | `POST /v1/rerank`        |
| Kiểm duyệt nội dung               | `POST /v1/moderations`   |
| Hoàn thành văn bản (phiên bản cũ) | `POST /v1/completions`   |

Tên mô hình xuất hiện trong bài chỉ là ví dụ, các mô hình thực sự khả dụng căn cứ theo [Quảng trường mô hình](/pricing).
