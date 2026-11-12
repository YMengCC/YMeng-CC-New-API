---
title: Bắt đầu nhanh
description: 5 bước để đăng ký, nạp tiền, tạo khóa API, cấu hình ứng dụng khách và thực hiện lần gọi đầu tiên.
---

Trang này hướng dẫn bạn đi hết một quy trình hoàn chỉnh từ đầu: **Đăng ký → Nạp tiền → Tạo khóa API → Cấu hình ứng dụng khách → Gọi lần đầu**. Toàn bộ chỉ mất vài phút.

:::info Hãy ghi nhớ hai thông tin sau
- **Base URL**: `{{BASE_URL}}/v1` (dùng cho ứng dụng khách và SDK tương thích OpenAI)
- **Xác thực**: header `Authorization: Bearer khóa API của bạn`
:::

## Bước 1: Đăng ký tài khoản

Mở [trang đăng ký](/sign-up), điền tên người dùng và mật khẩu để hoàn tất đăng ký. Nếu trang web hỗ trợ các phương thức đăng nhập khác như email, GitHub, bạn cũng có thể dùng trực tiếp.

![Trang đăng ký](/docs-assets/quick-start/vi/step-1-sign-up.png 'Trang đăng ký')

## Bước 2: Nạp tiền

Sau khi đăng nhập, nhấp vào **Điểm** ở menu bên trái để vào [trang Ví](/wallet). Trong khu vực "Thêm Tiền", chọn một mức tiền có sẵn hoặc nhập số tiền tùy chỉnh, sau đó chọn phương thức thanh toán để hoàn tất. Nếu bạn có mã đổi thưởng, bạn cũng có thể đổi ngay trên trang này.

![Khu vực nạp tiền trên trang Ví](/docs-assets/quick-start/vi/step-2-top-up.png 'Chọn số tiền và phương thức thanh toán trong mục Thêm Tiền')

:::tip
Số dư nạp vào không bao giờ hết hạn. Các mức tiền, phương thức thanh toán và số tiền nạp tối thiểu cụ thể được hiển thị trên trang. Quy tắc tính phí xem tại [Giải thích tính phí](/pricing).
:::

## Bước 3: Tạo khóa API

Vào trang [Khóa API](/keys), nhấp **Tạo Khóa API** ở góc trên bên phải:

1. **Tên**: điền tùy ý để bạn dễ phân biệt mục đích sử dụng, ví dụ `my-first-key`.
2. **Nhóm**: nhóm quyết định khóa này có thể gọi những mô hình nào và tính phí theo hệ số nào. Danh sách thả xuống sẽ hiển thị hệ số của từng nhóm và nhóm đó có hỗ trợ phiếu quà tặng hay không.
3. **Thời gian hết hạn**, **Hạn ngạch**: giữ mặc định là được (không bao giờ hết hạn, hạn ngạch không giới hạn); chỉ thiết lập khi bạn cần kiểm soát rủi ro.
4. Nhấp **Lưu Thay đổi**.

![Tạo khóa API](/docs-assets/quick-start/vi/step-3-create-key.png 'Điền tên và chọn nhóm')

:::warning Hãy bảo quản khóa API như mật khẩu
Khóa có thể trực tiếp tiêu số dư của bạn. Đừng gửi khóa vào nhóm chat, ảnh chụp màn hình hoặc kho mã công khai; nếu khóa bị lộ, hãy lập tức vô hiệu hóa hoặc xóa khóa đó trong danh sách rồi tạo khóa mới.
:::

## Bước 4: Cấu hình ứng dụng khách

Trong danh sách khóa, nhấp biểu tượng sao chép bên cạnh khóa, hoặc nhấp menu **⋯** bên phải và chọn **Sao chép khóa**. Cùng menu này còn có:

- **CC Switch**: nhập khóa vào CC Switch chỉ với một cú nhấp, phù hợp với người dùng Claude Code.
- **Trò chuyện**: mở trực tiếp trong ứng dụng chat đã được tích hợp.

![Menu thao tác với khóa](/docs-assets/quick-start/vi/step-4-key-menu.png 'Sao chép khóa hoặc nhập vào ứng dụng khách chỉ với một cú nhấp')

Sau đó điền hai mục trong ứng dụng khách:

| Loại ứng dụng khách                                              | Địa chỉ (Base URL / API Host)     | Khóa             |
| ---------------------------------------------------------------- | --------------------------------- | ---------------- |
| Ứng dụng khách tương thích OpenAI (Cherry Studio, ChatBox, v.v.) | `{{BASE_URL}}/v1`                 | Khóa API của bạn |
| Claude Code                                                      | `{{BASE_URL}}` (không thêm `/v1`) | Khóa API của bạn |

:::danger Lỗi phổ biến nhất: địa chỉ thừa hoặc thiếu /v1
Ứng dụng khách tương thích OpenAI thường cần có `/v1`, còn Claude Code thì **không được** có `/v1`. Một số ứng dụng khách tự động thêm `/v1`, khi đó chỉ cần điền `{{BASE_URL}}`. Không thêm dấu gạch chéo ở cuối địa chỉ. Cách điền cụ thể cho từng ứng dụng khách xem tại [Kết nối ứng dụng khách](/docs/clients/cherry-studio).
:::

## Bước 5: Thực hiện lần gọi đầu tiên

Thay `YOUR_API_KEY` trong lệnh dưới đây bằng khóa của bạn, rồi chạy trong terminal:

```bash
curl {{BASE_URL}}/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [{ "role": "user", "content": "Xin chào, đây là lần gọi đầu tiên của tôi" }]
  }'
```

Nếu kết quả trả về có trường `choices` nghĩa là kết nối đã thành công. Tên mô hình vui lòng căn cứ vào các mô hình khả dụng cho nhóm bạn đã chọn trên [Quảng trường mô hình](/pricing).

Nếu không muốn dùng dòng lệnh, bạn có thể mở [Sân chơi](/playground), chọn mô hình rồi gửi tin nhắn để thử trực tiếp.

![Thử nghiệm trong Sân chơi](/docs-assets/quick-start/vi/step-5-playground.png 'Gửi tin nhắn đầu tiên trong Sân chơi')

## Bước tiếp theo

- Tìm hiểu cách tính phí: [Giải thích tính phí](/pricing)
- Cấu hình kết nối cho các ứng dụng khách phổ biến: [Cherry Studio](/docs/clients/cherry-studio), [Claude Code](/docs/clients/claude-code)
- Gọi từ mã nguồn: [Tổng quan API](/docs/api/overview)
- Gặp lỗi: [Lỗi thường gặp](/docs/faq/errors)
