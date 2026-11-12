---
title: 模型与价格
description: 通过接口获取可用模型列表和公开价格。
---

## 模型列表

`GET /v1/models`

返回当前 API 密钥可以调用的模型：

```bash
curl {{BASE_URL}}/v1/models \
  -H "Authorization: Bearer YOUR_API_KEY"
```

接口会根据请求头自动返回对应格式：

| 请求头                            | 返回格式       |
| --------------------------------- | -------------- |
| `Authorization: Bearer ...`       | OpenAI 格式    |
| `x-api-key` + `anthropic-version` | Anthropic 格式 |
| `x-goog-api-key` 或 `?key=`       | Gemini 格式    |

查询单个模型：`GET /v1/models/{model}`。

## 价格

`GET /api/pricing`

返回全部模型的公开价格信息，[模型广场](/pricing) 页面也使用这个接口。无需 API 密钥；如果站点设置了登录后才能查看模型广场，则需要先登录。

```bash
curl {{BASE_URL}}/api/pricing
```

`data` 数组中每个模型的主要字段：

| 字段               | 说明                                     |
| ------------------ | ---------------------------------------- |
| `model_name`       | 模型名称                                 |
| `quota_type`       | 计费方式：`0` 为按量计费，`1` 为按次计费 |
| `model_ratio`      | 模型倍率（按量计费时使用）               |
| `completion_ratio` | 输出相对输入的价格倍数                   |
| `model_price`      | 单次价格（按次计费时使用）               |
| `enable_groups`    | 可以使用该模型的分组                     |

:::tip
直接在 [模型广场](/pricing) 查看会更直观：页面已经把倍率换算成了每百万 token 的价格，并可以按分组筛选。
:::
