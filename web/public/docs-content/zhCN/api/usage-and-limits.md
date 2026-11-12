---
title: 用量查询与请求限制
description: 如何查看单次请求的 token 与费用，以及控制台和接口的请求频率限制。
---

本页说明两件事：怎样查到某一次请求具体消耗了多少，以及 {{SYSTEM_NAME}} 上适用的请求频率限制。

## 查看单次请求的用量

### 在控制台查看

打开 [使用日志](/usage-logs/common)，每一行对应一次接口调用。

| 列                 | 说明                                                               |
| ------------------ | ------------------------------------------------------------------ |
| Tokens             | 显示为 `输入 / 输出`。使用了缓存时，下方会列出缓存读取和写入的数量 |
| 费用               | 本次请求实际扣除的金额，按站点显示的币种                           |
| 模型 / 密钥 / 分组 | 这次请求使用了哪个模型、哪个 API 密钥、哪个分组                    |
| 耗时               | 请求耗时（秒），以及是否为流式返回                                 |

点击任意一行进入详情，可以看到计费方式、使用的单价、可计费 token 的拆分以及缓存命中情况。

### 按请求 ID 查询

每次接口调用的响应头里都会带上请求标识：

```http
X-Oneapi-Request-Id: <请求 ID>
```

用它可以取回这一条记录：

```bash
curl {{BASE_URL}}/api/log/self?request_id=REQUEST_ID \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

`request_id` 唯一，因此 `data.items` 通常只有一条：

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

该接口需要登录状态或账号页生成的访问令牌，`sk-` 开头的 API 密钥不能调用，请改用下面的方式。

### 只有 API 密钥时

如果手上只有密钥、没有登录账号：

```bash
curl {{BASE_URL}}/api/log/token \
  -H "Authorization: Bearer YOUR_API_KEY"
```

这个接口返回该密钥**最近 1000 条**记录，不支持按 `request_id` 过滤，需要自己拿响应头里的 `X-Oneapi-Request-Id` 去匹配。

### 把额度换算成金额

几个需要了解的字段：

| 字段                | 含义                                   |
| ------------------- | -------------------------------------- |
| `prompt_tokens`     | 输入 token 数                          |
| `completion_tokens` | 输出 token 数                          |
| `quota`             | 本次扣费，内部额度单位                 |
| `use_time`          | 耗时（秒）                             |
| `type`              | `2` 消费，`1` 充值，`5` 错误，`6` 退款 |

页面会自动换算 `quota`，换算关系是：

```text
金额（美元） = quota / 500000
显示金额 = 金额（美元）× 站点汇率
```

例如 `quota = 1450` 对应 `0.0029` 美元。命中的缓存输入通常按更低的单价计费，具体单价以详情页为准。

:::tip
如果只需要 token 数量，不必调用日志接口：非流式响应的 `usage` 字段里就有；流式请求加上 `"stream_options": {"include_usage": true}`，最后一个 chunk 会带上 `usage`。实际扣费金额只能从日志获取。
:::

## 请求频率限制

### 控制台与接口的限制

| 场景                                                   | 计数维度         | 时间窗口 | 上限   |
| ------------------------------------------------------ | ---------------- | -------- | ------ |
| 控制台接口调用                                         | IP               | 180 秒   | 360 次 |
| 控制台页面浏览                                         | IP               | 180 秒   | 120 次 |
| 敏感操作（登录、注册、找回密码、支付、绑定邮箱或手机） | IP               | 1200 秒  | 20 次  |
| 敏感操作                                               | 账号，按操作类型 | 1200 秒  | 20 次  |
| 搜索（密钥、日志）                                     | 账号             | 60 秒    | 10 次  |
| 邮箱验证码                                             | IP               | 30 秒    | 2 次   |

几点说明：

- 以上为站点默认值，可能按运营需要调整，以实际返回为准。
- 日志查询的时间跨度最长 365 天，每页最多返回 100 条（默认 10 条）。
- 按 IP 计数的限制由同一网络出口下的所有人共享，例如同一个办公室或同一台云主机。

对话、向量、图像等模型接口按余额计费，不受上表的请求条数限制。API 密钥层面没有单独的每分钟请求配额；如果需要节流，请在自己的客户端控制。

### 触发限制时

请求会以 HTTP 429 被拒绝，并带有单位为秒的 `Retry-After` 响应头：

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 47
```

等待相应秒数后再重试；立即重试会继续消耗窗口额度并延长封禁时间。

```python
import time, requests

resp = requests.post(url, headers=headers, json=payload)
if resp.status_code == 429:
    time.sleep(int(resp.headers.get("Retry-After", 60)))
    resp = requests.post(url, headers=headers, json=payload)
```

如果怀疑某次请求被重复扣费，先在日志里确认是否有两条 `request_id` 相同的记录，如有请携带该标识联系站点管理员。
