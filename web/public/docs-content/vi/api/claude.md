---
title: API Claude
description: Gọi các mô hình Claude theo định dạng Anthropic Messages gốc.
---

{{SYSTEM_NAME}} hỗ trợ API Messages gốc của Anthropic. Nếu bạn đã có mã dựa trên Anthropic SDK, chỉ cần thay Base URL và khóa là dùng được.

## Messages

`POST /v1/messages`

```bash
curl {{BASE_URL}}/v1/messages \
  -H "x-api-key: YOUR_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-5",
    "max_tokens": 1024,
    "messages": [{ "role": "user", "content": "Xin chào, Claude" }]
  }'
```

Xác thực có thể dùng `x-api-key`, hoặc dùng `Authorization: Bearer YOUR_API_KEY`. Khi cần xuất dạng luồng (streaming), hãy thêm `"stream": true` vào thân yêu cầu.

## Sử dụng Anthropic SDK

Python:

```python
import anthropic

client = anthropic.Anthropic(
    base_url="{{BASE_URL}}",
    api_key="YOUR_API_KEY",
)

message = client.messages.create(
    model="claude-sonnet-5",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Xin chào, Claude"}],
)
print(message.content[0].text)
```

:::danger Base URL không được có /v1
Anthropic SDK sẽ tự động nối thêm `/v1/messages`, `base_url` chỉ điền `{{BASE_URL}}`.
:::

## Lưu ý

- `max_tokens` là tham số bắt buộc, đây là yêu cầu của chính API Anthropic.
- Hiện chưa hỗ trợ `POST /v1/messages/count_tokens`.
- Bạn cũng có thể dùng [API tương thích OpenAI](/docs/api/openai) để gọi mô hình Claude, chỉ cần đổi `model` thành tên mô hình Claude.

Tên mô hình xuất hiện trong bài chỉ là ví dụ, các mô hình thực sự khả dụng căn cứ theo [Quảng trường mô hình](/pricing).
