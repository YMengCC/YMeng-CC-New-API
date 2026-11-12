---
title: Câu hỏi thường gặp
description: Các thắc mắc thường gặp về tài khoản, số dư, khóa và mô hình.
---

## Số dư có hết hạn không?

Số dư có được từ nạp tiền và đổi mã không hết hạn. Phiếu quà tặng và hạn mức thành viên có thể có thời hạn, căn cứ theo mô tả riêng của từng loại. Chi tiết xem tại [Nạp tiền và phiếu quà tặng](/wallet).

## Vì sao số dư bị trừ ít hơn số tiền trong nhật ký sử dụng?

Nhật ký sử dụng ghi lại **toàn bộ chi phí** của mỗi yêu cầu. Nếu một phần của yêu cầu được khấu trừ bằng phiếu quà tặng, số dư chỉ bị trừ phần còn lại, nên hai con số sẽ chênh lệch, đây là điều bình thường.

## Nên chọn nhóm như thế nào?

Nhóm quyết định những mô hình có thể gọi và hệ số tính phí. Khi tạo khóa, danh sách thả xuống chọn nhóm sẽ hiển thị hệ số của từng nhóm, hệ số sau chiết khấu thành viên và nhóm đó có hỗ trợ phiếu quà tặng hay không. Nhìn chung:

- Muốn dùng một mô hình cụ thể: trước tiên xem trên [Quảng trường mô hình](/pricing) mô hình đó khả dụng trong những nhóm nào;
- Muốn dùng phiếu quà tặng: chọn nhóm được ghi rõ "hỗ trợ phiếu quà tặng";
- Muốn tiết kiệm: chọn nhóm có hệ số thấp hơn trong số các nhóm khả dụng.

## Hỗ trợ những mô hình nào?

Toàn bộ mô hình khả dụng và giá của chúng đều được liệt kê trên [Quảng trường mô hình](/pricing), bạn cũng có thể lấy qua [API danh sách mô hình](/docs/api/models-and-pricing). Các mô hình được cập nhật liên tục.

## Một tài khoản có thể tạo nhiều khóa không?

Có. Bạn nên tạo khóa riêng theo từng mục đích, ví dụ một khóa cho Claude Code, một khóa cho ứng dụng của bạn, để tiện xem mức sử dụng, giới hạn hoặc vô hiệu hóa riêng.

## Khóa bị lộ thì phải làm sao?

Ngay lập tức vào trang [Khóa API](/keys) để vô hiệu hóa hoặc xóa khóa đó, sau đó tạo một khóa mới. Bạn có thể kiểm tra các lệnh gọi bất thường trong [Nhật ký sử dụng](/usage-logs/common).

## Làm sao xem mỗi lần gọi tốn bao nhiêu tiền?

Mở [Nhật ký sử dụng](/usage-logs/common), bạn có thể xem thời gian, mô hình, số token và số tiền bị trừ của từng yêu cầu.

## Yêu cầu chậm hoặc bị quá thời gian thì phải làm sao?

1. Trước tiên thử cùng mô hình đó trong [Sân chơi](/playground) để xác nhận có phải do bản thân mô hình phản hồi chậm hay không;
2. Kiểm tra mạng cục bộ, thử đổi sang mạng khác;
3. Đổi sang nhóm khác, mỗi nhóm có tuyến khác nhau;
4. Nếu vẫn gặp vấn đề, hãy liên hệ quản trị viên trang web và cung cấp request id.

## Nhận hỗ trợ ở đâu?

- Xem [Lỗi thường gặp](/docs/faq/errors) để tự khắc phục;
- Liên hệ quản trị viên trang web và cung cấp ID người dùng của bạn trên trang web.
