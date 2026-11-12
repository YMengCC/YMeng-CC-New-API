---
title: Codex CLI
description: Dùng biến môi trường để Codex CLI chính thức của OpenAI đi qua {{SYSTEM_NAME}}.
---

[Codex CLI](https://github.com/openai/codex) là trợ lý lập trình dòng lệnh chính thức của OpenAI. Chỉ cần thiết lập hai biến môi trường là có thể gọi mô hình thông qua {{SYSTEM_NAME}}.

## Chuẩn bị

Tạo một khóa trên trang [Khóa API](/keys) và sao chép, sau đó cài đặt Codex CLI theo hướng dẫn chính thức.

## Các bước cấu hình

Thiết lập các biến môi trường sau trong terminal (thay `YOUR_API_KEY` bằng khóa của bạn).

macOS / Linux:

```bash
export OPENAI_BASE_URL="{{BASE_URL}}/v1"
export OPENAI_API_KEY="YOUR_API_KEY"
```

Windows PowerShell:

```powershell
$env:OPENAI_BASE_URL = "{{BASE_URL}}/v1"
$env:OPENAI_API_KEY = "YOUR_API_KEY"
```

Sau khi thiết lập xong, khởi động Codex CLI **trong cùng cửa sổ terminal** là được.

Nếu bạn đang dùng [CC Switch](https://ccswitch.io/zh/) để quản lý cấu hình, bạn cũng có thể chọn **CC Switch** trong menu **⋯** của danh sách khóa API, chọn **Ứng dụng** là `Codex` rồi nhập chỉ với một cú nhấp, địa chỉ sẽ tự động có `/v1`.

:::tip Giữ cấu hình có hiệu lực lâu dài
Ghi các câu lệnh `export` ở trên vào các tệp cấu hình shell như `~/.bashrc`, `~/.zshrc`, sau đó mở một terminal mới.
:::

## Mô hình đề xuất

- `gpt-4.1`
- `gpt-4o-mini`

Tên mô hình căn cứ vào các mô hình khả dụng cho nhóm bạn đã chọn trên [Quảng trường mô hình](/pricing).

## Câu hỏi thường gặp

| Hiện tượng                                 | Nguyên nhân                                                                | Cách khắc phục                                                                                                |
| ------------------------------------------ | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 401                                        | Terminal hiện tại chưa thiết lập `OPENAI_API_KEY`                          | Thiết lập trong cùng cửa sổ terminal, hoặc ghi vào tệp cấu hình shell rồi mở terminal mới                     |
| Yêu cầu vẫn được gửi đến OpenAI chính thức | `OPENAI_BASE_URL` chưa có hiệu lực, hoặc bị cấu hình khác ghi đè           | Chạy `echo $OPENAI_BASE_URL` để kiểm tra giá trị, rà soát các thiết lập xung đột trong script khởi động shell |
| model not found                            | Tên mô hình không khớp với các mô hình thực sự khả dụng trong nhóm đã chọn | Chọn từ các mô hình đề xuất, hoặc xem danh sách khả dụng trên Quảng trường mô hình                            |

## Dùng thử ngay

Muốn xác nhận trước khóa và mô hình có dùng được không, bạn có thể gửi thẳng một tin nhắn trong [Sân chơi](/playground).
