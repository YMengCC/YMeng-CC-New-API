---
title: Tổng quan API
description: Base URL, phương thức xác thực, các giao thức API được hỗ trợ và định dạng phản hồi lỗi.
---

{{SYSTEM_NAME}} cung cấp đồng thời ba bộ API dưới cùng một địa chỉ: tương thích OpenAI, Claude (Anthropic) gốc và Gemini gốc, tất cả đều gọi bằng cùng một khóa API.

## Base URL

| Giao thức          | Base URL              | Mô tả                                                           |
| ------------------ | --------------------- | --------------------------------------------------------------- |
| Tương thích OpenAI | `{{BASE_URL}}/v1`     | Phù hợp với hầu hết SDK và ứng dụng khách                       |
| Claude gốc         | `{{BASE_URL}}`        | Anthropic SDK và Claude Code sẽ tự động nối thêm `/v1/messages` |
| Gemini gốc         | `{{BASE_URL}}/v1beta` | Dùng cho Google Gen AI SDK hoặc gọi trực tiếp                   |

## Xác thực

Mọi API đều hỗ trợ truyền khóa trong header của yêu cầu:

```http
Authorization: Bearer YOUR_API_KEY
```

Một số API còn tương thích với cách viết gốc trong SDK của từng nhà cung cấp:

| Header / tham số                                        | API áp dụng                                               |
| ------------------------------------------------------- | --------------------------------------------------------- |
| `x-api-key: YOUR_API_KEY`                               | API Claude `/v1/messages`, danh sách mô hình `/v1/models` |
| `x-goog-api-key: YOUR_API_KEY` hoặc `?key=YOUR_API_KEY` | API Gemini `/v1beta/models/...`, danh sách mô hình        |

:::warning
Khóa API chỉ nên lưu ở phía máy chủ hoặc trong cấu hình cục bộ, đừng đưa vào mã giao diện như trang web hay mini app, nếu không bất kỳ ai cũng có thể nhìn thấy và đánh cắp.
:::

## Danh sách API

| Phân loại         | Phương thức và đường dẫn                            | Tài liệu                                       |
| ----------------- | --------------------------------------------------- | ---------------------------------------------- |
| Hội thoại         | `POST /v1/chat/completions`                         | [API tương thích OpenAI](/docs/api/openai)     |
| Responses         | `POST /v1/responses`                                | [API tương thích OpenAI](/docs/api/openai)     |
| Vector            | `POST /v1/embeddings`                               | [API tương thích OpenAI](/docs/api/openai)     |
| Giọng nói         | `POST /v1/audio/speech`, `/v1/audio/transcriptions` | [API tương thích OpenAI](/docs/api/openai)     |
| Sắp xếp lại       | `POST /v1/rerank`                                   | [API tương thích OpenAI](/docs/api/openai)     |
| Tin nhắn Claude   | `POST /v1/messages`                                 | [API Claude](/docs/api/claude)                 |
| Gemini            | `POST /v1beta/models/{model}:generateContent`       | [API Gemini](/docs/api/gemini)                 |
| Hình ảnh          | `POST /v1/images/generations`, `/v1/images/edits`   | [Tạo ảnh](/docs/api/images)                    |
| Danh sách mô hình | `GET /v1/models`                                    | [Mô hình và giá](/docs/api/models-and-pricing) |

Những mô hình có thể gọi phụ thuộc vào nhóm của khóa API, căn cứ theo [Quảng trường mô hình](/pricing).

## Phản hồi lỗi

Khi yêu cầu thất bại sẽ trả về mã trạng thái không phải 2xx, thân phản hồi là JSON. Định dạng của API tương thích OpenAI như sau:

```json
{
  "error": {
    "code": "",
    "message": "Invalid token (request id: 2026093010545547265...)",
    "type": "new_api_error"
  }
}
```

request id ở cuối `message` giúp quản trị viên trang web nhanh chóng xác định vấn đề, vui lòng cung cấp kèm khi phản hồi.

Các mã trạng thái thường gặp:

| Mã trạng thái | Ý nghĩa                                                                                         |
| ------------- | ----------------------------------------------------------------------------------------------- |
| 400           | Tham số yêu cầu không đúng, ví dụ chưa điền tên mô hình                                         |
| 401           | Không gửi kèm khóa, hoặc khóa không hợp lệ, đã hết hạn, đã bị vô hiệu hóa                       |
| 403           | Số dư không đủ, hoặc không có quyền dùng nhóm / mô hình này                                     |
| 429           | Yêu cầu quá thường xuyên, vui lòng thử lại sau (có thể tham khảo header phản hồi `Retry-After`) |
| 503           | Nhóm này tạm thời không có tuyến khả dụng                                                       |

Nguyên nhân cụ thể và cách xử lý từng loại lỗi xem tại [Lỗi thường gặp](/docs/faq/errors).
