---
title: Lượng dùng và giới hạn yêu cầu
description: Cách xem token và chi phí của một yêu cầu, cùng giới hạn tần suất cho bảng điều khiển và API.
---

Trang này trình bày hai việc: làm sao biết một yêu cầu cụ thể đã tiêu tốn bao nhiêu, và những giới hạn tần suất yêu cầu đang áp dụng trên {{SYSTEM_NAME}}.

## Xem lượng dùng của một yêu cầu

### Trên bảng điều khiển

Mở [Nhật ký sử dụng](/usage-logs/common), mỗi dòng ứng với một lần gọi API.

| Cột                   | Ý nghĩa                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------- |
| Tokens                | Hiển thị dạng `đầu vào / đầu ra`. Nếu dùng bộ nhớ đệm, bên dưới có số đọc và ghi bộ nhớ đệm |
| Chi phí               | Số tiền thực tế bị trừ cho yêu cầu này, theo đơn vị tiền tệ của trang                       |
| Mô hình / Khóa / Nhóm | Mô hình, khóa API và nhóm đã xử lý yêu cầu                                                  |
| Thời gian             | Thời lượng tính bằng giây và có phải dạng luồng hay không                                   |

Bấm vào một dòng để xem chi tiết: cách tính phí, đơn giá đã áp dụng, phân tách token tính phí và tình trạng bộ nhớ đệm.

### Theo mã yêu cầu

Mỗi phản hồi API đều có mã định danh trong header:

```http
X-Oneapi-Request-Id: <mã yêu cầu>
```

Dùng mã này để lấy bản ghi của đúng yêu cầu đó:

```bash
curl {{BASE_URL}}/api/log/self?request_id=REQUEST_ID \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

`request_id` là duy nhất nên `data.items` thường chỉ có một bản ghi:

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "created_at": 1761177600,
        "type": 2,
        "model_name": "claude-sonnet-5-5",
        "token_name": "my-key",
        "group": "default",
        "prompt_tokens": 1520,
        "completion_tokens": 380,
        "quota": 1450,
        "use_time": 3,
        "is_stream": true,
        "request_id": "20261023xxxxxxxx"
      }
    ],
    "total": 1
  }
}
```

Endpoint này cần phiên đăng nhập hoặc mã truy cập tạo từ trang tài khoản. Khóa API bắt đầu bằng `sk-` không gọi được, hãy dùng cách bên dưới.

### Khi chỉ có khóa API

Nếu chỉ có khóa mà không đăng nhập:

```bash
curl {{BASE_URL}}/api/log/token \
  -H "Authorization: Bearer YOUR_API_KEY"
```

Endpoint này trả về **1000 bản ghi gần nhất** của khóa đó. Nó không hỗ trợ lọc theo `request_id`, nên bạn phải tự đối chiếu với header `X-Oneapi-Request-Id` đã nhận.

### Quy đổi hạn mức thành số tiền

Các trường cần biết:

| Trường              | Ý nghĩa                                             |
| ------------------- | --------------------------------------------------- |
| `prompt_tokens`     | Số token đầu vào                                    |
| `completion_tokens` | Số token đầu ra                                     |
| `quota`             | Số tiền trừ cho yêu cầu này, theo đơn vị nội bộ     |
| `use_time`          | Thời lượng tính bằng giây                           |
| `type`              | `2` tiêu dùng, `1` nạp tiền, `5` lỗi, `6` hoàn tiền |

Trang tự động quy đổi `quota`. Quan hệ quy đổi là:

```text
số tiền (USD) = quota / 500000
số tiền hiển thị = số tiền (USD) × tỷ giá của trang
```

Ví dụ `quota = 1450` tương ứng `0,0029` USD. Phần đầu vào trúng bộ nhớ đệm thường được tính đơn giá thấp hơn; đơn giá chính xác nằm trong trang chi tiết.

:::tip
Nếu chỉ cần số token thì không phải gọi nhật ký: phản hồi không dạng luồng có sẵn đối tượng `usage`; với dạng luồng, thêm `"stream_options": {"include_usage": true}` và chunk cuối sẽ mang `usage`. Số tiền thực trừ chỉ có từ nhật ký.
:::

## Giới hạn tần suất yêu cầu

### Bảng điều khiển và API

| Phạm vi                                                                                              | Đếm theo                      | Khung thời gian | Giới hạn    |
| ---------------------------------------------------------------------------------------------------- | ----------------------------- | --------------- | ----------- |
| Gọi API của bảng điều khiển                                                                          | IP                            | 180 giây        | 360 yêu cầu |
| Xem trang bảng điều khiển                                                                            | IP                            | 180 giây        | 120 yêu cầu |
| Thao tác nhạy cảm (đăng nhập, đăng ký, đặt lại mật khẩu, thanh toán, liên kết email hoặc điện thoại) | IP                            | 1200 giây       | 20 yêu cầu  |
| Thao tác nhạy cảm                                                                                    | Tài khoản, theo loại thao tác | 1200 giây       | 20 yêu cầu  |
| Tìm kiếm (khóa, nhật ký)                                                                             | Tài khoản                     | 60 giây         | 10 yêu cầu  |
| Mã xác minh email                                                                                    | IP                            | 30 giây         | 2 yêu cầu   |

Vài lưu ý:

- Đây là giá trị mặc định của trang, có thể được điều chỉnh theo vận hành; phản hồi thực tế là căn cứ.
- Nhật ký tra cứu tối đa 365 ngày, mỗi trang trả về tối đa 100 dòng (mặc định 10).
- Giới hạn theo IP được chia sẻ cho mọi người dùng chung một đầu ra mạng, ví dụ cùng một văn phòng hoặc cùng một máy chủ cloud.

Các lời gọi mô hình (chat, embeddings, hình ảnh) tính phí theo số dư, không chịu giới hạn số yêu cầu ở bảng trên. Khóa API không có hạn mức riêng "số yêu cầu mỗi phút"; nếu cần hãy tự điều tiết ở phía ứng dụng của bạn.

### Khi chạm giới hạn

Yêu cầu bị từ chối với HTTP 429 kèm header `Retry-After` tính bằng giây:

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 47
```

Hãy chờ đúng số giây đó rồi thử lại; thử lại ngay sẽ tiếp tục tiêu hao hạn mức trong khung và kéo dài thời gian chặn.

```python
import time, requests

resp = requests.post(url, headers=headers, json=payload)
if resp.status_code == 429:
    time.sleep(int(resp.headers.get("Retry-After", 60)))
    resp = requests.post(url, headers=headers, json=payload)
```

Nếu nghi ngờ một yêu cầu bị trừ tiền hai lần, trước tiên hãy kiểm tra trong nhật ký xem có hai bản ghi cùng `request_id` không, nếu có hãy liên hệ quản trị viên trang web kèm mã đó.
