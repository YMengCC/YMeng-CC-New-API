---
title: Lỗi thường gặp
description: Các lỗi thường gặp được sắp xếp theo mã trạng thái, kèm nguyên nhân và cách khắc phục.
---

Khi gọi thất bại, trước tiên hãy xem mã trạng thái HTTP và `message` được trả về, sau đó đối chiếu với các bảng dưới đây để khắc phục. Thông báo lỗi sẽ hiển thị bằng tiếng Trung hoặc tiếng Anh tùy theo ngôn ngữ của yêu cầu.

## 401: Vấn đề về khóa

| Thông báo lỗi      | Nguyên nhân                                                                | Cách khắc phục                                                         |
| ------------------ | -------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Token not provided | Header của yêu cầu không có khóa API                                       | Kiểm tra xem đã thiết lập `Authorization: Bearer YOUR_API_KEY` chưa    |
| Invalid token      | Khóa không tồn tại, đã hết hạn, đã dùng hết hạn mức hoặc đã bị vô hiệu hóa | Kiểm tra trạng thái khóa trên trang [Khóa API](/keys), tạo lại khi cần |

:::tip
Mọi vấn đề liên quan đến khóa đều được thông báo chung là "Invalid token", không có thông báo riêng "đã hết hạn". Khi kiểm tra, hãy lần lượt xem khóa có đang bật không, có hết hạn không, hạn mức của khóa đã dùng hết chưa.
:::

## 403: Không đủ quyền hoặc số dư

| Thông báo lỗi                                                                                        | Nguyên nhân                                                                                             | Cách khắc phục                                                        |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 用户额度不足 / 预扣费额度失败 (hạn mức người dùng không đủ / tạm trừ hạn mức thất bại)               | Số dư tài khoản không đủ để thanh toán yêu cầu này                                                      | Nạp tiền tại [Ví](/wallet)                                            |
| token quota is not enough                                                                            | Hạn mức được thiết lập cho chính khóa đã dùng hết                                                       | Chỉnh sửa khóa để tăng hạn mức, hoặc đổi thành hạn mức không giới hạn |
| 订阅额度不足或未配置订阅 (hạn mức gói thành viên không đủ hoặc chưa có gói thành viên)               | Tùy chọn tính phí là "Chỉ dùng thành viên", nhưng hạn mức thành viên đã hết hoặc chưa có gói thành viên | Thay đổi tùy chọn tính phí, xem [Gói thành viên](/subscriptions)      |
| This token has no access to model xxx                                                                | Khóa đã thiết lập giới hạn mô hình và không bao gồm mô hình này                                         | Chỉnh sửa "Giới hạn Mô hình" của khóa, hoặc dùng khóa khác            |
| 无权访问 xxx 分组 (không có quyền truy cập nhóm xxx)                                                 | Tài khoản hiện tại không thể dùng nhóm này                                                              | Chỉnh sửa khóa và đổi sang một nhóm khả dụng                          |
| 分组 xxx 已被弃用 (nhóm xxx đã ngừng sử dụng)                                                        | Nhóm này đã bị ngừng                                                                                    | Chỉnh sửa khóa và đổi sang một nhóm khả dụng                          |
| 您的 IP 不在令牌允许访问的列表中 (IP của bạn không nằm trong danh sách được phép truy cập của token) | Khóa đã thiết lập danh sách IP cho phép                                                                 | Thêm IP hiện tại vào danh sách cho phép, hoặc xóa trống danh sách     |
| User has been banned                                                                                 | Tài khoản đã bị đình chỉ                                                                                | Liên hệ quản trị viên trang web                                       |

## 400: Tham số yêu cầu không đúng

| Thông báo lỗi                                        | Nguyên nhân                          | Cách khắc phục          |
| ---------------------------------------------------- | ------------------------------------ | ----------------------- |
| Model name not specified, model name cannot be empty | Thân yêu cầu không có trường `model` | Bổ sung tham số `model` |

Các lỗi 400 khác thường đến từ việc upstream kiểm tra tham số, vui lòng điều chỉnh tham số theo `message`.

## 429: Yêu cầu quá thường xuyên

| Thông báo lỗi                                                                                                           | Nguyên nhân                                         | Cách khắc phục                                                                              |
| ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| You have reached the request limit                                                                                      | Vượt quá giới hạn tần suất yêu cầu của mô hình      | Giảm tần suất yêu cầu rồi thử lại                                                           |
| 请求次数已达到当前会员套餐的窗口上限 (số lần yêu cầu đã đạt giới hạn trong khung thời gian của gói thành viên hiện tại) | Vượt quá giới hạn số lần yêu cầu của gói thành viên | Chờ khung thời gian được đặt lại, header phản hồi `Retry-After` sẽ cho biết số giây cần chờ |
| 并发请求数已达到当前套餐上限 (số yêu cầu đồng thời đã đạt giới hạn của gói hiện tại)                                    | Có quá nhiều yêu cầu chạy cùng lúc                  | Giảm số yêu cầu đồng thời, hoặc nâng cấp lên gói thành viên cao hơn                         |
| (Thân phản hồi rỗng)                                                                                                    | Kích hoạt giới hạn tần suất toàn trang              | Chờ theo `Retry-After` rồi thử lại                                                          |

## 503: Tạm thời không có tuyến khả dụng

| Thông báo lỗi                                      | Nguyên nhân                                                                             | Cách khắc phục                                                                                                                               |
| -------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| No available channel for model xxx under group xxx | Nhóm này tạm thời không có tuyến nào cung cấp mô hình này, hoặc tên mô hình bị viết sai | Kiểm tra chính tả tên mô hình; vào [Quảng trường mô hình](/pricing) để xác nhận mô hình khả dụng trong nhóm của bạn; hoặc đổi sang nhóm khác |

## Vẫn chưa giải quyết được?

Hãy ghi lại **request id** trong thông tin trả về và liên hệ quản trị viên trang web kèm mã đó để nhanh chóng xác định vấn đề.
