---
title: Tạo ảnh
description: Tạo và chỉnh sửa ảnh qua API Images tương thích OpenAI.
---

API ảnh có định dạng giống với OpenAI Images API.

## Tạo ảnh

`POST /v1/images/generations`

```bash
curl {{BASE_URL}}/v1/images/generations \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-image-1",
    "prompt": "Một chú mèo cam đang tắm nắng trên bậu cửa sổ, phong cách màu nước",
    "size": "1024x1024",
    "n": 1
  }'
```

Các tham số thường dùng:

| Tham số           | Mô tả                                                                         |
| ----------------- | ----------------------------------------------------------------------------- |
| `model`           | Tên mô hình tạo ảnh, căn cứ theo Quảng trường mô hình                         |
| `prompt`          | Mô tả hình ảnh                                                                |
| `size`            | Kích thước ảnh, ví dụ `1024x1024`, các giá trị khả dụng tùy thuộc vào mô hình |
| `n`               | Số ảnh tạo ra, tối đa 128 ảnh mỗi lần, giới hạn thực tế tùy thuộc vào mô hình |
| `response_format` | `url` hoặc `b64_json`, một số mô hình chỉ hỗ trợ một trong hai                |

## Chỉnh sửa ảnh

`POST /v1/images/edits`

Tải lên ảnh gốc và mô tả dưới dạng `multipart/form-data`:

```bash
curl {{BASE_URL}}/v1/images/edits \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -F model="gpt-image-1" \
  -F image="@input.png" \
  -F prompt="Đổi nền thành cảnh hoàng hôn trên biển"
```

## Tính phí

Mô hình tạo ảnh có thể tính phí theo lần hoặc theo token, khi tạo nhiều ảnh trong một lần thì chi phí được cộng dồn theo số ảnh. Giá cụ thể xem tại [Quảng trường mô hình](/pricing), quy tắc tính phí xem tại [Giải thích tính phí](/pricing).

:::tip
Liên kết ảnh trả về ở dạng `url` thường có thời hạn hiệu lực, ảnh cần lưu lâu dài vui lòng tải xuống kịp thời.
:::

Tên mô hình xuất hiện trong bài chỉ là ví dụ, các mô hình thực sự khả dụng căn cứ theo [Quảng trường mô hình](/pricing).
