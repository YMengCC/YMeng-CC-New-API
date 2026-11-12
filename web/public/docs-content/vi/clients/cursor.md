---
title: Cursor
description: Dùng các mô hình của {{SYSTEM_NAME}} trong Cursor với sự hỗ trợ của cursor-byokcx.
---

[Cursor](https://cursor.com) là một IDE lập trình AI. Phần cài đặt sẵn của Cursor hỗ trợ hạn chế cho địa chỉ tùy chỉnh tương thích OpenAI, nên chúng tôi khuyên dùng công cụ mã nguồn mở [cursor-byokcx](https://github.com/leookun/cursor-byokcx) để kết nối.

## Chuẩn bị

1. Tạo một khóa trên trang [Khóa API](/keys) và sao chép;
2. Cài đặt theo hướng dẫn trên trang chủ dự án cursor-byokcx.

## Các bước cấu hình

1. Trong cursor-byokcx, đặt **API Base URL** thành:

```text
{{BASE_URL}}/v1
```

2. Ở mục **API Key**, điền khóa của bạn;
3. Trỏ cả **mô hình hội thoại** và **mô hình hoàn thành mã** đến địa chỉ tùy chỉnh này, và điền tên mô hình muốn sử dụng;
4. Lưu cấu hình rồi **khởi động lại Cursor**.

:::warning
Hội thoại và hoàn thành mã của Cursor là hai bộ thiết lập mô hình độc lập. Nếu chỉ sửa một trong hai, sẽ xảy ra tình trạng "hoàn thành mã dùng được, hội thoại báo lỗi".
:::

## Mô hình đề xuất

- `gpt-4.1`
- `claude-sonnet-5`
- `gpt-4o-mini`

Tên mô hình căn cứ vào các mô hình khả dụng cho nhóm bạn đã chọn trên [Quảng trường mô hình](/pricing).

## Câu hỏi thường gặp

| Hiện tượng                                      | Nguyên nhân                                                                     | Cách khắc phục                                                                               |
| ----------------------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Danh sách mô hình không có mô hình tùy chỉnh    | Công cụ cầu nối chưa được cài đặt hoặc chưa bật, hoặc chưa khởi động lại Cursor | Hoàn tất cấu hình cursor-byokcx và khởi động lại Cursor rồi kiểm tra lại                     |
| 401 / Invalid API Key                           | Khóa được sao chép không đầy đủ, hoặc khóa đã bị vô hiệu hóa, bị xóa            | Sao chép lại khóa đầy đủ trên trang Khóa API và xác nhận khóa đang ở trạng thái bật          |
| Hoàn thành mã dùng được nhưng hội thoại báo lỗi | Hội thoại và hoàn thành mã là hai bộ thiết lập, chỉ sửa một trong hai           | Trong cursor-byokcx, trỏ cả mô hình hội thoại và mô hình hoàn thành mã đến địa chỉ tùy chỉnh |

## Dùng thử ngay

Muốn xác nhận trước khóa và mô hình có dùng được không, bạn có thể gửi thẳng một tin nhắn trong [Sân chơi](/playground).
