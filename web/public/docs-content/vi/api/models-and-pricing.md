---
title: Mô hình và giá
description: Lấy danh sách mô hình khả dụng và giá công khai qua API.
---

## Danh sách mô hình

`GET /v1/models`

Trả về các mô hình mà khóa API hiện tại có thể gọi:

```bash
curl {{BASE_URL}}/v1/models \
  -H "Authorization: Bearer YOUR_API_KEY"
```

API sẽ tự động trả về định dạng tương ứng dựa trên header của yêu cầu:

| Header yêu cầu                    | Định dạng trả về    |
| --------------------------------- | ------------------- |
| `Authorization: Bearer ...`       | Định dạng OpenAI    |
| `x-api-key` + `anthropic-version` | Định dạng Anthropic |
| `x-goog-api-key` hoặc `?key=`     | Định dạng Gemini    |

Truy vấn một mô hình: `GET /v1/models/{model}`.

## Giá

`GET /api/pricing`

Trả về thông tin giá công khai của tất cả mô hình, trang [Quảng trường mô hình](/pricing) cũng dùng API này. Không cần khóa API; nếu trang web thiết lập chỉ cho xem Quảng trường mô hình sau khi đăng nhập thì bạn cần đăng nhập trước.

```bash
curl {{BASE_URL}}/api/pricing
```

Các trường chính của mỗi mô hình trong mảng `data`:

| Trường             | Mô tả                                                              |
| ------------------ | ------------------------------------------------------------------ |
| `model_name`       | Tên mô hình                                                        |
| `quota_type`       | Phương thức tính phí: `0` là tính theo lượng, `1` là tính theo lần |
| `model_ratio`      | Hệ số mô hình (dùng khi tính theo lượng)                           |
| `completion_ratio` | Bội số giá của đầu ra so với đầu vào                               |
| `model_price`      | Giá mỗi lần (dùng khi tính theo lần)                               |
| `enable_groups`    | Các nhóm có thể dùng mô hình này                                   |

:::tip
Xem trực tiếp trên [Quảng trường mô hình](/pricing) sẽ trực quan hơn: trang đã quy đổi hệ số thành giá cho mỗi triệu token và có thể lọc theo nhóm.
:::
