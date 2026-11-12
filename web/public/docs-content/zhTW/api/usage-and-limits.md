---
title: 用量查詢與請求限制
description: 如何查看單次請求的 token 與費用，以及控制台和介面的請求頻率限制。
---

本頁說明兩件事：怎樣查到某一次請求具體消耗了多少，以及 {{SYSTEM_NAME}} 上適用的請求頻率限制。

## 查看單次請求的用量

### 在主控台查看

開啟 [使用日誌](/usage-logs/common)，每一列對應一次介面呼叫。

| 欄位               | 說明                                                               |
| ------------------ | ------------------------------------------------------------------ |
| Tokens             | 顯示為 `輸入 / 輸出`。使用了快取時，下方會列出快取讀取和寫入的數量 |
| 費用               | 本次請求實際扣除的金額，依站點顯示的幣別                           |
| 模型 / 金鑰 / 分組 | 這次請求使用了哪個模型、哪個 API 金鑰、哪個分組                    |
| 耗時               | 請求耗時（秒），以及是否為串流回傳                                 |

點擊任一列進入詳情，可以看到計費方式、使用的單價、可計費 token 的拆分以及快取命中情況。

### 依請求 ID 查詢

每次介面呼叫的回應標頭都會帶上請求識別碼：

```http
X-Oneapi-Request-Id: <請求 ID>
```

用它可以取回這一筆記錄：

```bash
curl {{BASE_URL}}/api/log/self?request_id=REQUEST_ID \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

`request_id` 唯一，因此 `data.items` 通常只有一筆：

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

此介面需要登入狀態或帳號頁產生的存取權杖，`sk-` 開頭的 API 金鑰無法呼叫，請改用下方的方式。

### 只有 API 金鑰時

如果手上只有金鑰、沒有登入帳號：

```bash
curl {{BASE_URL}}/api/log/token \
  -H "Authorization: Bearer YOUR_API_KEY"
```

此介面回傳該金鑰**最近 1000 筆**記錄，不支援依 `request_id` 過濾，需要自行拿回應標頭裡的 `X-Oneapi-Request-Id` 去比對。

### 把額度換算成金額

幾個需要了解的欄位：

| 欄位                | 說明                                   |
| ------------------- | -------------------------------------- |
| `prompt_tokens`     | 輸入 token 數                          |
| `completion_tokens` | 輸出 token 數                          |
| `quota`             | 本次扣費，內部額度單位                 |
| `use_time`          | 耗時（秒）                             |
| `type`              | `2` 消費，`1` 加值，`5` 錯誤，`6` 退款 |

頁面會自動換算 `quota`，換算關係是：

```text
金額（美元） = quota / 500000
顯示金額 = 金額（美元）× 站點匯率
```

例如 `quota = 1450` 對應 `0.0029` 美元。命中的快取輸入通常以更低的單價計費，實際單價以詳情頁為準。

:::tip
如果只需要 token 數量，不必呼叫日誌介面：非串流回應的 `usage` 欄位就有；串流請求加上 `"stream_options": {"include_usage": true}`，最後一個 chunk 會帶上 `usage`。實際扣費金額只能從日誌取得。
:::

## 請求頻率限制

### 主控台與介面的限制

| 場景                                                   | 計數維度         | 時間視窗 | 上限   |
| ------------------------------------------------------ | ---------------- | -------- | ------ |
| 主控台介面呼叫                                         | IP               | 180 秒   | 360 次 |
| 主控台頁面瀏覽                                         | IP               | 180 秒   | 120 次 |
| 敏感操作（登入、註冊、找回密碼、付款、綁定信箱或手機） | IP               | 1200 秒  | 20 次  |
| 敏感操作                                               | 帳號，依操作類型 | 1200 秒  | 20 次  |
| 搜尋（金鑰、日誌）                                     | 帳號             | 60 秒    | 10 次  |
| 信箱驗證碼                                             | IP               | 30 秒    | 2 次   |

幾點說明：

- 以上為站點預設值，可能依營運需要調整，以實際回傳為準。
- 日誌查詢的時間跨度最長 365 天，每頁最多回傳 100 筆（預設 10 筆）。
- 依 IP 計數的限制由同一網路出口下的所有人共用，例如同一個辦公室或同一台雲端主機。

對話、向量、圖像等模型介面依餘額計費，不受上表的請求筆數限制。API 金鑰層面沒有個別的每分鐘請求配額；如需節流，請在自己的用戶端控制。

### 觸發限制時

請求會以 HTTP 429 被拒絕，並帶有單位為秒的 `Retry-After` 回應標頭：

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 47
```

等待相應秒數後再重試；立即重試會繼續消耗視窗額度並延長封鎖時間。

```python
import time, requests

resp = requests.post(url, headers=headers, json=payload)
if resp.status_code == 429:
    time.sleep(int(resp.headers.get("Retry-After", 60)))
    resp = requests.post(url, headers=headers, json=payload)
```

如果懷疑某次請求被重複扣費，先在日誌裡確認是否有兩筆 `request_id` 相同的記錄，如有請攜帶該識別碼聯絡站點管理員。
