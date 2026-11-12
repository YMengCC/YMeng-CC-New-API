---
title: Usage & Request Limits
description: How to view the tokens and cost of a single request, and the rate limits that apply to the console and API.
---

This page covers two things: how to find out what one specific request consumed, and which request frequency limits apply on {{SYSTEM_NAME}}.

## Checking the usage of a single request

### In the console

Open [Usage Logs](/usage-logs/common). Each row is one API call.

| Column              | Meaning                                                                                               |
| ------------------- | ----------------------------------------------------------------------------------------------------- |
| Tokens              | Shown as `input / output`. Cache reads and writes are listed underneath when the request used a cache |
| Cost                | The amount actually charged for this request, in the currency shown on the site                       |
| Model / Key / Group | Which model, which API key, and which group handled the request                                       |
| Timing              | Duration in seconds, and whether the response was streamed                                            |

Click a row for the detail view: billing mode, the unit price used, the billable token breakdown, and cache hits.

### By request ID

Every API response carries a request identifier in its header:

```http
X-Oneapi-Request-Id: <request id>
```

Query that identifier to retrieve the log entry for that one request:

```bash
curl {{BASE_URL}}/api/log/self?request_id=REQUEST_ID \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

`request_id` is unique, so `data.items` normally contains a single entry:

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

This endpoint needs a signed-in session or an access token from the account page. An `sk-` API key cannot call it; use the method below instead.

### With an API key only

If you only have a key and no sign-in:

```bash
curl {{BASE_URL}}/api/log/token \
  -H "Authorization: Bearer YOUR_API_KEY"
```

This returns the **most recent 1000 entries** for that key. It does not accept a `request_id` filter, so match the value yourself against the `X-Oneapi-Request-Id` header you received.

### Converting quota to an amount

Log fields worth knowing:

| Field               | Meaning                                            |
| ------------------- | -------------------------------------------------- |
| `prompt_tokens`     | Input tokens                                       |
| `completion_tokens` | Output tokens                                      |
| `quota`             | Amount charged for this request, in internal units |
| `use_time`          | Duration in seconds                                |
| `type`              | `2` consume, `1` top-up, `5` error, `6` refund     |

`quota` is converted for you on the page. The underlying relation is:

```text
amount (USD) = quota / 500000
displayed amount = amount (USD) × site exchange rate
```

For example, `quota = 1450` is `0.0029` USD. Cached input is usually billed at a lower unit price; the exact price is shown in the detail view.

:::tip
If you only need token counts, you do not have to call the log endpoint. Non-streaming responses include a `usage` object; for streaming, add `"stream_options": {"include_usage": true}` and the final chunk carries `usage`. The charged amount is only available from the logs.
:::

## Request rate limits

### Limits on the console and API

| Where                                                                                    | Counted per              | Window       | Limit        |
| ---------------------------------------------------------------------------------------- | ------------------------ | ------------ | ------------ |
| Console API calls                                                                        | IP                       | 180 seconds  | 360 requests |
| Console pages                                                                            | IP                       | 180 seconds  | 120 requests |
| Sensitive actions (sign-in, sign-up, password reset, payment, binding an email or phone) | IP                       | 1200 seconds | 20 requests  |
| Sensitive actions                                                                        | Account, per action type | 1200 seconds | 20 requests  |
| Search (keys, logs)                                                                      | Account                  | 60 seconds   | 10 requests  |
| Email verification codes                                                                 | IP                       | 30 seconds   | 2 requests   |

A few notes:

- These are the site defaults and may be tuned for operations; the response you get is authoritative.
- Log queries reach back at most 365 days, and a page returns at most 100 rows (10 by default).
- IP-based limits are shared by everyone behind the same network egress, such as one office or one cloud host.

Calls to chat, embedding, image, and other model endpoints are metered by balance, not by the request counts above. There is no separate per-minute request quota on an API key; throttle in your own client if you need to.

### When a limit is hit

The request is rejected with HTTP 429 and a `Retry-After` header in seconds:

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 47
```

Wait for that many seconds before retrying; retrying immediately keeps consuming the window and lengthens the block.

```python
import time, requests

resp = requests.post(url, headers=headers, json=payload)
if resp.status_code == 429:
    time.sleep(int(resp.headers.get("Retry-After", 60)))
    resp = requests.post(url, headers=headers, json=payload)
```

If a charge looks duplicated, check whether the logs hold two rows with the same `request_id`, and if so contact the site administrator with that identifier.
