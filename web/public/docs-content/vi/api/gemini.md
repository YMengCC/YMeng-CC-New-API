---
title: API Gemini
description: Gọi các mô hình Gemini theo định dạng Google Gemini gốc.
---

{{SYSTEM_NAME}} hỗ trợ API `generateContent` gốc của Gemini, định dạng đường dẫn là `/v1beta/models/{tên mô hình}:{thao tác}`.

## generateContent

`POST /v1beta/models/{model}:generateContent`

```bash
curl "{{BASE_URL}}/v1beta/models/gemini-2.5-flash:generateContent" \
  -H "x-goog-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [
      { "role": "user", "parts": [{ "text": "Xin chào, Gemini" }] }
    ]
  }'
```

Để xuất dạng luồng, hãy đổi thao tác thành `streamGenerateContent` và thêm `?alt=sse` vào sau địa chỉ:

```bash
curl "{{BASE_URL}}/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse" \
  -H "x-goog-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "contents": [{ "role": "user", "parts": [{ "text": "Kể một câu chuyện ngắn" }] }] }'
```

## Phương thức xác thực

Chọn một trong ba cách sau:

| Cách                 | Cách viết                                |
| -------------------- | ---------------------------------------- |
| Header (khuyên dùng) | `x-goog-api-key: YOUR_API_KEY`           |
| Tham số truy vấn     | Thêm `?key=YOUR_API_KEY` vào sau địa chỉ |
| Header chung         | `Authorization: Bearer YOUR_API_KEY`     |

:::warning
Khi truyền khóa qua tham số truy vấn, khóa có thể bị ghi lại trong proxy hoặc lịch sử trình duyệt, môi trường production nên dùng header.
:::

## Đầu vào video

Dùng các nội dung yêu cầu sau với API gốc `generateContent` và `streamGenerateContent` ở trên. Chọn mô hình hỗ trợ hiểu video.

### Không quá 15 MB: dùng URL video HTTPS

Đặt liên kết HTTPS tải trực tiếp công khai của video vào `fileData.fileUri`. URL có chữ ký phải còn hiệu lực trong lúc nhà cung cấp tải video và không được yêu cầu đăng nhập, cookie hay header bổ sung.

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
          "text": "Hãy tóm tắt video này."
        }
      ]
    }
  ]
}
```

Trang này hỗ trợ camelCase và snake_case: `fileData` / `file_data`, `mimeType` / `mime_type` và `fileUri` / `file_uri`.

### Trên 15 MB: dùng Base64 nội tuyến

URL video bên ngoài có kích thước trên 15 MB không dùng được với `fileData` / `file_data`. Hãy đọc tệp video, mã hóa các byte thực tế thành Base64 rồi đặt kết quả vào `inlineData.data`:

```json
{
  "contents": [
    {
      "role": "user",
      "parts": [
        {
          "inlineData": {
            "mimeType": "video/mp4",
            "data": "<Nội dung tệp video được mã hóa Base64>"
          }
        },
        {
          "text": "Hãy tóm tắt video này."
        }
      ]
    }
  ]
}
```

Bạn cũng có thể dùng `inline_data` và `mime_type`. `data` phải chứa nội dung video mã hóa Base64, không phải URL video.

Toàn bộ nội dung JSON của yêu cầu phải nhỏ hơn 100 MB, bao gồm Base64, lời nhắc và các trường khác. Base64 thường tăng kích thước khoảng một phần ba, nên giữ video gốc dưới khoảng 75 MB và chừa chỗ cho phần còn lại. Video gốc dưới 100 MB chưa chắc đáp ứng giới hạn.

### Video lớn hơn và Files API

Base64 nội tuyến phù hợp với video nhỏ; khả năng sử dụng và thời gian phản hồi tùy thuộc mô hình và kênh. Hướng dẫn video của Google khuyên dùng Files API khi tổng yêu cầu vượt 20 MB, video dài hoặc cần dùng lại. Khi toàn bộ yêu cầu nội tuyến gần hoặc vượt 100 MB, hãy nén hoặc rút ngắn video và liên hệ quản trị viên trang web nếu cần.

Tài liệu chính thức: [Cách nhập tệp và giới hạn](https://ai.google.dev/gemini-api/docs/generate-content/file-input-methods), [Hiểu video](https://ai.google.dev/gemini-api/docs/video-understanding).

## Lưu ý

- Hiện chưa hỗ trợ thao tác `:countTokens`, lệnh gọi sẽ trả về 404.
- Bạn cũng có thể dùng [API tương thích OpenAI](/docs/api/openai) để gọi mô hình Gemini, chỉ cần đổi `model` thành tên mô hình Gemini.

Tên mô hình xuất hiện trong bài chỉ là ví dụ, các mô hình thực sự khả dụng căn cứ theo [Quảng trường mô hình](/pricing).
