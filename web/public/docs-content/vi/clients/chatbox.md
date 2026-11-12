---
title: ChatBox
description: Kết nối {{SYSTEM_NAME}} trong ChatBox bằng nhà cung cấp tùy chỉnh tương thích OpenAI.
---

[ChatBox](https://chatboxai.app) là một ứng dụng khách AI đa nền tảng, hỗ trợ API tùy chỉnh tương thích OpenAI.

## Chuẩn bị

Tạo một khóa trên trang [Khóa API](/keys) và sao chép. Nếu chưa có khóa, hãy hoàn thành ba bước đầu trong [Bắt đầu nhanh](/docs/quick-start) trước.

## Các bước cấu hình

1. Mở ChatBox, vào **Cài đặt → Mô hình**;
2. Thêm một nhà cung cấp **tùy chỉnh tương thích OpenAI**;
3. Ở mục **Khóa API**, điền khóa của bạn;
4. Ở mục **Địa chỉ API (API Host)**, điền:

```text
{{BASE_URL}}/v1
```

5. Trong danh sách mô hình, điền hoặc chọn tên mô hình muốn sử dụng, lưu lại là có thể bắt đầu trò chuyện.

:::tip
Một số phiên bản ChatBox tự động thêm `/v1` vào sau địa chỉ. Nếu điền như trên mà báo lỗi 404, hãy đổi địa chỉ thành `{{BASE_URL}}` rồi thử lại.
:::

## Mô hình đề xuất

- `gpt-4o-mini`
- `gpt-4.1`
- `gemini-2.5-flash`

Tên mô hình căn cứ vào các mô hình khả dụng cho nhóm bạn đã chọn trên [Quảng trường mô hình](/pricing).

## Câu hỏi thường gặp

| Hiện tượng                             | Nguyên nhân                                                          | Cách khắc phục                                                                                      |
| -------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 401 / Invalid API Key                  | Khóa được sao chép không đầy đủ, hoặc khóa đã bị vô hiệu hóa, bị xóa | Sao chép lại khóa đầy đủ trên trang Khóa API và xác nhận khóa đang ở trạng thái bật                 |
| insufficient quota                     | Số dư tài khoản hoặc hạn mức phiếu quà tặng đã dùng hết              | Nạp tiền trên trang Ví, hoặc kiểm tra xem nhóm đã chọn có hỗ trợ phiếu quà tặng không               |
| Kết nối bị quá thời gian ở một số mạng | Mạng cục bộ truy cập địa chỉ này không ổn định                       | Đổi sang mạng khác rồi thử lại, hoặc liên hệ quản trị viên trang web để xác nhận trạng thái dịch vụ |

## Dùng thử ngay

Muốn xác nhận trước khóa và mô hình có dùng được không, bạn có thể gửi thẳng một tin nhắn trong [Sân chơi](/playground).
