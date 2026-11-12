---
title: Claude Code
description: Thiết lập Base URL và token cho Claude Code chính thức của Anthropic, hoặc nhập bằng CC Switch chỉ với một cú nhấp.
---

[Claude Code](https://docs.anthropic.com/en/docs/claude-code) là trợ lý lập trình dòng lệnh chính thức của Anthropic. Có hai cách kết nối: nhập vào CC Switch chỉ với một cú nhấp, hoặc thiết lập biến môi trường thủ công.

## Cách 1: Nhập bằng CC Switch chỉ với một cú nhấp (khuyên dùng)

[CC Switch](https://ccswitch.io/zh/) là một công cụ giao diện đồ họa, giúp quản lý nhiều bộ cấu hình Claude Code và chuyển đổi nhanh giữa chúng.

1. Cài đặt CC Switch;
2. Trên trang [Khóa API](/keys), nhấp menu **⋯** bên phải khóa và chọn **CC Switch**;
3. Trong hộp thoại, ở mục **Ứng dụng** chọn `Claude`, chọn **Mô hình chính** (có thể điền thêm các mô hình tương ứng với Haiku / Sonnet / Opus);
4. Nhấp **Mở công tắc CC**, xác nhận nhập và bật bộ cấu hình này trong CC Switch;
5. Mở lại terminal và khởi động Claude Code.

## Cách 2: Thiết lập biến môi trường thủ công

Thiết lập các biến môi trường sau trong terminal (thay `YOUR_API_KEY` bằng khóa của bạn).

macOS / Linux:

```bash
export ANTHROPIC_BASE_URL="{{BASE_URL}}"
export ANTHROPIC_AUTH_TOKEN="YOUR_API_KEY"
```

Windows PowerShell:

```powershell
$env:ANTHROPIC_BASE_URL = "{{BASE_URL}}"
$env:ANTHROPIC_AUTH_TOKEN = "YOUR_API_KEY"
```

Sau khi thiết lập xong, chạy `claude` trong cùng cửa sổ terminal là được.

:::danger Không thêm /v1 vào sau địa chỉ
Claude Code sẽ tự nối thêm `/v1/messages`. `ANTHROPIC_BASE_URL` chỉ điền `{{BASE_URL}}`, nếu thêm `/v1` sẽ khiến yêu cầu thất bại.
:::

## Mô hình đề xuất

- `claude-sonnet-5`
- `claude-opus-5`

Tên mô hình căn cứ vào các mô hình khả dụng cho nhóm bạn đã chọn trên [Quảng trường mô hình](/pricing).

## Câu hỏi thường gặp

| Hiện tượng                                         | Nguyên nhân                                                                | Cách khắc phục                                                                      |
| -------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 401 / authentication_error                         | Chưa thiết lập `ANTHROPIC_AUTH_TOKEN`, hoặc khóa đã bị vô hiệu hóa, bị xóa | Tạo lại khóa và xác nhận đã thiết lập trong terminal hiện tại                       |
| Yêu cầu vẫn được gửi đến Anthropic chính thức      | `ANTHROPIC_BASE_URL` chưa có hiệu lực, hoặc bị thêm `/v1`                  | Điền địa chỉ đúng chính xác như trang này, không thêm bất kỳ đường dẫn nào          |
| Sau khi chuyển cấu hình vẫn kết nối đến địa chỉ cũ | Trên máy có nhiều bộ cấu hình lẫn lộn, không dùng CC Switch để chuyển đổi  | Dùng CC Switch để quản lý tập trung các bộ cấu hình, mở lại terminal sau khi chuyển |

## Dùng thử ngay

Muốn xác nhận trước khóa và mô hình có dùng được không, bạn có thể gửi thẳng một tin nhắn trong [Sân chơi](/playground).
