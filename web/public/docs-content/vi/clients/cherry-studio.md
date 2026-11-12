---
title: Cherry Studio
description: Thêm nhà cung cấp tương thích OpenAI trong Cherry Studio để kết nối {{SYSTEM_NAME}}.
---

[Cherry Studio](https://cherry-ai.com) là một ứng dụng AI trên máy tính đa năng, hỗ trợ sẵn các nhà cung cấp tương thích OpenAI.

## Chuẩn bị

Tạo một khóa trên trang [Khóa API](/keys) và sao chép. Nếu chưa có khóa, hãy hoàn thành ba bước đầu trong [Bắt đầu nhanh](/docs/quick-start) trước.

## Các bước cấu hình

1. Mở Cherry Studio, vào **Cài đặt → Dịch vụ mô hình**;
2. Nhấp **Thêm**, chọn loại nhà cung cấp là **OpenAI**, đặt tên tùy ý, ví dụ `{{SYSTEM_NAME}}`;
3. Ở mục **Khóa API**, điền khóa của bạn;
4. Ở mục **Địa chỉ API**, điền:

```text
{{BASE_URL}}/v1
```

5. Nhấp **Quản lý** hoặc **Thêm mô hình**, điền tên mô hình muốn sử dụng;
6. Quay lại giao diện trò chuyện, chọn mô hình vừa thêm ở phía trên là có thể bắt đầu trò chuyện.

:::warning
Địa chỉ API phải giống hệt như trên: không được thiếu hoặc lặp `/v1`, không thêm dấu gạch chéo ở cuối.
:::

## Mô hình đề xuất

- `gpt-4o-mini`
- `gpt-4.1`
- `claude-sonnet-5`

Tên mô hình căn cứ vào các mô hình khả dụng cho nhóm bạn đã chọn trên [Quảng trường mô hình](/pricing).

## Câu hỏi thường gặp

| Hiện tượng                      | Nguyên nhân                                                                | Cách khắc phục                                                                      |
| ------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 401 / Invalid API Key           | Khóa được sao chép không đầy đủ, hoặc khóa đã bị vô hiệu hóa, bị xóa       | Sao chép lại khóa đầy đủ trên trang Khóa API và xác nhận khóa đang ở trạng thái bật |
| model not found                 | Tên mô hình không khớp với các mô hình thực sự khả dụng trong nhóm đã chọn | Chọn từ các mô hình đề xuất, hoặc xem danh sách khả dụng trên Quảng trường mô hình  |
| Yêu cầu bị treo, không phản hồi | Địa chỉ thiếu hoặc thừa `/v1`, hoặc thừa dấu gạch chéo ở cuối              | Điền đúng chính xác địa chỉ API như trên trang này                                  |

## Dùng thử ngay

Muốn xác nhận trước khóa và mô hình có dùng được không, bạn có thể gửi thẳng một tin nhắn trong [Sân chơi](/playground).
